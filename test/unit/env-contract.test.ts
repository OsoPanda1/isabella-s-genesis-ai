import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * CONTRATO DE ENTORNO (test/unit/env-contract.test.ts)
 * -----------------------------------------------------------------
 * Regla P0: una variable solo existe si schema + .env.example +
 * uso real están alineados, y `process.env` directo solo vive en
 * los módulos autorizados (config, build-manifest con parámetro,
 * generados, scripts).
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function schemaKeys(): string[] {
  const source = readFileSync(join(root, "src/lib/env-schema.ts"), "utf8");
  const keys = new Set<string>();
  for (const match of source.matchAll(/^  ([A-Z][A-Z0-9_]+):/gm)) keys.add(match[1]);
  return [...keys];
}

function exampleKeys(): Set<string> {
  const example = readFileSync(join(root, ".env.example"), "utf8");
  return new Set(
    example
      .split("\n")
      .map((line) => line.split("=")[0].trim())
      .filter((key) => key.length > 0 && !key.startsWith("#")),
  );
}

const PROCESS_ENV_ALLOWLIST = new Set([
  "src/lib/config.ts", // única vía de carga
  "src/lib/build-manifest.ts", // computeEnvFingerprint(env = process.env)
]);

// Variables de SISTEMA OPERATIVO (no secreto de app): PATH/HOME/SHELL/NODE_ENV/etc.
// Nunca credenciales ni modo de ejecución; se permiten solo esas.
const OS_ENV_ALLOWLIST = new Set(["PATH", "HOME", "SHELL", "TERM", "TZ", "LANG", "LC_ALL", "NODE_ENV"]);

describe("contrato de entorno", () => {
  it("toda clave del schema está documentada en .env.example", () => {
    const example = exampleKeys();
    const missing = schemaKeys().filter((key) => !example.has(key));
    expect(missing, `claves sin documentar: ${missing.join(", ")}`).toEqual([]);
  });

  it("process.env directo solo en módulos autorizados", () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "generated") continue;
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const content = readFileSync(full, "utf8");
        if (!content.includes("process.env")) continue;
        const relative = full.slice(root.length + 1).replace(/\\/g, "/");
        if (PROCESS_ENV_ALLOWLIST.has(relative)) continue;
        const lines = content.split("\n").filter((line) => line.includes("process.env"));
        const realReads = lines.filter((line) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*")) return false;
          const names = [...trimmed.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]);
          // Solo se toleran vars de SO en la allowlist; cualquier otra es deriva.
          return names.some((name) => !OS_ENV_ALLOWLIST.has(name));
        });
        if (realReads.length > 0)
          offenders.push(`${relative}: ${realReads[0].trim().slice(0, 80)}`);
      }
    };
    walk(join(root, "src"));
    expect(offenders, `lecturas directas: ${offenders.join(" | ")}`).toEqual([]);
  });
});
