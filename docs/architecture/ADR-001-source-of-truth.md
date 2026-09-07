# ADR-001: PostgreSQL como autoridad canónica del estado

- **Estado:** Aceptado · **Fecha:** 2026-09-05
- **Contexto:** El sistema nació con autores en memoria + persistencia a fichero
  (`SovereignDB`, `DURABLE_JSON_ALLOWED`). No hay garantía de durabilidad ni
  concurrencia para el saldo económico; la proyección (quotaBalance) y el ledger
  pueden divergir.
- **Decisión:** PostgreSQL es la única fuente de verdad durable para
  `bookpi_ledger`, `economic_events`, `webhook_events` y `tenants`. El path
  caliente síncrono escribe en el ledger de Postgres; el hydrated de tenants se
  sirve por request desde el snapshot en memoria que se re-fresca bajo
  `SELECT ... FOR UPDATE` el mismo request económico.
- **Consecuencias:** No se puede asumir `bookpi-repository.ts` (JSON) como
  autoridad en producción: queda como modo de desarrollo
  (`DURABLE_JSON_ALLOWED=false` en prod). Toda operación económica pasa por
  Postgres; APIs de mensajería/assistant que no tocan economía siguen con
  SovereignDB.
- **Outbox/reconciliation:** refactor transaccional pendiente (documentado).

## Alternativas rechazadas
- mongoDB (fuera de alcance de la plataforma Vercel).
- JSON file como autoridad (no durable, no concurrente).