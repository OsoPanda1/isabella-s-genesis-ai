# Política de migraciones (Cambio de esquema)

**Objetivo:** todo cambio de esquema debe ser reproducible, trazable, atómico y
compatible con el deploy en Vercel y con PostgreSQL/Neon.

## Reglas obligatorias

1. **Fuente de verdad:** los ficheros de `supabase/migrations/` con prefijo
   `YYYYMMDDHHMMSS_nombre.sql` son append-only y versionados.
2. **No editar migraciones aplicadas.** Si una migración ya fue ejecutada, su
   archivo no se modifica. Toda corrección posterior recibe un nuevo timestamp.
3. **Neon:** no ejecutar migraciones individuales manualmente en producción.
   El único camino autorizado es el runner versionado:
   ```bash
   npm run db:neon:preflight
   npm run db:migrate -- psql --plan
   npm run db:migrate -- psql
   ```
   El `preflight` es estrictamente read-only. El `--plan` también es read-only.
4. **Baseline desconocido = BLOQUEO.** Si Neon contiene tablas canónicas pero
   carece de un ledger confiable, el runner no intenta adivinar qué migraciones
   fueron aplicadas.
5. **Integridad del ledger:** cada versión conserva nombre de archivo y SHA-256.
   Cualquier drift produce bloqueo; no se permite sobrescribir silenciosamente
   el historial.
6. **Atomicidad:** todas las migraciones pendientes se ejecutan dentro de una
   única transacción PostgreSQL con `pg_advisory_xact_lock()`. Un error o una
   falla de invariantes provoca rollback del lote completo.
7. **SQL no permitido en la ruta automática de producción:** `DROP TABLE`,
   `DROP SCHEMA`, `DROP DATABASE`, `DROP VIEW`, `TRUNCATE`, `DELETE FROM`,
   `ALTER TABLE ... DROP COLUMN/CONSTRAINT`, índices `CONCURRENTLY` y control
   transaccional explícito (`BEGIN/COMMIT/ROLLBACK/SAVEPOINT`). `DROP POLICY` y
   `DROP TRIGGER` sí pueden utilizarse cuando forman parte de una sustitución
   idempotente y segura.
8. **Invariantes post-migración:** antes del `COMMIT` deben existir las tablas
   canónicas, `isabella_learning_state`, el contrato de `memories`, las
   funciones de seguridad, las políticas RLS endurecidas y `pgvector`; la
   política amplia heredada de `memories` debe haber desaparecido.
9. **Prisma** (`prisma/schema.prisma`) NO es la autoridad del esquema BookPI
   (ADR-002). Solo se alinea cuando Prisma vuelva a ser ORM de BookPI.
10. **Rollback:** no se ejecutan rollbacks destructivos automáticamente sobre
    producción. Una reversión requiere una migración nueva, explícita,
    revisada y aprobada; si implica pérdida de datos, se ejecuta fuera del
    camino automático después de respaldo y validación.
11. **Backup/restore:** antes de una modificación productiva relevante debe
    existir un respaldo verificable y un procedimiento de restauración probado.
12. **Post-deploy:** ejecutar las verificaciones de integridad del proyecto y,
    para BookPI, `rebuildBalance()` para comparar la proyección contra el ledger.
13. **Tests:** los tests no dependen de la base Neon productiva; usan su propio
    esquema/fixtures para ser reproducibles.

## Orden de autorización de Neon

```text
READ-ONLY PREFLIGHT
       ↓
MIGRATION PLAN
       ↓
BACKUP VERIFICADO
       ↓
APPLY ATÓMICO
       ↓
INVARIANTES DENTRO DE LA TRANSACCIÓN
       ↓
COMMIT o ROLLBACK COMPLETO
       ↓
POST-MIGRATION VERIFY
```

**No se autoriza un `COMMIT` si el preflight detecta drift, baseline desconocido,
ledger incompatible, migración insegura o cualquier invariante incumplida.**
