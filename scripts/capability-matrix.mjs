/**
 * Matriz de capabilities (scripts/capability-matrix.mjs)
 * -----------------------------------------------------------------
 * documentation ≠ implementation evidence. Cada capability crítica
 * declara: archivos fuente, archivos de test, evidencia de runtime y
 * estado de producción. El script verifica que los archivos existen;
 * el estado lo determina el humano con evidencia (tests verdes aquí,
 * gateados por DB donde aplica).
 *
 * Uso: node scripts/capability-matrix.mjs [--check]
 *   --check  → exit 1 si falta algún archivo declarado.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PRODUCTION_CAPABILITIES_PATH = resolve(root, "production-capabilities.json");
const CAPABILITY_STATUSES = new Set([
  "verified",
  "experimental",
  "simulated",
  "shadow",
  "planned",
  "unavailable",
]);

function validateProductionCapabilities() {
  const errors = [];

  if (!existsSync(PRODUCTION_CAPABILITIES_PATH)) {
    return ["Falta production-capabilities.json."];
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(PRODUCTION_CAPABILITIES_PATH, "utf8"));
  } catch (error) {
    return [`production-capabilities.json no contiene JSON válido: ${error.message}`];
  }

  if (typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    errors.push("El manifiesto debe declarar version semántica.");
  }
  if (!["development", "staging", "production"].includes(manifest.environment)) {
    errors.push("El manifiesto debe declarar un environment permitido.");
  }
  if (!Array.isArray(manifest.capabilities) || manifest.capabilities.length === 0) {
    errors.push("El manifiesto debe declarar al menos una capability.");
    return errors;
  }

  const names = new Set();
  for (const [index, capability] of manifest.capabilities.entries()) {
    const label = `capabilities[${index}]`;
    if (!capability || typeof capability !== "object") {
      errors.push(`${label} debe ser un objeto.`);
      continue;
    }
    if (typeof capability.name !== "string" || !/^[a-z0-9_]+$/.test(capability.name)) {
      errors.push(`${label}.name debe usar minúsculas, números y guiones bajos.`);
    } else if (names.has(capability.name)) {
      errors.push(`${label}.name está duplicado: ${capability.name}.`);
    } else {
      names.add(capability.name);
    }
    if (!CAPABILITY_STATUSES.has(capability.status)) {
      errors.push(`${label}.status no pertenece a la taxonomía permitida.`);
    }
    for (const field of ["provider", "version", "verification_method"]) {
      if (typeof capability[field] !== "string" || capability[field].trim() === "") {
        errors.push(`${label}.${field} debe ser texto no vacío.`);
      }
    }
    if (capability.status === "verified") {
      if (
        typeof capability.last_verified !== "string" ||
        Number.isNaN(Date.parse(capability.last_verified))
      ) {
        errors.push(`${label}.last_verified debe ser una fecha ISO válida para estado verified.`);
      }
    } else if (capability.last_verified !== null) {
      errors.push(`${label}.last_verified debe ser null cuando el estado no es verified.`);
    }
  }

  return errors;
}

const CAPABILITIES = [
  {
    capability: "PDP authorization (RBAC+ABAC)",
    sources: [
      "src/lib/authorization.ts",
      "src/lib/rbac.ts",
      "src/lib/permission-matrix.ts",
      "src/lib/abac.ts",
    ],
    tests: ["test/unit/pdp-real.test.ts"],
    runtime: "Decisiones firmadas ECDSA P-384 con motivo deny-*; 11 tests verdes.",
    status: "real",
  },
  {
    capability: "Audit seal HMAC-SHA3-512",
    sources: ["src/lib/sovereign-audit.ts"],
    tests: ["test/unit/pdp-real.test.ts"],
    runtime: "Roundtrip + rechazo de manipulados; ML-DSA declarado SIMULATION-ONLY.",
    status: "real",
  },
  {
    capability: "AEGIS semantic engine",
    sources: ["src/lib/aegis-semantic.ts", "src/lib/latam-aegis-x.ts"],
    tests: ["test/security/aegis-adversarial.test.ts"],
    runtime: "7 detectores + scoring noisy-or integrados al firewall; 37 casos verdes.",
    status: "real",
  },
  {
    capability: "Execution authority (Decide→…→Audit)",
    sources: ["src/lib/execution-authority.ts", "src/lib/sovereign-pipeline.ts"],
    tests: ["test/integration/runtime-chain.test.ts"],
    runtime: "toolExecuted:true con evidencia; approvals de un solo uso; 5 tests verdes.",
    status: "real",
  },
  {
    capability: "Runtime integration chain",
    sources: ["src/lib/sovereign-pipeline.ts", "src/lib/memory-engine.ts"],
    tests: ["test/integration/runtime-chain.test.ts"],
    runtime: "PDP→CROWN→AEGIS→memory→audit con repos aislados; 5 tests verdes.",
    status: "real",
  },
  {
    capability: "OTel durable observability",
    sources: ["src/lib/otel-exporter.ts", "src/lib/latam-aegis-x.ts"],
    tests: ["test/unit/otel-exporter.test.ts"],
    runtime: "Lote OTLP válido contra collector local; migración probada; 4 tests verdes.",
    status: "real",
  },
  {
    capability: "CI ↔ production env parity",
    sources: [".github/workflows/ci.yml", ".github/workflows/release.yml", "src/lib/env-schema.ts"],
    tests: ["test/unit/ci-env-parity.test.ts"],
    runtime: "Conjunto exacto requiredEnvKeys(production); 2 tests verdes.",
    status: "real",
  },
  {
    capability: "Inference policy (fail-closed prod)",
    sources: ["src/lib/inference-policy.ts", "src/server-routes/api/isabella.ts"],
    tests: ["test/unit/inference-authority.test.ts"],
    runtime: "503 maintenance en prod sin proveedor; nativo declarado solo dev.",
    status: "real",
  },
  {
    capability: "Production authority (6 autoridades)",
    sources: ["src/lib/production-authority.ts"],
    tests: ["test/unit/inference-authority.test.ts"],
    runtime: "Abort en prod incompleta; ok con env completo; 3 tests verdes.",
    status: "real",
  },
  {
    capability: "Stripe webhook signature",
    sources: ["src/server-routes/api/billing.ts"],
    tests: ["test/bookpi/financial-evidence.test.ts"],
    runtime: "constructEvent real acepta/rechaza; sin red; 1 test verde.",
    status: "real",
  },
  {
    capability: "Financial concurrency (idempotencia, reconciliación, refund único)",
    sources: ["src/lib/economic-events.ts", "src/lib/repositories/bookpi-postgres-repository.ts"],
    tests: ["test/bookpi/financial-evidence.test.ts"],
    runtime: "Gateados por DB: se omiten sin TEST_DATABASE_URL; corren en staging/CI con PG.",
    status: "evidence-gated",
  },
  {
    capability: "Fraud review + payout guard + disputes",
    sources: ["src/lib/monetization/fraud-review.ts", "src/server-routes/api/billing.ts"],
    tests: ["test/unit/fraud-review.test.ts"],
    runtime:
      "Scoring, hold/decide un solo uso, doble aprobación, congelamiento por disputa; 12 tests verdes.",
    status: "real",
  },
  {
    capability: "Backup/restore PG (snapshot + manifiesto)",
    sources: ["scripts/db-backup.mjs", "scripts/db-restore.mjs", "scripts/db-snapshot-lib.mjs"],
    tests: ["test/unit/db-snapshot.test.ts"],
    runtime: "Manifiesto sha256 por tabla, restore aditivo ON CONFLICT DO NOTHING; 6 tests verdes.",
    status: "real",
  },
  {
    capability: "Approval ledger durable (consumo atómico)",
    sources: [
      "src/lib/repositories/approval-repository.ts",
      "supabase/migrations/20260907090000_approval_ledger.sql",
    ],
    tests: ["test/bookpi/approval-evidence.test.ts"],
    runtime: "Gateado por DB: SKIP LOCKED un ganador; grant idempotente. Corre con PG.",
    status: "evidence-gated",
  },
  {
    capability: "Payment full-loop (payouts, chargebacks, fraud review)",
    sources: ["src/server-routes/api/billing.ts"],
    tests: [],
    runtime: "Sin evidencia automatizada: conteos pendientes, sin payouts automáticos.",
    status: "manual",
  },
];

let missing = [];
const manifestErrors = validateProductionCapabilities();
const rows = CAPABILITIES.map((capability) => {
  const absent = [...capability.sources, ...capability.tests].filter(
    (file) => !existsSync(resolve(root, file)),
  );
  missing.push(...absent.map((file) => `${capability.capability}: ${file}`));
  return `| ${capability.capability} | ${capability.sources.map((s) => `\`${s}\``).join("<br>")} | ${capability.tests.length > 0 ? capability.tests.map((s) => `\`${s}\``).join("<br>") : "—"} | ${capability.runtime} | ${capability.status} |`;
});

const markdown = `# Matriz de capabilities (generada)

> documentation ≠ implementation evidence. Generada por \`node scripts/capability-matrix.mjs\`.
> Estados: \`real\` (código + tests verdes aquí) · \`evidence-gated\` (requiere DB externa)
> · \`manual\` (sin evidencia automatizada; no autorizar fondos).

| Capability | Fuente | Test | Evidencia runtime | Estado |
|---|---|---|---|---|
${rows.join("\n")}
`;

writeFileSync(resolve(root, "docs/operations/CAPABILITY_MATRIX.md"), `${markdown}`);
console.log(
  `Capabilities: ${CAPABILITIES.length}, estados: ${CAPABILITIES.map((c) => c.status).join(",")}`,
);

const check = process.argv.includes("--check");
if (check && (missing.length > 0 || manifestErrors.length > 0)) {
  const errors = [
    ...missing.map((file) => `Archivo declarado ausente: ${file}`),
    ...manifestErrors,
  ];
  console.error(`Matriz de capabilities inválida:\n${errors.join("\n")}`);
  process.exit(1);
}
if (check) {
  console.log("Matriz verificada: archivos declarados y manifiesto de producción válidos.");
}
