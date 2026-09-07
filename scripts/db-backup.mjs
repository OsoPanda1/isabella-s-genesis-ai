#!/usr/bin/env node
/**
 * Backup lógico PostgreSQL (scripts/db-backup.mjs)
 * -----------------------------------------------------------------
 * Vuelca las tablas canónicas a un snapshot JSON con manifiesto
 * (conteos + sha256 por tabla). Solo lectura (SELECT).
 *
 * Uso: DATABASE_URL=... node scripts/db-backup.mjs [salida.json]
 * Sin DATABASE_URL: exit 2 (fail-closed, sin inventar datos).
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { SNAPSHOT_TABLES, buildManifest } from "./db-snapshot-lib.mjs";

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

export async function runBackup(databaseUrl, outPath) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const tables = {};
    for (const table of SNAPSHOT_TABLES) {
      const { rows } = await pool.query(`SELECT * FROM public."${table}"`);
      tables[table] = rows;
    }
    const snapshot = { manifest: buildManifest(tables), tables };
    if (outPath) writeFileSync(outPath, JSON.stringify(snapshot));
    return snapshot;
  } finally {
    await pool.end();
  }
}

if (isMain) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL ausente: backup denegado (fail-closed).");
    process.exit(2);
  }
  const outPath =
    process.argv[2] ?? `isabella-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  runBackup(databaseUrl, outPath)
    .then((snapshot) => {
      console.log(
        `Backup OK: ${snapshot.manifest.totalRows} filas en ${snapshot.manifest.tables.length} tablas → ${outPath}`,
      );
    })
    .catch((error) => {
      console.error(`Backup falló: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    });
}
