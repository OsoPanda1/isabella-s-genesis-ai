#!/usr/bin/env node
/**
 * Restore lógico PostgreSQL (scripts/db-restore.mjs)
 *
 * Fail-closed y transaccional:
 *  - verifica manifiesto/hash antes de escribir;
 *  - exige --confirm;
 *  - valida tablas/columnas críticas;
 *  - restaura en orden topológico dentro de una única transacción;
 *  - nunca hace UPDATE/DELETE de datos existentes;
 *  - rollback completo ante cualquier error.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { SNAPSHOT_TABLES, verifySnapshot } from "./db-snapshot-lib.mjs";

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

const TABLE_COLUMNS = {
  tenants: [
    "id",
    "name",
    "slug",
    "region",
    "tier",
    "quota_balance",
    "quota_tier_limit",
    "created_by",
    "metadata",
    "created_at",
    "updated_at",
  ],
  profiles: ["id", "username", "tenant_id", "role", "oidc_sub", "created_at", "updated_at"],
  sessions: [
    "id",
    "user_id",
    "tenant_id",
    "token_jti",
    "ip_address",
    "user_agent",
    "is_active",
    "expires_at",
    "created_at",
  ],
  memories: [
    "id",
    "tenant_id",
    "user_id",
    "owner_id",
    "content",
    "source",
    "scope",
    "sensitivity",
    "purpose",
    "consent_required",
    "consent",
    "provenance",
    "content_hash",
    "previous_chain_hash",
    "chain_hash",
    "metadata",
    "expires_at",
    "created_at",
  ],
  audit_events: [
    "id",
    "timestamp",
    "trace_id",
    "correlation_id",
    "actor_ip",
    "actor",
    "action",
    "resource",
    "event",
    "severity",
    "result",
    "details",
    "remediated",
    "verification_hash",
    "previous_log_hash",
    "tenant_id",
  ],
  bookpi_ledger: [
    "index",
    "tenant_id",
    "user_id",
    "timestamp",
    "operation",
    "category",
    "cost_decimal",
    "tokens_consumed",
    "previous_hash",
    "block_hash",
    "pqc_signature",
    "signature_algorithm",
    "status",
    "nonce",
    "original_event_id",
  ],
  api_keys: [
    "id",
    "tenant_id",
    "user_id",
    "name",
    "role",
    "scopes",
    "key_hash",
    "key_prefix",
    "prefix",
    "secret_hint",
    "status",
    "expires_at",
    "created_at",
    "revoked_at",
    "rotated_at",
    "last_used_at",
    "created_by",
    "metadata",
  ],
  webhook_events: [
    "id",
    "provider",
    "provider_event_id",
    "event_type",
    "payload_hash",
    "received_at",
    "processed_at",
    "status",
    "error",
  ],
  economic_events: [
    "id",
    "tenant_id",
    "actor_id",
    "event_type",
    "currency",
    "amount_minor",
    "direction",
    "source",
    "provider",
    "provider_event_id",
    "idempotency_key",
    "correlation_id",
    "metadata",
    "created_at",
  ],
  sovereign_state: ["id", "payload", "version", "updated_at"],
};

function toJsonb(value) {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

function isJsonbColumn(table, column) {
  return (
    (table === "tenants" && column === "metadata") ||
    column === "metadata" ||
    column === "scopes" ||
    column === "payload" ||
    column === "provenance"
  );
}

async function assertSchema(client) {
  const requiredTables = SNAPSHOT_TABLES;
  const { rows: tableRows } = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])`,
    [requiredTables],
  );
  const found = new Set(tableRows.map((row) => String(row.table_name)));
  const missingTables = requiredTables.filter((table) => !found.has(table));
  if (missingTables.length) throw new Error(`Tablas ausentes: ${missingTables.join(", ")}`);

  for (const [table, columns] of Object.entries(TABLE_COLUMNS)) {
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name = ANY($2::text[])`,
      [table, columns],
    );
    const foundColumns = new Set(rows.map((row) => String(row.column_name)));
    const missing = columns.filter((column) => !foundColumns.has(column));
    if (missing.length) throw new Error(`Columnas ausentes en ${table}: ${missing.join(", ")}`);
  }
}

export async function runRestore(databaseUrl, snapshot, poolFactory, options = {}) {
  const errors = verifySnapshot(snapshot);
  if (errors.length) throw new Error(`Snapshot inválido:\n${errors.join("\n")}`);
  if (!databaseUrl) throw new Error("DATABASE_URL ausente: restore denegado.");

  const pool = poolFactory
    ? poolFactory(databaseUrl)
    : new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const inserted = {};
  const client = typeof pool.connect === "function" ? await pool.connect() : pool;
  try {
    await client.query("BEGIN");
    if (!options.skipSchemaAssert && !poolFactory) {
      await assertSchema(client);
    }

    for (const table of SNAPSHOT_TABLES) {
      const columns = TABLE_COLUMNS[table];
      const rows = snapshot.tables[table] ?? [];
      let count = 0;
      for (const row of rows) {
        const values = columns.map((column) => {
          const raw = row[column];
          if (raw === undefined) return null;
          if (isJsonbColumn(table, column)) return toJsonb(raw);
          if (typeof raw === "object" && raw !== null) return JSON.stringify(raw);
          return raw;
        });
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
        const quoted = columns.map((column) => `"${column}"`).join(", ");
        const result = await client.query(
          `INSERT INTO public."${table}" (${quoted}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values,
        );
        if ((result?.rowCount ?? 0) > 0) count += 1;
      }
      inserted[table] = count;
    }

    await client.query("COMMIT");
    return inserted;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    if (typeof client.release === "function") client.release();
    if (typeof pool.end === "function") await pool.end();
  }
}

if (isMain) {
  const snapshotPath = process.argv[2];
  const flag = process.argv[3];
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL ausente: restore denegado (fail-closed).");
    process.exit(2);
  }
  if (flag !== "--confirm") {
    console.error("Restore exige --confirm explícito. Nada se modificó.");
    process.exit(2);
  }
  if (!snapshotPath) {
    console.error("Uso: node scripts/db-restore.mjs snapshot.json --confirm");
    process.exit(2);
  }
  let snapshot;
  try {
    snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  } catch (error) {
    console.error(`No se pudo leer snapshot: ${error instanceof Error ? error.message : error}`);
    process.exit(2);
  }
  runRestore(databaseUrl, snapshot)
    .then((inserted) => {
      const total = Object.values(inserted).reduce((acc, n) => acc + n, 0);
      console.log(`Restore OK (aditivo/transaccional): ${total} filas restauradas.`);
    })
    .catch((error) => {
      console.error(
        `Restore falló y fue revertido: ${error instanceof Error ? error.message : error}`,
      );
      process.exit(1);
    });
}
