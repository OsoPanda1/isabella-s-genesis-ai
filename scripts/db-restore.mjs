#!/usr/bin/env node
/**
 * Restore lógico PostgreSQL (scripts/db-restore.mjs)
 * -----------------------------------------------------------------
 * Restaura un snapshot (db-backup) de forma ADITIVA y segura:
 *  - Verifica el manifiesto antes de tocar la DB (hash por tabla).
 *  - Inserta en orden topológico con ON CONFLICT DO NOTHING:
 *    jamás sobrescribe ni borra filas existentes.
 *  - Exige --confirm explícito (fail-closed sin él).
 *
 * Uso: DATABASE_URL=... node scripts/db-restore.mjs snapshot.json --confirm
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { SNAPSHOT_TABLES, verifySnapshot } from "./db-snapshot-lib.mjs";

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

/** Columnas por tabla (orden de inserción explícito y seguro). */
const TABLE_COLUMNS = {
  tenants: ["id", "name", "slug", "region", "tier", "quota_balance", "quota_tier_limit", "created_by", "metadata", "created_at", "updated_at"],
  profiles: ["id", "username", "tenant_id", "role", "oidc_sub", "created_at", "updated_at"],
  sessions: ["id", "user_id", "tenant_id", "token_jti", "ip_address", "user_agent", "is_active", "expires_at", "created_at"],
  memories: ["id", "tenant_id", "user_id", "content", "scope", "sensitivity", "purpose", "consent", "provenance", "content_hash", "expires_at", "owner_id"],
  audit_events: ["id", "timestamp", "trace_id", "correlation_id", "actor_ip", "event", "severity", "details", "remediated", "verification_hash", "previous_log_hash", "tenant_id"],
  bookpi_ledger: ["index", "tenant_id", "user_id", "timestamp", "operation", "category", "cost_decimal", "tokens_consumed", "previous_hash", "block_hash", "pqc_signature", "signature_algorithm", "status", "nonce", "original_event_id"],
  api_keys: ["id", "tenant_id", "user_id", "name", "role", "scopes", "key_hash", "key_prefix", "status", "expires_at", "created_at", "revoked_at"],
  webhook_events: ["id", "provider", "provider_event_id", "event_type", "payload_hash", "received_at", "processed_at", "status", "error"],
  economic_events: ["id", "tenant_id", "actor_id", "event_type", "currency", "amount_minor", "direction", "source", "provider", "provider_event_id", "idempotency_key", "correlation_id", "metadata", "created_at"],
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

export async function runRestore(databaseUrl, snapshot, poolFactory) {
  const errors = verifySnapshot(snapshot);
  if (errors.length > 0) {
    throw new Error(`Snapshot inválido:\n${errors.join("\n")}`);
  }
  const pool = poolFactory ? poolFactory(databaseUrl) : new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const inserted = {};
  try {
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
        await pool.query(
          `INSERT INTO public."${table}" (${quoted}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values,
        );
        count += 1;
      }
      inserted[table] = count;
    }
    return inserted;
  } finally {
    await pool.end();
  }
}

if (isMain) {
  const [snapshotPath, flag] = [process.argv[2], process.argv[3]];
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
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  runRestore(databaseUrl, snapshot)
    .then((inserted) => {
      const total = Object.values(inserted).reduce((acc, n) => acc + n, 0);
      console.log(`Restore OK (aditivo): ${total} filas intentadas. Detalle: ${JSON.stringify(inserted)}`);
    })
    .catch((error) => {
      console.error(`Restore falló: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    });
}
