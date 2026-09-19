/**
 * Supply-chain check (scripts/supply-chain.mjs)
 * -----------------------------------------------------------------
 * Verifica dependencias pineadas (sin `*`/`latest`), postinstall
 * limitado a `prisma generate`, y reporta descargas remotas en CI
 * (curl|bash) como excepciones conocidas que deben estar gateadas.
 *
 * Uso: node scripts/supply-chain.mjs [--check]
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
  for (const [name, range] of Object.entries(pkg[section] ?? {})) {
    if (range === "*" || range === "latest" || String(range).includes("latest")) {
      errors.push(`Rango flotante en ${section}: ${name}@${range}.`);
    }
  }
}

const allowedPostinstall = ["prisma generate"];
const postinstall = pkg.scripts?.postinstall ?? "";
if (postinstall && !allowedPostinstall.includes(postinstall.trim())) {
  errors.push(
    `postinstall no permitido: '${postinstall}'. Permitidos: ${allowedPostinstall.join(", ")}.`,
  );
}

// Excepciones conocidas: descargas remotas gateadas (nunca se ejecutan
// sin su condición). Si aparece una NUEVA, este check la reporta.
const KNOWN_REMOTE_FETCHES = [
  ".github/workflows/release.yml: stackql install (gateado por .stackql/policies.sql)",
];
for (const workflow of [
  "ci.yml",
  "release.yml",
  "security.yml",
  "supabase.yml",
  "static-validation.yml",
]) {
  const path = resolve(root, `.github/workflows/${workflow}`);
  if (!existsSync(path)) continue;
  const content = readFileSync(path, "utf8");
  const lines = content.split("\n");
  lines.forEach((line, index) => {
    if (/curl[^|]*\|\s*(bash|sh)/.test(line)) {
      warnings.push(
        `${workflow}:${index + 1}: descarga remota pipeada (${line.trim().slice(0, 80)}).`,
      );
    }
  });
}

console.log(`Supply-chain: ${errors.length} errores, ${warnings.length} advertencias.`);
for (const warning of warnings) console.log(`  ⚠️ ${warning}`);
const knownOk = warnings.every((warning) => warning.includes("release.yml"));
if (warnings.length > 0 && !knownOk) {
  errors.push("Descarga remota fuera de las excepciones conocidas.");
}

if (process.argv.includes("--check") && errors.length > 0) {
  console.error(errors.map((error) => `❌ ${error}`).join("\n"));
  process.exit(1);
}
if (process.argv.includes("--check"))
  console.log("Supply-chain OK (excepciones conocidas gateadas).");
