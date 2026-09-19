// @ts-nocheck — interop con script .mjs sin tipos (verificado por sus propios tests).
import { describe, it, expect } from "vitest";

/**
 * Client env guard (test/unit/client-env.test.ts)
 * -----------------------------------------------------------------
 * Ningún secreto con prefijo VITE_* debe llegar al bundle del navegador.
 */

import { auditClientEnv } from "../../scripts/check-client-env.mjs";

describe("client env guard", () => {
  it("falla ante claves con prefijo VITE_*", () => {
    const { errors } = auditClientEnv({
      VITE_STATSIG_CLIENT_KEY: "sk-test",
      PATH: "/usr/bin",
    } as NodeJS.ProcessEnv);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(" ")).toMatch(/VITE_STATSIG_CLIENT_KEY/);
  });

  it("falla ante patrones de secreto (SECRET/PRIVATE/SIGNING)", () => {
    const { errors } = auditClientEnv({
      VITE_API_SECRET: "x",
      VITE_PRIVATE_TOKEN: "y",
    } as NodeJS.ProcessEnv);
    expect(errors).toHaveLength(2);
  });

  it("advierte (sin fallar) ante VITE_* públicas no declaradas", () => {
    const { errors, warnings } = auditClientEnv({
      VITE_PUBLIC_APP_URL: "https://x.example",
    } as NodeJS.ProcessEnv);
    expect(errors).toHaveLength(0);
    expect(warnings.join(" ")).toMatch(/VITE_PUBLIC_APP_URL/);
  });

  it("entorno limpio pasa sin errores ni warnings", () => {
    const { errors, warnings } = auditClientEnv({
      PATH: "/usr/bin",
    } as NodeJS.ProcessEnv);
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it("silencia vars de sistema VITE_VERCEL_* (plataforma, no operador)", () => {
    const { errors, warnings } = auditClientEnv({
      VITE_VERCEL_URL: "x.vercel.app",
      VITE_VERCEL_ENV: "production",
    } as NodeJS.ProcessEnv);
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });
});
