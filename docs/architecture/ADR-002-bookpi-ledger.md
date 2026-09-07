# ADR-002: Contrato del ledger BookPI (PostgreSQL)

- **Estado:** Aceptado · **Fecha:** 2026-09-05
- **Contexto:** El modelo Prisma `BookPiLedger`
  (`id`, `tenantId`, `index`, `eventType`, `amount`, `idempotencyKey`, `hash`)
  no coincide con el resto canónico de PostgreSQL (`tenant_id`, `user_id`,
  `operation`, `category`, `cost_decimal`, `tokens_consumed`, `previous_hash`,
  `block_hash`, `status`, `nonce`, `signature_algorithm`, `pqc_signature`).
- **Decisión:** El contrato real de BookPI es la tabla PostgreSQL, consumida por
  `bookpi-postgres-repository.ts`. Prisma NO se usa para BookPI en runtime
  (evita divergencia de esquema doble). El archivo `prisma/schema.prisma`
  permanece documental y se alineará solo si se reintroduce Prisma.
- **Restricciones:** blocks append-only (trigger
  `20260904070000_bookpi_immutability`); refund = nuevo evento
  `original_event_id`; `index` único por tenant.

## Ver API canónica
```
append(tenantId, userId, operation, category, cost, tokens) → block
verifyIntegrity(): { success, corruptedIndex?, error? }
refund(blockIndex/eventId, tenantId) → { success, error? }
list(tenantId) → blocks
```