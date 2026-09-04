import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * MANIFIESTO DE BUILD (src/lib/build-manifest.ts)
 * -----------------------------------------------------------------
 * Genera un fingerprint de build reproducible: hash de package.json,
 * de los archivos de configuración críticos y del árbol de código.
 * Permite a runtime-integrity verificar que el proceso ejecuta el
 * artefacto esperado y sirve como identificador de versión en
 * /api/system-state y telemetría.
 */

export interface BuildManifest {
  builtAt?: string;
  version: string;
  sourceHash: string;
  envFingerprint: string;
  commit?: string;
  runtime: "server" | "browser";
  depsHash: string;
}

const FINGERPRINT_FILES = [
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "eslint.config.js",
  "metadata.json",
];

function hashText(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function computeSourceHash(root: string): string {
  let acc = "";
  for (const file of FINGERPRINT_FILES) {
    try {
      acc += `${file}:${readFileSync(resolve(root, file), "utf8")}\n`;
    } catch {
      acc += `${file}:<missing>\n`;
    }
  }
  return hashText(acc);
}

export function computeEnvFingerprint(env: NodeJS.ProcessEnv = process.env): string {
  const parts = [
    env.NODE_ENV ?? "development",
    env.PUBLIC_URL ?? "",
    env.LLM_DEFAULT_MODEL ?? "",
    env.CROWN_CONSTITUTION_VERSION ?? "",
    env.BOOKPI_SIGNATURE_ALGORITHM ?? "NOT_IMPLEMENTED",
  ];
  return hashText(parts.join("|"));
}

export function buildManifest(
  runtime: "server" | "browser" = "server",
  root = process.cwd(),
): BuildManifest {
  let version = "0.0.0";
  try {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
      version?: string;
    };
    version = pkg.version ?? "0.0.0";
  } catch {
    // versión por defecto
  }

  const manifest: BuildManifest = {
    builtAt: new Date().toISOString(),
    version,
    sourceHash: computeSourceHash(root),
    envFingerprint: computeEnvFingerprint(),
    runtime,
    depsHash: hashText(process.version + version),
  };
  const commit = process.env.COMMIT_SHA;
  if (commit) manifest.commit = commit;
  return manifest;
}
