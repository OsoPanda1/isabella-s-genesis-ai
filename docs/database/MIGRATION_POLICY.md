# Política de migraciones (Cambio de esquema)

**Objetivo:** toda cambio de esquema debe ser reproducible, trazable y
compatible con el deploy en Vercel.

## Reglas

1. **Fuente de verdad:** el fichero de migración en
   `supabase/migrations/` (prefijo `YYYYMMDDHHMMSS_nombre.sql`).
2. **Un solo sentido:** las migraciones son append-only; no editar ficheros
   antiguos.
3. **Supabase / Neon:**
   - Si el destino usa **Neon** con `DATABASE_URL` → ejecutar la migración
     manualmente:
     ```
     psql "$DATABASE_URL" -f supabase/migrations/20260905100000_economic_contract.sql
     ```
   - Si el destino es **Supabase** → usar `supabase db push` o crear la
     migración manual en el dashboard SQL editor.
4. **Prisma** (`prisma/schema.prisma`) NO es la autoridad de esquema BookPI
   (ADR-002). El esquema Prisma se alinea solo cuando se reintroduce Prisma
   como ORM para BookPI.
5. **Rollback:** mantener una migración inversa explícita:
   - `DROP INDEX IF EXISTS uq_bookpi_refund_original;`
   - `ALTER TABLE bookpi_ledger DROP COLUMN IF EXISTS original_event_id;`
   - `DROP TABLE IF EXISTS economic_events;`
   - `DROP TABLE IF EXISTS webhook_events;`
6. **Post-deploy:** ejecutar `rebuildBalance()` para verificar la proyección
   contra el ledger (§10) y registrar resultado en la línea de comandos /
   healthcheck.
7. **No usar migraciones como source of truth de tests:** los tests deben
   crear su propio schema (vitest `setupFiles` o in-memory) para ser
   reproducibles sin DB externa.

## Plazos de ejecución
- **Antes de ir a prod:** al menos `20260904070000_bookpi_immutability.sql`
  (triggers append-only) y `20260905100000_economic_contract.sql` (nuevas
  tablas + original_event_id) deben ejecutarse en el DB de destino.