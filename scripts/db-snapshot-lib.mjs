/**
 * Snapshot helpers puros (scripts/db-snapshot-lib.mjs)
 * -----------------------------------------------------------------
 * Canonicalización determinista + manifiesto con hashes por tabla.
 * Sin I/O ni red: 100% testeable sin DB.
 */

import { createHash } from "node:crypto";

/** Orden topológico por FKs (tenants primero). */
export const SNAPSHOT_TABLES = [
  "tenants",
  "profiles",
  "sessions",
  "memories",
  "audit_events",
  "bookpi_ledger",
  "api_keys",
  "webhook_events",
  "economic_events",
  "sovereign_state",
];

/** JSON canónico: claves ordenadas recursivamente. */
export function canonicalize(value) {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

export function sha256Hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Manifiesto: { table, rows, sha256 } por tabla + total. */
export function buildManifest(tables) {
  const entries = Object.entries(tables).map(([table, rows]) => ({
    table,
    rows: rows.length,
    sha256: sha256Hex(JSON.stringify(canonicalize(rows))),
  }));
  return {
    version: "isabella-snapshot-v1",
    createdAt: new Date().toISOString(),
    tables: entries,
    totalRows: entries.reduce((acc, entry) => acc + entry.rows, 0),
  };
}

/** Verifica un snapshot contra su manifiesto. Retorna errores (vacío = ok). */
export function verifySnapshot(snapshot) {
  const errors = [];
  if (!snapshot || snapshot.manifest?.version !== "isabella-snapshot-v1") {
    return ["Manifiesto ausente o versión desconocida."];
  }
  for (const entry of snapshot.manifest.tables) {
    const rows = snapshot.tables?.[entry.table];
    if (!Array.isArray(rows)) {
      errors.push(`Tabla ausente en snapshot: ${entry.table}.`);
      continue;
    }
    if (rows.length !== entry.rows) {
      errors.push(
        `Conteo divergente en ${entry.table}: manifiesto ${entry.rows}, real ${rows.length}.`,
      );
    }
    const digest = sha256Hex(JSON.stringify(canonicalize(rows)));
    if (digest !== entry.sha256) {
      errors.push(`Hash divergente en ${entry.table} (posible manipulación).`);
    }
  }
  return errors;
}
