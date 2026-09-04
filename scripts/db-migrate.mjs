#!/usr/bin/env node
/**
 * db:migrate — Aplica las migraciones SQL de Supabase en orden.
 * -----------------------------------------------------------------
 * Requiere Supabase CLI (`supabase`) en el PATH, o un `DATABASE_URL`
 * de PostgreSQL para aplicar con psql.
 *
 * Modos de uso:
 *   npm run db:migrate            → supabase db push (proyecto remoto)
 *   npm run db:migrate -- local   → supabase db reset (local)
 *   DATABASE_URL=... npm run db:migrate -- psql   → aplica vía psql
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "../supabase/migrations");

const mode = process.argv[2] ?? "push";
const databaseUrl = process.env.DATABASE_URL;

function listMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

if (mode === "psql" && databaseUrl) {
  const files = listMigrations();
  for (const file of files) {
    const path = resolve(MIGRATIONS_DIR, file);
    console.log(`Aplicando migración: ${file}`);
    const res = spawnSync("psql", [databaseUrl, "-f", path], { stdio: "inherit" });
    if (res.status !== 0) {
      console.error(`Fallo en migración ${file}`);
      process.exit(res.status ?? 1);
    }
  }
  console.log("Migraciones aplicadas.");
  process.exit(0);
}

if (!process.env.CI && mode !== "local") {
  console.warn(
    "Advertencia: aplicando migraciones a Supabase remoto. Asegúrate de tener el CLI autenticado.",
  );
}

const args = mode === "local" ? ["db", "reset"] : ["db", "push"];
const res = spawnSync("supabase", args, { stdio: "inherit", cwd: resolve(__dirname, "..") });
process.exit(res.status ?? 1);
