import { vi, beforeEach } from "vitest";
import { describe, expect, it } from "vitest";
import { runNativeComprehension } from "@/lib/native-comprehension";

describe("native comprehension conectada al runtime", () => {
  beforeEach(async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("NODE_ENV", "development");
    const { resetConfigCache } = await import("@/lib/config");
    resetConfigCache();
  });
  it("produce comprensión determinista con resumen auditable", () => {
    const result = runNativeComprehension({
      input: "¿Cuál es el estado del patrimonio documentado de Real del Monte?",
      tenantId: "t-test",
      traceId: "trace-1",
    });
    expect(result.ok).toBe(true);
    expect(result.id).toBeTruthy();
    expect(result.chainHash).toHaveLength(64);
    expect(result.intent.detected).toBeTypeOf("string");
    expect(result.inferenceMode).toBe("NATIVE_DECLARED");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("marca riesgo sin persistir cuando detecta dato personal", () => {
    const result = runNativeComprehension({
      input: "cuenta de correo ana@example.com para seguimiento",
      tenantId: "t-test",
      traceId: "trace-2",
    });
    expect(result.riskDetected).toBe(true);
    expect(result.chainHash).toHaveLength(64);
  });

  it("respeta el ciclo de vida del tenant y el trace", () => {
    const a = runNativeComprehension({
      input: "hola",
      tenantId: "t-a",
      traceId: "trace-a",
    });
    const b = runNativeComprehension({
      input: "hola",
      tenantId: "t-b",
      traceId: "trace-b",
    });
    expect(a.id).not.toBe(b.id);
    expect(a.intent.detected).toBe(b.intent.detected);
  });
});
