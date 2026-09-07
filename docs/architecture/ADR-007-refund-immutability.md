# ADR-007: Refund inmutable por índice único parcial

- **Estado:** Aceptado · **Fecha:** 2026-09-05
- **Contexto:** El refund marcaba bloques (mutando el ledger inmutable) o
  detectaba duplicados con `LIKE 'refund_of_%'` (carrera).
- **Decisión:** El refund es un NUEVO bloque de débito cuyo estado es
  `refunded`, con `original_event_id` apuntando al bloque original y un
  **índice único parcial** en la DB:
  ```sql
  CREATE UNIQUE INDEX uq_bookpi_refund_original
    ON bookpi_ledger(original_event_id) WHERE original_event_id IS NOT NULL;
  ```
  El app realizará el `SELECT ... FOR UPDATE` coincidente en el mismo bloque.
  Un segundo refund colisiona en el índice → rechazo atómico (sin carrera).
- **Consecuencias:** el ledger sigue append-only; no hay “estado refundido”
  inmutable — hay un evento económico de reversión.

## Referencias
- `bookpi-postgres-repository.ts` (refund), test 007.