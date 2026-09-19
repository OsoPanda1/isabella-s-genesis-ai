#!/usr/bin/env node
/**
 * Backup lógico PostgreSQL (scripts/db-backup.mjs)
 * Uso: DATABASE_URL=... node scripts/db-backup.mjs ./backups/isabella.json
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import pg from "pg";
import { SNAPSHOT_TABLES, buildManifest } from "./db-snapshot-lib.mjs";

const outputPath = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl || !outputPath) {
  console.error("Uso: DATABASE_URL=... node scripts/db-backup.mjs <snapshot.json>");
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const tables = {};

try {
  for (const table of SNAPSHOT_TABLES) {
    const result = await pool.query(`SELECT * FROM public."${table}"`);
    tables[table] = result.rows;
  }

  const snapshot = { manifest: buildManifest(tables), tables };
  const target = resolve(outputPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`Backup OK: ${snapshot.manifest.totalRows} filas en ${target}`);
} catch (error) {
  console.error(`Backup falló: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
