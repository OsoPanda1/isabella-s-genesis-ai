# PRODUCTION REPAIR REGISTER

**Repositorio:** `OsoPanda1/isabella-ai-genesis`
**Rama:** `repair/production-hardening-2026-09`
**Fecha:** 5 de septiembre de 2026
**Base:** `85cfbfc` (HEAD de `main` al iniciar — incluye el fix de despliegue SovereignDB)

> **Nota de desviación (Manual §1.1):** el manual fija la base en `eea83b24`,
> pero `main` ya avanzó con el commit `85cfbfc` (SovereignDB Postgres-backed,
> desplegable). La rama parte de `85cfbfc` para NO regresar ese fix ya publicado.

## Estados
`OPEN` · `IN_PROGRESS` · `FIXED` · `TESTED` · `VERIFIED` · `BLOCKED` · `REJECTED`

## Registro

| ID | Área | Sev | Archivo | Problema | Corrección | Test | Estado |
|---|---|---:|---|---|---|---|---|
| REP-001 | Contracto | P0 | `prisma/schema.prisma` vs `bookpi_ledger` | Prisma `BookPiLedger` (id/tenantId/index/eventType/amount/idempotencyKey/hash) no refleja el resto canónico PostgreSQL (`tenant_id/user_id/operation/category/cost_decimal/previous_hash/block_hash/status/nonce/signature_algorithm/pqc_signature`). Dos esquemas conceptuales. | Autoridad única: PostgreSQL = ledger (usado por `bookpi-postgres-repository`). Prisma alineado documentalmente en ADR-002; no se usa Prisma para BookPI en runtime (evita divergencia). | `verifyIntegrity()` postgres + tests bookpi | FIXED |
| REP-002 | BookPI | P0 | `bookpi-postgres-repository.ts` | `hashBlock` incluía `signatureAlgorithm` "SHA-256" mientras persistía "RSA-SHA256" → `verifyIntegrity` fallaba siempre tras append. Firma usaba `createSign("SHA256")` ignorando config (`ECDSA-P384`) → config dice A, código ejecuta B. | Payload canónico único (`canonical-payload.ts`) que EXCLUYE `pqcSignature`/`signatureAlgorithm`; firma sobre el hash; algoritmo 100% respetado vía `bookpi-signer.ts` + `BOOKPI_SIGNATURE_ALGORITHM`. | tests 001-005 bookpi-integrity | VERIFIED |
| REP-003 | BookPI | P0 | idem | Firma `null` podía persistirse en dev (bloque sin firma). | `signBlockHash` lanza si no hay firma; `verifyIntegrity` rechaza bloques sin firma o con firma inválida (§6.6). | test 005 | VERIFIED |
| REP-004 | BookPI | P0 | idem | Refund buscaba duplicado por `LIKE 'refund_of_%'` → carrera de 2 refunds. | `original_event_id` + `UNIQUE partial index` en DB; refund en transacción con `SELECT ... FOR UPDATE` (§6.7). | migrations + test 007 | TESTED |
| REP-005 | Webhooks | P0 | `billing.ts` | Idempotencia por búsqueda de texto en el ledger (`STRIPE_EVENT:` substring). | `webhook_events` con `UNIQUE(provider, provider_event_id)` + `claimWebhookEvent()` atómico; respuestas `duplicate`; fail-closed en prod. | migration `20260905100000` + unit logic | TESTED |
| REP-006 | Economía | P0 | `billing.ts` | Sin fuente de verdad económica reconstruible: saldo = `tenant.quotaBalance` mutable. | `economic_events` (amount_minor entero, direction, provider, UNIQUEs) + `recordEconomicEvent()` + `rebuildBalance()`/`sumEconomicBalance()`. El saldo pasa a ser proyección (§10). | `rebuild-balance.ts` + invariantes | TESTED |
| REP-007 | Env | P0 | `env-schema.ts` | `QUP_PEC_ENABLED`/`QUP_STRICT_ISOLATION` con `z.boolean()` sin coerción → arranque roto si se setean como strings. | Coerción `"true"/"false"` como `DURABLE_JSON_ALLOWED` (§18). | `tsc` + vitest suite | VERIFIED |
| REP-008 | Env | P0 | idem | Enum de algoritmo no incluía la firma realmente usada (RSA-SHA256); ML-DSA-87 sin demarcación. | Enum `ML-DSA-87|ECDSA-P384|RSA-SHA256`; ML-DSA-87 = simulación (nunca autoridad en prod, §17); clave RSA + algoritmo alineados en `.env.local`. | bookpi-signer tests | VERIFIED |
| REP-009 | Persistencia | P0 | `sovereign-engine.ts` | Estado económico en memoria + persistencia fire-and-forget. | Diseño documentado (sync hot path + hydrate por request); autoridad durable movida a Postgres; necesidades de refactor TX apuntadas en ADR-010. | — | OPEN |
| REP-010 | Health | P1 | `server.ts`/rutas | Sin readiness económica ni health checks. | `/api/health?stage=live|ready|deep` + `/api/economic-integrity` (§44/§45). | manual/smoke | TESTED |
| REP-011 | Marketplace | P0 | `billing.ts` | `DEFAULT_MARKETPLACE_LISTINGS` como fuente económica en código (in-memory). | Corregir a tabla `marketplace_listings` es refactor mayor → pendiente. Mientras, se validan límites con zod y se documenta en ADR-004. | — | OPEN |
| REP-012 | Prisma | P1 | `prisma/schema.prisma` | Modelo `BookPiLedger` menciona `idempotencyKey` que la tabla real no usa (el ledger usa `nonce`). | No se usa Prisma para BookPI en runtime; contrato real documentado en ADR-002. Migración Prisma pendiente de alinear si se reintroduce. | — | BLOCKED |

## Pendientes formales del manual (no completados en esta ronda de 1h)
- Refactor TX completo del pipeline económico (outbox, reconciliation worker).
- `marketplace_listings` en DB y retiro de defaults in-memory.
- Sesiones/API keys con revocación efectiva, rate limits por categoría, SBOM/sign/attestación, staging/chaos/DR.
- Endpoint `/api/bookpi/register` + persistencia de manuscritos/chunks/anchors/federación.