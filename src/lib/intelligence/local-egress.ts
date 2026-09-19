/**
 * Dedicated egress guard for self-hosted model runtimes.
 * Only explicit loopback endpoints are permitted. This does not weaken the
 * global Internet egress allowlist.
 */
export function isLocalModelUrlAllowed(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    if (parsed.username || parsed.password) return false;
    return (
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "::1"
    );
  } catch {
    return false;
  }
}

export async function fetchSafeLocalModel(url: string, options: RequestInit): Promise<Response> {
  if (!isLocalModelUrlAllowed(url)) {
    throw new Error(`[LocalModelEgress] Endpoint no autorizado: ${url}`);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(url, {
      ...options,
      signal: options.signal ?? controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
