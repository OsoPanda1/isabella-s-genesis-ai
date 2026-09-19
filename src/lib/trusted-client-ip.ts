import { isIP } from "node:net";
import { config } from "./config";

/**
 * Resolución de IP con contrato explícito de proxy.
 *
 * TRUSTED_PROXY_MODE:
 *   - vercel: solo x-vercel-forwarded-for
 *   - cloudflare: solo cf-connecting-ip
 *   - generic: solo x-real-ip (el reverse proxy DEBE sobrescribirlo)
 *   - cualquier otro valor, incluido el legacy "true": fail-closed
 *
 * No se acepta X-Forwarded-For genérico porque el Request API no expone
 * de forma portable la dirección del socket remoto con la que podríamos
 * verificar la identidad del proxy.
 */
export function resolveTrustedClientIp(request: Request): string {
  let mode = "";
  try {
    mode = String(config().TRUSTED_PROXY_MODE ?? "")
      .trim()
      .toLowerCase();
  } catch {
    return "unknown";
  }

  const candidate = (() => {
    if (mode === "vercel") {
      return request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
    }
    if (mode === "cloudflare") {
      return request.headers.get("cf-connecting-ip")?.trim();
    }
    if (mode === "generic") {
      return request.headers.get("x-real-ip")?.trim();
    }
    return undefined;
  })();

  if (candidate && isIP(candidate) !== 0) return candidate;
  return "unknown";
}
