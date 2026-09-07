# ADR-010: Concurrencia económica

- **Estado:** Aceptado (parcial) · **Fecha:** 2026-09-05
- **Contexto:** appends concurrentes sobre el ledger y rebalanceos podían
  divergir; el snapshot en memoria (`SovereignDB.upsertTenant`) puede
  sobreescribir el saldo de otro request.
- **Decisiones actuales:**
  - Append a BookPI vía `pg_advisory_xact_lock(tenant_id)` (bloqueo a nivel de
    transacción) + insert secuencial → índices 0,1,2… sin huecos (test 006).
  - Refund con `SELECT ... FOR UPDATE` sobre el bloque original + índice único
    parcial (ADR-007).
  - El path de carga (charge) RE-LEE el snapshot fresco y verifica saldo antes
    de debitar — mitigando el overwrite dentro del mismo request.
- **Pendiente (refactor TX completo):** outbox transaccional
  (ledger+economic_event+tenant en una TX), worker de reconciliación, y
  eliminación del mutable compartido. Documentado como DEUDA TÉCNICA en
  DEPENDENCY_MATRIX.md / PRODUCTION_REPAIR_REGISTER (REP-009, REP-011).

## Referencias
- `bookpi-postgres-repository.ts`, `billing.ts` (context.tenantId → upsert).