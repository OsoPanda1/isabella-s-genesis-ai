import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POLÍTICA DE INFERENCIA + PRODUCTION AUTHORITY
 * (test/unit/inference-authority.test.ts)
 * -----------------------------------------------------------------
 * PRODUCTION_NORMAL → proveedor real o FALLO explícito. El fallback
 * nativo jamás sustituye inferencia en producción.
 */

describe("política de inferencia", () => {
  it("con proveedor opera normal sin degradación", async () => {
    const { resolveInferencePolicy } = await import("@/lib/inference-policy");
    const decision = resolveInferencePolicy({ productionLike: true, hasProvider: true });
    expect(decision.mode).toBe("PRODUCTION_NORMAL");
    expect(decision.degraded).toBe(false);
    expect(decision.httpStatus).toBe(200);
  });

  it("sin proveedor en producción falla a mantenimiento 503", async () => {
    const { resolveInferencePolicy } = await import("@/lib/inference-policy");
    const decision = resolveInferencePolicy({ productionLike: true, hasProvider: false });
    expect(decision.mode).toBe("MAINTENANCE");
    expect(decision.httpStatus).toBe(503);
    expect(decision.errorCode).toBe("inference_unavailable");
    expect(decision.provider).toBe("none");
  });

  it("sin proveedor en desarrollo declara nativo (no finge LLM)", async () => {
    const { resolveInferencePolicy } = await import("@/lib/inference-policy");
    const decision = resolveInferencePolicy({ productionLike: false, hasProvider: false });
    expect(decision.mode).toBe("NATIVE_DECLARED");
    expect(decision.provider).toBe("native-fallback");
    expect(decision.degraded).toBe(true);
    expect(decision.httpStatus).toBe(200);
  });

  it("upstream caído en producción es mantenimiento, en dev es nativo declarado", async () => {
    const { resolveUpstreamFailure } = await import("@/lib/inference-policy");
    const prod = resolveUpstreamFailure({ productionLike: true });
    expect(prod.mode).toBe("MAINTENANCE");
    expect(prod.httpStatus).toBe(503);
    const dev = resolveUpstreamFailure({ productionLike: false });
    expect(dev.mode).toBe("NATIVE_DECLARED");
    expect(dev.degraded).toBe(true);
  });
});

describe("production authority (6 autoridades)", () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    const { resetConfigCache } = await import("@/lib/config");
    resetConfigCache();
  });

  it("define exactamente 6 autoridades sin ambigüedad de proveedor", async () => {
    const { PRODUCTION_AUTHORITIES } = await import("@/lib/production-authority");
    const ids = PRODUCTION_AUTHORITIES.map((authority) => authority.id).sort();
    expect(ids).toEqual(["audit", "database", "identity", "inference", "observability", "payment"]);
    for (const authority of PRODUCTION_AUTHORITIES) {
      expect(authority.authority.length).toBeGreaterThan(0);
      expect(authority.implementations.length).toBeGreaterThan(0);
    }
  });

  it("en desarrollo no aborta aunque falten secretos", async () => {
    const { assertProductionAuthorities } = await import("@/lib/production-authority");
    const report = assertProductionAuthorities();
    expect(report.productionLike).toBe(false);
    expect(report.criticalFailed).toBe(false);
  });

  it("en producción sin secretos aborta (fail-fast de config o autoridad)", async () => {
    vi.stubEnv("ISABELLA_RUNTIME_MODE", "production");
    vi.stubEnv("NODE_ENV", "production");
    const { resetConfigCache } = await import("@/lib/config");
    resetConfigCache();
    const { assertProductionAuthorities } = await import("@/lib/production-authority");
    // Falla primero el fail-fast de configuración; la autoridad es 2ª capa.
    expect(() => assertProductionAuthorities()).toThrow(/Fail-Fast|Autoridades críticas/);
    vi.unstubAllEnvs();
    resetConfigCache();
  });

  it("en producción completa no aborta y todo está ok", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ISABELLA_RUNTIME_MODE", "production");
    vi.stubEnv("PUBLIC_URL", "https://isabella.example.com");
    vi.stubEnv("SUPABASE_URL", "https://xyz.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "anon-key-value");
    vi.stubEnv("AUTH_JWT_SECRET", "0123456789abcdef0123456789abcdef");
    vi.stubEnv("GEMINI_API_KEY", "gemini-key");
    vi.stubEnv("ENCRYPTION_MASTER_KEY", "0123456789abcdef0123456789abcdef");
    vi.stubEnv("CROWN_POLICY_SIGNING_KEY", "crown-key");
    vi.stubEnv("AEGIS_AUDIT_SECRET", "0123456789abcdef0123456789abcdef");
    vi.stubEnv("BOOKPI_SIGNING_KEY", "0123456789abcdef0123456789abcdef");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_1234567890abcdef");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_1234567890");
    const { resetConfigCache } = await import("@/lib/config");
    resetConfigCache();
    const { assertProductionAuthorities } = await import("@/lib/production-authority");
    const report = assertProductionAuthorities();
    expect(report.productionLike).toBe(true);
    expect(report.criticalFailed).toBe(false);
    expect(report.authorities.every((authority) => authority.ok)).toBe(true);
    vi.unstubAllEnvs();
    resetConfigCache();
  });
});
