import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { createRequestContext, withRequestContext, getRequestContext } from "./lib/request-context";
import { redact } from "./lib/secret-redactor";
import { assertBodyWithinLimits, LimitError } from "./lib/input-limits";
import { ensureRuntimeReady } from "./lib/runtime-integrity";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
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
    headers: { "content-type": "text/html; charset=utf-8" },
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

// Seguridad: headers OWASP mínimos que deben estar presentes en toda respuesta.
// El CSP estricto se habilita primero en Report-Only: TanStack Start todavía
// emite bootstrap inline sin nonce. El header aplicado mantiene compatibilidad,
// mientras las violaciones recolectadas impiden afirmar que ya existe un CSP
// estricto en producción.
export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  const setIfMissing = (name: string, value: string) => {
    if (!headers.has(name)) headers.set(name, value);
  };
  setIfMissing("X-Content-Type-Options", "nosniff");
  setIfMissing("X-Frame-Options", "DENY");
  setIfMissing("Referrer-Policy", "strict-origin-when-cross-origin");
  // Modern standard: disable the legacy XSS auditor to avoid filter bypass exploits, relying strictly on strong CSP
  setIfMissing("X-XSS-Protection", "0");
  setIfMissing("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  setIfMissing("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  setIfMissing("Cross-Origin-Opener-Policy", "same-origin");
  setIfMissing("Cross-Origin-Resource-Policy", "same-origin");
  setIfMissing(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "style-src 'self'",
      // TanStack Start emits the serialized hydration bootstrap inline; without it
      // the browser cannot find window.$_TSR and the app remains blank.
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self' https://generativelanguage.googleapis.com https://*.supabase.co https://*.neon.tech",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  );
  setIfMissing(
    "Content-Security-Policy-Report-Only",
    [
      "default-src 'self'",
      "script-src 'self' 'nonce-{REQUEST_NONCE}'",
      "style-src 'self' 'nonce-{STYLE_NONCE}'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function fetchWithRequestChain(
  request: Request,
  env: unknown,
  ctx: unknown,
): Promise<Response> {
  const url = new URL(request.url);

  // 1. CORRELACIÓN — contexto único por request
  const requestContext = createRequestContext({
    method: request.method,
    path: url.pathname,
    clientIp:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown",
  });
  void requestContext;

  return withRequestContext(requestContext, async () => {
    // 2. VALIDACIÓN DE ENTRADA — límite de body en la frontera
    if (request.method === "POST" || request.method === "PUT" || request.method === "PATCH") {
      const contentLength = Number(request.headers.get("content-length") ?? "0");
      try {
        if (contentLength > 0) assertBodyWithinLimits(contentLength);
      } catch (error) {
        if (error instanceof LimitError) {
          return new Response(
            JSON.stringify({ error: { code: error.code, message: error.message } }),
            { status: 413, headers: { "content-type": "application/json" } },
          );
        }
        throw error;
      }
    }

    // Verifica integridad del runtime (no aborta en desarrollo, solo informa)
    void ensureRuntimeReady(false);

    // Refresh bounded by a short TTL and de-duplicated across concurrent
    // requests; destructive paths still force a fresh hydrate themselves.
    const { SovereignDB } = await import("./lib/sovereign-engine");
    await SovereignDB.hydrate({ maxAgeMs: 5_000 });

    // 3. HANDLER — delega al router SSR
    const handler = await getServerEntry();
    const response = await handler.fetch(request, env, ctx);
    return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response));
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      return await fetchWithRequestChain(request, env, ctx);
    } catch (error) {
      const traceId = getRequestContext()?.traceId ?? "no-trace";
      console.error(
        redact(
          `[${traceId}] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
        ),
      );
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
