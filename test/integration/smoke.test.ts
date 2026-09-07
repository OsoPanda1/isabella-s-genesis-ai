import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * SMOKE DE DESPLIEGUE (test/integration/smoke.test.ts)
 * -----------------------------------------------------------------
 * Verificaciones estáticas rápidas de que el artefacto es desplegable:
 * árbol de rutas con endpoints críticos, autoridades completas,
 * toolchain canónica y matriz de capabilities verificada.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("smoke de despliegue", () => {
  it("el árbol de rutas expone los endpoints críticos", () => {
    const tree = readFileSync(resolve(root, "src/routeTree.gen.ts"), "utf8");
    for (const route of ["/api/isabella", "/api/billing", "/api/health", "/api/db", "/api/catalog"]) {
      expect(tree.includes(route), `ruta ausente en árbol: ${route}`).toBe(true);
    }
  });

  it("las 6 autoridades de producción están definidas", async () => {
    const { PRODUCTION_AUTHORITIES } = await import("@/lib/production-authority");
    expect(PRODUCTION_AUTHORITIES).toHaveLength(6);
  });

  it("toolchain canónica: packageManager pnpm 10 y workflows sin pnpm 11", () => {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
      packageManager?: string;
      engines?: { node?: string };
    };
    expect(pkg.packageManager).toMatch(/^pnpm@10\./);
    expect(pkg.engines?.node).toBe(">=22");
    for (const workflow of ["ci.yml", "release.yml", "security.yml"]) {
      const content = readFileSync(resolve(root, `.github/workflows/${workflow}`), "utf8");
      expect(content.includes("version: 11"), `${workflow} usa pnpm 11`).toBe(false);
    }
  });

  it("la matriz de capabilities está generada y verificada", () => {
    const matrix = resolve(root, "docs/operations/CAPABILITY_MATRIX.md");
    expect(existsSync(matrix)).toBe(true);
    const content = readFileSync(matrix, "utf8");
    expect(content.includes("Payment full-loop")).toBe(true);
    expect(content.includes("manual")).toBe(true);
  });

  it("migraciones RLS de economic_contract existen", () => {
    expect(existsSync(resolve(root, "supabase/migrations/20260906090000_economic_contract_rls.sql"))).toBe(true);
  });
});
