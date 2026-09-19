import "./lib/error-capture";

import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { createRequestContext, withRequestContext } from "./lib/request-context";
import { redact } from "./lib/secret-redactor";
import { resolveTrustedClientIp } from "./lib/trusted-client-ip";
import { validateStartupEnvironment } from "./lib/env-validator";
import { initOpenTelemetry, withSpan, recordMetric } from "./lib/telemetry/otel-init";

const envCheck = validateStartupEnvironment();
if (!envCheck.valid && (envCheck.mode === "production" || envCheck.mode === "staging")) {
  console.error(
    "[C.R.O.W.N. Startup Gate] Fallo crítico de validación de entorno:",
    envCheck.criticalMissing,
  );
}
initOpenTelemetry();

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const clientIp = resolveTrustedClientIp(request);
  const requestContext = createRequestContext({
    clientIp,
    method: request.method,
    path: url.pathname,
  });

  const sanitizedHeaders = new Headers(request.headers);
  for (const header of [
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-real-ip",
    "cf-connecting-ip",
    "x-vercel-forwarded-for",
  ]) {
    sanitizedHeaders.delete(header);
  }
  if (clientIp !== "unknown") sanitizedHeaders.set("x-real-ip", clientIp);

  let sanitizedRequest: Request;
  try {
    sanitizedRequest = new Request(request, { headers: sanitizedHeaders });
  } catch {
    const init: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers: sanitizedHeaders,
      signal: request.signal,
    };
    if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
      init.body = request.body;
      init.duplex = "half";
    }
    sanitizedRequest = new Request(request.url, init as RequestInit);
  }

  return withRequestContext(requestContext, () =>
    withSpan(
      `HTTP ${request.method} ${url.pathname}`,
      async () => {
        try {
          const response = await handler.fetch(sanitizedRequest);

          recordMetric({
            name: "http.server.requests",
            value: 1,
            unit: "1",
            attributes: {
              method: request.method,
              status: response.status,
              path: url.pathname,
            },
          });

          return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response));
        } catch (error) {
          const captured = consumeLastCapturedError();
          const err = captured ?? error;
          console.error(redact(err instanceof Error ? (err.stack ?? err.message) : String(err)));

          recordMetric({
            name: "http.server.errors",
            value: 1,
            unit: "1",
            attributes: {
              method: request.method,
              status: 500,
              path: url.pathname,
            },
          });

          return withSecurityHeaders(
            new Response(renderErrorPage(), {
              status: 500,
              headers: {
                "content-type": "text/html; charset=utf-8",
                "cache-control": "no-store",
              },
            }),
          );
        }
      },
      {
        kind: "SERVER",
        attributes: {
          "http.method": request.method,
          "http.target": url.pathname,
          "client.ip": clientIp,
        },
      },
    ),
  );
}

export default createServerEntry({ fetch: handleRequest });

async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  const err = consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`);
  console.error(redact(err instanceof Error ? (err.stack ?? err.message) : String(err)));

  return new Response(renderErrorPage(), {
    status: 500,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  const setIfMissing = (name: string, value: string) => {
    if (!headers.has(name)) headers.set(name, value);
  };

  setIfMissing("X-Content-Type-Options", "nosniff");
  setIfMissing("X-Frame-Options", "DENY");
  setIfMissing("Referrer-Policy", "strict-origin-when-cross-origin");
  setIfMissing("X-XSS-Protection", "0");
  setIfMissing("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  setIfMissing("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  setIfMissing("Cross-Origin-Opener-Policy", "same-origin");
  setIfMissing("Cross-Origin-Resource-Policy", "same-origin");

  const production = process.env.NODE_ENV === "production";
  const scriptSource = production ? "'self'" : "'self' 'unsafe-inline'";
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "upgrade-insecure-requests",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https://generativelanguage.googleapis.com https://api.groq.com https://api.x.ai https://api.stripe.com https://stream.mux.com https://*.supabase.co",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSource}`,
    "worker-src 'self' blob:",
  ].join("; ");

  setIfMissing("Content-Security-Policy", csp);
  if (production) headers.delete("Content-Security-Policy-Report-Only");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
