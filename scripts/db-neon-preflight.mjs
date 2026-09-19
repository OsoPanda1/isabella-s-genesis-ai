#!/usr/bin/env node
/**
 * db:neon:preflight — STRICT READ-ONLY production database reconciliation gate.
 * Never creates, alters, drops or deletes anything.
 *
 * Exit codes:
 *   0 = safe to proceed to migration plan
 *   2 = reconciliation blocker detected
 *   1 = connection/tooling failure
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const migrationsDir = resolve(root, "supabase/migrations");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("PREFLIGHT BLOCKED: DATABASE_URL is required.");
  process.exit(1);
}

function query(sql) {
  const result = spawnSync("psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(`PREFLIGHT CONNECTION ERROR: ${(result.stderr ?? "").trim()}`);
    process.exit(1);
  }
  return (result.stdout ?? "").trim();
}

const migrations = readdirSync(migrationsDir)
  .filter((f) => /^\d{14}_[a-z0-9_]+\.sql$/i.test(f))
  .sort();
const migrationChecksum = (file) =>
  createHash("sha256")
    .update(readFileSync(resolve(migrationsDir, file)))
    .digest("hex");
const canonical = ["tenants", "profiles", "sessions", "memories", "audit_events", "bookpi_ledger"];
const expectedMemoryColumns = [
  "tenant_id",
  "user_id",
  "sensitivity",
  "purpose",
  "consent",
  "provenance",
  "content_hash",
  "expires_at",
];
const expectedPolicies = [
  "Memory tenant read boundary",
  "Memory principal-bound insert",
  "Memory principal-bound update",
  "Memory principal-bound delete",
];
const unsafePatterns = [
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

// SQL dollar-quoted bodies ($$...$$ or $tag$...$tag$, e.g. SECURITY DEFINER
// function bodies) are payload, not top-level statements. Stripping them keeps
// the automatic path fail-closed against real destructive SQL while allowing
// legitimate retention prunes inside stored functions.
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

const unsafeMigrations = [];
for (const file of migrations) {
  const sql = stripDollarQuoted(readFileSync(resolve(migrationsDir, file), "utf8"));
  if (unsafePatterns.some((pattern) => pattern.test(sql))) unsafeMigrations.push(file);
}

const tableRows = query(
  `select table_name from information_schema.tables where table_schema='public' and table_name = any(array['tenants','profiles','sessions','memories','audit_events','bookpi_ledger','isabella_learning_state','isabella_schema_migrations']) order by table_name;`,
);
const tables = tableRows.split("\n").filter(Boolean);
const missingCanonical = canonical.filter((name) => !tables.includes(name));
const historyExists =
  query(
    "select exists(select 1 from information_schema.tables where table_schema='public' and table_name='isabella_schema_migrations');",
  ) === "t";

const issues = [];
const applied = new Map();
if (historyExists) {
  const historyColumns = query(
    `select column_name from information_schema.columns where table_schema='public' and table_name='isabella_schema_migrations' order by ordinal_position;`,
  )
    .split("\n")
    .filter(Boolean);
  const requiredHistoryColumns = ["version", "filename", "checksum_sha256", "applied_at"];
  const missingHistoryColumns = requiredHistoryColumns.filter((c) => !historyColumns.includes(c));
  if (missingHistoryColumns.length)
    issues.push(
      `migration ledger has incompatible shape; missing columns: ${missingHistoryColumns.join(", ")}`,
    );

  const rows = query(
    "select version || E'\\t' || filename || E'\\t' || checksum_sha256 from public.isabella_schema_migrations order by version;",
  )
    .split("\n")
    .filter(Boolean);
  for (const row of rows) {
    const [version, filename, checksum] = row.split("\t");
    if (version && filename && checksum) applied.set(version, { filename, checksum });
  }
}

const duplicateVersions = migrations.filter(
  (file, index) => index > 0 && file.slice(0, 14) === migrations[index - 1].slice(0, 14),
);
if (duplicateVersions.length)
  issues.push(`duplicate migration version(s): ${duplicateVersions.join(", ")}`);
if (unsafeMigrations.length)
  issues.push(`automatic Neon path rejects unsafe migration SQL: ${unsafeMigrations.join(", ")}`);

const drift = [];
for (const file of migrations) {
  const version = file.slice(0, 14);
  const entry = applied.get(version);
  if (entry && (entry.filename !== file || entry.checksum !== migrationChecksum(file)))
    drift.push(file);
}
const pending = migrations.filter((file) => !applied.has(file.slice(0, 14)));

const memoryColumns = query(
  `select column_name from information_schema.columns where table_schema='public' and table_name='memories' and column_name = any(array['tenant_id','user_id','sensitivity','purpose','consent','provenance','content_hash','expires_at']) order by column_name;`,
)
  .split("\n")
  .filter(Boolean);
const missingMemoryColumns = expectedMemoryColumns.filter((c) => !memoryColumns.includes(c));

const functions = query(
  `select routine_name from information_schema.routines where routine_schema='public' and routine_name = any(array['current_tenant_id','current_user_role','current_user_id']) order by routine_name;`,
)
  .split("\n")
  .filter(Boolean);
const missingFunctions = ["current_tenant_id", "current_user_role", "current_user_id"].filter(
  (f) => !functions.includes(f),
);

const policies = query(
  `select policyname from pg_policies where schemaname='public' and tablename='memories' order by policyname;`,
)
  .split("\n")
  .filter(Boolean);
const missingPolicies = expectedPolicies.filter((p) => !policies.includes(p));
const legacyPolicyPresent = policies.includes("Tenant multi-tenant isolation policy for memories");

const initPending = pending.includes("20260831122458_init_schema.sql");
const hardeningPending = pending.includes("20260909133000_hardening_rls_memory_capabilities.sql");
const memoryAlignmentPending = pending.includes("20260903140000_align_memories_sessions_rls.sql");

if (drift.length) issues.push(`migration checksum/history drift: ${drift.join(", ")}`);
if (!historyExists && missingCanonical.length < canonical.length)
  issues.push(
    "canonical schema exists but migration ledger is absent: baseline reconciliation required",
  );
if (historyExists && applied.size === 0 && missingCanonical.length < canonical.length)
  issues.push("migration ledger is empty while canonical schema exists");
if (missingCanonical.length && !initPending)
  issues.push(
    `missing canonical tables with no pending init migration: ${missingCanonical.join(", ")}`,
  );
if (missingMemoryColumns.length && !memoryAlignmentPending && !initPending)
  issues.push(
    `missing memories contract columns with no pending alignment migration: ${missingMemoryColumns.join(", ")}`,
  );
if (missingFunctions.length && !hardeningPending && !initPending)
  issues.push(
    `missing security helper functions with no pending hardening migration: ${missingFunctions.join(", ")}`,
  );
if (missingPolicies.length && !hardeningPending && !initPending)
  issues.push(
    `missing hardened memories policies with no pending hardening migration: ${missingPolicies.join(", ")}`,
  );
if (legacyPolicyPresent && !hardeningPending && !initPending)
  issues.push(
    "legacy broad memories RLS policy is present without its hardening migration pending",
  );
if (historyExists && applied.size > migrations.length)
  issues.push(
    `database migration ledger has ${applied.size} entries but repository contains only ${migrations.length}`,
  );

console.log("=== ISABELLA / NEON STRICT READ-ONLY PREFLIGHT ===");
console.log(`repository migrations: ${migrations.length}`);
console.log(`ledger: ${historyExists ? `${applied.size} applied` : "ABSENT"}`);
console.log(`pending: ${pending.length}`);
console.log(`canonical tables: ${canonical.length - missingCanonical.length}/${canonical.length}`);
console.log(
  `memory contract columns: ${expectedMemoryColumns.length - missingMemoryColumns.length}/${expectedMemoryColumns.length}`,
);
console.log(`security helper functions: ${3 - missingFunctions.length}/3`);
console.log(
  `hardened memory policies: ${expectedPolicies.length - missingPolicies.length}/${expectedPolicies.length}`,
);
console.log(
  `legacy broad memory policy: ${legacyPolicyPresent ? (hardeningPending ? "PRESENT — scheduled for transactional replacement" : "PRESENT — BLOCK") : "absent"}`,
);
if (pending.length)
  pending.forEach((file) => console.log(`PENDING ${file} sha256=${migrationChecksum(file)}`));

if (issues.length) {
  console.error("\nPREFLIGHT BLOCKED:");
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(2);
}

console.log("\nPREFLIGHT PASS: no detected reconciliation blocker.");
console.log("Next step: npm run db:migrate -- psql --plan");
