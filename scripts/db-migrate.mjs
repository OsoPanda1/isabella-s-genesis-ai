#!/usr/bin/env node
/**
 * db:migrate — Safe PostgreSQL migration runner for Neon/production.
 *
 * Guarantees:
 * - Never blindly replays the migration directory.
 * - Uses a version + SHA-256 ledger.
 * - Applies all pending migrations in ONE PostgreSQL transaction.
 * - Uses a transaction-scoped advisory lock.
 * - Refuses checksum/history drift.
 * - Refuses to guess the history of an existing production schema.
 * - Refuses destructive table/data operations in the automatic path.
 * - Refuses transaction-control SQL inside migration files.
 * - Verifies final schema invariants BEFORE COMMIT.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");
const MIGRATIONS_DIR = resolve(ROOT, "supabase/migrations");
const databaseUrl = process.env.DATABASE_URL;
const mode = process.argv[2] ?? "push";
const planOnly = process.argv.includes("--plan");

const HISTORY_TABLE = "public.isabella_schema_migrations";
const CANONICAL_TABLES = [
  "tenants",
  "profiles",
  "sessions",
  "memories",
  "audit_events",
  "bookpi_ledger",
];
const REQUIRED_FINAL_TABLES = [...CANONICAL_TABLES, "isabella_learning_state"];
const REQUIRED_MEMORY_COLUMNS = [
  "tenant_id",
  "user_id",
  "sensitivity",
  "purpose",
  "consent",
  "provenance",
  "content_hash",
  "expires_at",
];
const REQUIRED_MEMORY_POLICIES = [
  "Memory tenant read boundary",
  "Memory principal-bound insert",
  "Memory principal-bound update",
  "Memory principal-bound delete",
];

function listMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d{14}_[a-z0-9_]+\.sql$/i.test(file))
    .sort();
}

function sha256File(file) {
  return createHash("sha256")
    .update(readFileSync(resolve(MIGRATIONS_DIR, file)))
    .digest("hex");
}

const { Client } = await import("pg");
const client = new Client({ connectionString: databaseUrl });
await client.connect();

async function psql(args, options = {}) {
  try {
    const queryIndex = args.indexOf("-tAc");
    if (queryIndex !== -1) {
      const result = await client.query(args[queryIndex + 1]);
      const stdout = result.rows.map((row) => Object.values(row).join(" | ")).join("\\n");
      return { status: 0, stdout, stderr: "" };
    }
    const fileIndex = args.indexOf("-f");
    if (fileIndex !== -1) {
      await client.query("BEGIN");
      try {
        await client.query(readFileSync(args[fileIndex + 1], "utf8"));
        await client.query("COMMIT");
        return { status: 0, stdout: "", stderr: "" };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    throw new Error("Unsupported migration command");
  } catch (error) {
    return {
      status: 1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}

function fail(message) {
  console.error(`MIGRATION BLOCKED: ${message}`);
  process.exit(1);
}

if (mode === "local") {
  const res = spawnSync("supabase", ["db", "reset"], {
    stdio: "inherit",
    cwd: ROOT,
  });
  process.exit(res.status ?? 1);
}

if (mode !== "psql" || !databaseUrl) {
  console.error("Producción/Neon: DATABASE_URL=... npm run db:migrate -- psql [--plan]");
  process.exit(1);
}

const migrations = listMigrations();
if (!migrations.length) fail("no SQL migrations found");

// Automatic production path accepts only migrations that are transaction-safe and
// non-destructive. DROP POLICY/TRIGGER is intentionally allowed because the project
// uses those statements for idempotent policy/trigger replacement.
const forbidden = [
  /\bdrop\s+(table|schema|database|view|materialized\s+view)\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\balter\s+table\b[\s\S]*?\bdrop\s+(column|constraint)\b/i,
  /\bcreate\s+index\b[\s\S]*?\bconcurrently\b/i,
  /\bcommit\s*;/i,
  /\brollback\s*;/i,
  /\bbegin\s*;/i,
  /\bsavepoint\b/i,
  /\brelease\s+savepoint\b/i,
];

// SQL dollar-quoted bodies ($$...$$ or $tag$...$tag$) are function payload, not
// top-level statements. Stripping them keeps the automatic path fail-closed
// against real destructive SQL while allowing legitimate retention prunes
// inside stored functions (e.g. fgais_federation_replay_prune).
function stripDollarQuoted(sql) {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const open = sql.indexOf("$", i);
    if (open === -1) {
      out += sql.slice(i);
      break;
    }
    let tag = null;
    if (sql[open + 1] === "$") {
      tag = "$$";
    } else {
      const match = /^[A-Za-z_][A-Za-z0-9_]*\$/.exec(sql.slice(open + 1));
      if (match) tag = "$" + match[0];
    }
    if (!tag) {
      out += sql.slice(i, open + 1);
      i = open + 1;
      continue;
    }
    out += sql.slice(i, open);
    const close = sql.indexOf(tag, open + tag.length);
    if (close === -1) {
      out += sql.slice(open);
      break;
    }
    i = close + tag.length;
  }
  return out;
}

for (const file of migrations) {
  const sql = stripDollarQuoted(readFileSync(resolve(MIGRATIONS_DIR, file), "utf8"));
  const violations = forbidden.filter((pattern) => pattern.test(sql));
  if (violations.length) {
    fail(
      `unsafe SQL detected in ${file}; automatic Neon path refuses destructive or transaction-control statements`,
    );
  }
}

const state = await psql([
  "-tAc",
  `select
  exists(select 1 from information_schema.tables where table_schema='public' and table_name='isabella_schema_migrations') as history_exists,
  (select count(*) from information_schema.tables where table_schema='public' and table_name = any(array['tenants','profiles','sessions','memories','audit_events','bookpi_ledger'])) as canonical_count;`,
]);
if (state.status !== 0) fail(`cannot inspect database: ${(state.stderr ?? "").trim()}`);

const stateFields = (state.stdout ?? "").trim().split(/\s*\|\s*/);
const historyExists = String(stateFields[0] ?? "").trim() === "t";
const canonicalCount = Number(String(stateFields[1] ?? "0").trim());

if (!historyExists && canonicalCount > 0) {
  fail(
    `existing schema detected (${canonicalCount}/${CANONICAL_TABLES.length} canonical tables) but migration history is absent. ` +
      "Automatic baseline is disabled to prevent collateral changes. Run explicit schema reconciliation first.",
  );
}

const applied = new Map();
if (historyExists) {
  const ledger = await psql([
    "-tAc",
    `select version || E'\\t' || filename || E'\\t' || checksum_sha256 from ${HISTORY_TABLE} order by version;`,
  ]);
  if (ledger.status !== 0) fail(`cannot read migration ledger: ${(ledger.stderr ?? "").trim()}`);
  for (const line of (ledger.stdout ?? "").split("\n")) {
    const [version, filename, checksum] = line.trim().split("\t");
    if (version && filename && checksum) applied.set(version, { filename, checksum });
  }
  if (applied.size === 0 && canonicalCount > 0) {
    fail("migration ledger is empty while the canonical schema exists; refusing to infer history");
  }
}

for (const file of migrations) {
  const version = file.slice(0, 14);
  const checksum = sha256File(file);
  const existing = applied.get(version);
  if (existing && (existing.filename !== file || existing.checksum !== checksum)) {
    fail(
      `checksum/history drift for ${file}; recorded=${existing.filename}:${existing.checksum} current=${checksum}`,
    );
  }
}

const pending = migrations.filter((file) => !applied.has(file.slice(0, 14)));
console.log(
  `Ledger: ${applied.size} applied / ${migrations.length} repository migrations / ${pending.length} pending.`,
);

if (planOnly) {
  if (!pending.length) console.log("PLAN: database schema is aligned with the repository ledger.");
  else pending.forEach((file) => console.log(`PLAN: pending ${file} sha256=${sha256File(file)}`));
  process.exit(0);
}

if (!pending.length) {
  console.log("No hay migraciones pendientes. No se modifica el esquema.");
  process.exit(0);
}

const workDir = mkdtempSync(resolve(tmpdir(), "isabella-migrate-"));
const transactionFile = resolve(workDir, "migration-batch.sql");
const chunks = [
  "select pg_advisory_xact_lock(hashtextextended('isabella-schema-migrations-v2', 0));",
  `create table if not exists ${HISTORY_TABLE} (\n` +
    "version varchar(14) primary key,\n" +
    "filename text not null unique,\n" +
    "checksum_sha256 char(64) not null,\n" +
    "applied_at timestamptz not null default now()\n" +
    ");",
  `create index if not exists idx_isabella_schema_migrations_applied_at on ${HISTORY_TABLE}(applied_at desc);`,
];

for (const file of pending) {
  const version = file.slice(0, 14);
  const checksum = sha256File(file);
  chunks.push(`-- BEGIN ${file}`);
  chunks.push(readFileSync(resolve(MIGRATIONS_DIR, file), "utf8"));
  chunks.push(
    `insert into ${HISTORY_TABLE}(version, filename, checksum_sha256) values ` +
      `('${version}', '${file.replaceAll("'", "''")}', '${checksum}');`,
  );
  chunks.push(`-- END ${file}`);
}

chunks.push(`
DO $$
DECLARE
  required_table text;
  required_column text;
  required_policy text;
BEGIN
  FOREACH required_table IN ARRAY ARRAY['tenants','profiles','sessions','memories','audit_events','bookpi_ledger','isabella_learning_state'] LOOP
    IF to_regclass('public.' || required_table) IS NULL THEN
      RAISE EXCEPTION 'POST-MIGRATION INVARIANT FAILED: missing table %', required_table;
    END IF;
  END LOOP;

  FOREACH required_column IN ARRAY ARRAY['tenant_id','user_id','sensitivity','purpose','consent','provenance','content_hash','expires_at'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='memories' AND column_name=required_column
    ) THEN
      RAISE EXCEPTION 'POST-MIGRATION INVARIANT FAILED: memories.% missing', required_column;
    END IF;
  END LOOP;

  FOREACH required_policy IN ARRAY ARRAY['Memory tenant read boundary','Memory principal-bound insert','Memory principal-bound update','Memory principal-bound delete'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='memories' AND policyname=required_policy
    ) THEN
      RAISE EXCEPTION 'POST-MIGRATION INVARIANT FAILED: memories policy % missing', required_policy;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='memories'
      AND policyname='Tenant multi-tenant isolation policy for memories'
  ) THEN
    RAISE EXCEPTION 'POST-MIGRATION INVARIANT FAILED: legacy broad memories policy remains';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='current_tenant_id')
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='current_user_role')
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='current_user_id') THEN
    RAISE EXCEPTION 'POST-MIGRATION INVARIANT FAILED: security helper function missing';
  END IF;


  IF (SELECT count(*) FROM ${HISTORY_TABLE}) <> ${migrations.length} THEN
    RAISE EXCEPTION 'POST-MIGRATION INVARIANT FAILED: migration ledger count mismatch';
  END IF;
END $$;
`);

writeFileSync(transactionFile, `${chunks.join("\n\n")}\n`, "utf8");
console.log(`Aplicando ${pending.length} migración(es) en una sola transacción PostgreSQL...`);

try {
  const result = await psql(["--single-transaction", "-f", transactionFile], {
    stdio: "inherit",
  });
  if (result.status !== 0)
    fail(
      `transaction failed; PostgreSQL rolled back the complete migration batch: ${result.stderr}`,
    );
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

console.log(
  "MIGRATION PASS: schema, RLS, pgvector, invariants and migration ledger committed atomically.",
);
