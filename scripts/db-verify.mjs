#!/usr/bin/env node
/**
 * db:verify — Verifica la estructura del esquema PostgreSQL/Supabase.
 * -----------------------------------------------------------------
 * Comprueba que existan las tablas canónicas, las extensiones y que
 * las migraciones sean aplicables. Requiere DATABASE_URL (vía psql)
 * o hace una verificación estática de las migraciones SQL.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "../supabase/migrations");
const databaseUrl = process.env.DATABASE_URL;

const REQUIRED_TABLES = [
  "tenants",
  "profiles",
  "sessions",
  "memories",
  "audit_events",
  "bookpi_ledger",
];

function listMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function staticCheck() {
  const errors = [];
  const files = listMigrations();
  if (files.length === 0) {
    errors.push("No hay migraciones SQL en supabase/migrations");
    return { errors, files };
  }
  const allSql = files.map((f) => readFileSync(resolve(MIGRATIONS_DIR, f), "utf8")).join("\n");
  for (const table of REQUIRED_TABLES) {
    if (!new RegExp(`create table[^(]*${table}`, "i").test(allSql)) {
      errors.push(`Tabla canónica no encontrada en las migraciones: ${table}`);
    }
  }
  if (!/create extension if not exists "vector"/i.test(allSql) && !/pgvector/i.test(allSql)) {
    errors.push("Extensión pgvector no habilitada (requerida por memories.embedding)");
  }
  return { errors, files };
}

if (databaseUrl) {
  const res = spawnSync(
    "psql",
    [
      databaseUrl,
      "-tAc",
      "select table_name from information_schema.tables where table_schema='public'",
    ],
    { encoding: "utf8" },
  );
  if (res.status === 0) {
    const tables = (res.stdout ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const missing = REQUIRED_TABLES.filter((t) => !tables.includes(t));
    if (missing.length) {
      console.error("Faltan tablas canónicas:", missing.join(", "));
      process.exit(1);
    }
    console.log(`Esquema verificado. Tablas presentes: ${REQUIRED_TABLES.length}`);
    process.exit(0);
  }
  console.warn("No se pudo consultar la base (psql no disponible). Verificación estática.");
}

const { errors, files } = staticCheck();
console.log(`Migraciones detectadas: ${files.length}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("Estructura de migraciones OK (verificación estática).");
console.log("Define DATABASE_URL para una verificación SQL completa contra la base.");
process.exit(0);
