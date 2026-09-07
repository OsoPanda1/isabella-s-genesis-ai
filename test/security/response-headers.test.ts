import { describe, expect, it } from "vitest";

import { withSecurityHeaders } from "@/server";

describe("security response headers", () => {
  it("applies the closed-beta browser isolation baseline", () => {
    const response = withSecurityHeaders(new Response("ok"));

    expect(response.headers.get("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
    expect(response.headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
    expect(response.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("keeps strict CSP in report-only mode until nonces are wired", () => {
    const response = withSecurityHeaders(new Response("ok"));
    const csp = response.headers.get("Content-Security-Policy") ?? "";
    const reportOnly = response.headers.get("Content-Security-Policy-Report-Only") ?? "";

    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(reportOnly).toContain("script-src 'self' 'nonce-{REQUEST_NONCE}'");
    expect(reportOnly).not.toContain("unsafe-inline");
  });
});
