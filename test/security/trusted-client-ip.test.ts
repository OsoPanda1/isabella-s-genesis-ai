import { describe, expect, it, vi, afterEach } from "vitest";

const configMock = vi.hoisted(() => ({
  config: vi.fn(() => ({ TRUSTED_PROXY_MODE: "vercel" })),
}));

vi.mock("@/lib/config", () => configMock);

import { resolveTrustedClientIp } from "@/lib/trusted-client-ip";

afterEach(() => vi.clearAllMocks());

describe("trusted client IP resolution", () => {
  it("accepts Vercel's explicit forwarding header only in vercel mode", () => {
    const request = new Request("https://isabella.invalid", {
      headers: {
        "x-vercel-forwarded-for": "203.0.113.10, 10.0.0.1",
        "x-forwarded-for": "198.51.100.99",
      },
    });
    expect(resolveTrustedClientIp(request)).toBe("203.0.113.10");
  });

  it("rejects generic X-Forwarded-For spoofing", () => {
    const request = new Request("https://isabella.invalid", {
      headers: { "x-forwarded-for": "198.51.100.99" },
    });
    expect(resolveTrustedClientIp(request)).toBe("unknown");
  });

  it("rejects malformed proxy values", () => {
    const request = new Request("https://isabella.invalid", {
      headers: { "x-vercel-forwarded-for": "not-an-ip" },
    });
    expect(resolveTrustedClientIp(request)).toBe("unknown");
  });

  it("fails closed for the legacy boolean proxy mode", () => {
    configMock.config.mockReturnValue({ TRUSTED_PROXY_MODE: "true" });
    const request = new Request("https://isabella.invalid", {
      headers: {
        "x-forwarded-for": "203.0.113.10",
        "cf-connecting-ip": "198.51.100.10",
      },
    });
    expect(resolveTrustedClientIp(request)).toBe("unknown");
  });
});
