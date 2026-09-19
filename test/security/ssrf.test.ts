import { describe, it, expect } from "vitest";

/**
 * EGRESS ALLOWLIST (test/security/ssrf.test.ts)
 * -----------------------------------------------------------------
 * Anti-SSRF real: solo HTTPS al host Gemini (y VOICE_API_URL
 * configurada). Todo lo demás se rechaza ANTES del fetch.
 */

import { SecuritySystem } from "@/lib/security";

describe("allowlist de egress server-side", () => {
  it("permite el upstream de inferencia", () => {
    expect(
      SecuritySystem.isUpstreamAllowed(
        "https://generativelanguage.googleapis.com/v1beta/models/x:generate",
      ),
    ).toBe(true);
  });

  it("rechaza http, credenciales, hosts ajenos e IPs", () => {
    expect(SecuritySystem.isUpstreamAllowed("http://generativelanguage.googleapis.com/x")).toBe(
      false,
    );
    expect(
      SecuritySystem.isUpstreamAllowed("https://user:pass@generativelanguage.googleapis.com/x"),
    ).toBe(false);
    expect(SecuritySystem.isUpstreamAllowed("https://evil.example.com/hook")).toBe(false);
    expect(SecuritySystem.isUpstreamAllowed("https://169.254.169.254/latest/meta-data")).toBe(
      false,
    );
    expect(SecuritySystem.isUpstreamAllowed("https://127.0.0.1:3000/api/db")).toBe(false);
    expect(SecuritySystem.isUpstreamAllowed("not-a-url")).toBe(false);
    expect(SecuritySystem.isUpstreamAllowed("file:///etc/passwd")).toBe(false);
  });

  it("fetchSafeUpstream lanza antes de red en host no autorizado", async () => {
    await expect(
      SecuritySystem.fetchSafeUpstream("https://evil.example.com/x", {}),
    ).rejects.toThrow(/no autorizado/i);
  });
});
