# Matriz de capabilities (generada)

> documentation ≠ implementation evidence. Generada por `node scripts/capability-matrix.mjs`.
> Estados: `real` (código + tests verdes aquí) · `evidence-gated` (requiere DB externa)
> · `manual` (sin evidencia automatizada; no autorizar fondos).

| Capability | Fuente | Test | Evidencia runtime | Estado |
|---|---|---|---|---|
| PDP authorization (RBAC+ABAC) | `src/lib/authorization.ts`<br>`src/lib/rbac.ts`<br>`src/lib/permission-matrix.ts`<br>`src/lib/abac.ts` | `test/unit/pdp-real.test.ts` | Decisiones firmadas ECDSA P-384 con motivo deny-*; 11 tests verdes. | real |
| Audit seal HMAC-SHA3-512 | `src/lib/sovereign-audit.ts` | `test/unit/pdp-real.test.ts` | Roundtrip + rechazo de manipulados; ML-DSA declarado SIMULATION-ONLY. | real |
| AEGIS semantic engine | `src/lib/aegis-semantic.ts`<br>`src/lib/latam-aegis-x.ts` | `test/security/aegis-adversarial.test.ts` | 7 detectores + scoring noisy-or integrados al firewall; 37 casos verdes. | real |
| Execution authority (Decide→…→Audit) | `src/lib/execution-authority.ts`<br>`src/lib/sovereign-pipeline.ts` | `test/integration/runtime-chain.test.ts` | toolExecuted:true con evidencia; approvals de un solo uso; 5 tests verdes. | real |
| Runtime integration chain | `src/lib/sovereign-pipeline.ts`<br>`src/lib/memory-engine.ts` | `test/integration/runtime-chain.test.ts` | PDP→CROWN→AEGIS→memory→audit con repos aislados; 5 tests verdes. | real |
| OTel durable observability | `src/lib/otel-exporter.ts`<br>`src/lib/latam-aegis-x.ts` | `test/unit/otel-exporter.test.ts` | Lote OTLP válido contra collector local; migración probada; 4 tests verdes. | real |
| CI ↔ production env parity | `.github/workflows/ci.yml`<br>`.github/workflows/release.yml`<br>`src/lib/env-schema.ts` | `test/unit/ci-env-parity.test.ts` | Conjunto exacto requiredEnvKeys(production); 2 tests verdes. | real |
| Inference policy (fail-closed prod) | `src/lib/inference-policy.ts`<br>`src/server-routes/api/isabella.ts` | `test/unit/inference-authority.test.ts` | 503 maintenance en prod sin proveedor; nativo declarado solo dev. | real |
| Production authority (6 autoridades) | `src/lib/production-authority.ts` | `test/unit/inference-authority.test.ts` | Abort en prod incompleta; ok con env completo; 3 tests verdes. | real |
| Stripe webhook signature | `src/server-routes/api/billing.ts` | `test/bookpi/financial-evidence.test.ts` | constructEvent real acepta/rechaza; sin red; 1 test verde. | real |
| Financial concurrency (idempotencia, reconciliación, refund único) | `src/lib/economic-events.ts`<br>`src/lib/repositories/bookpi-postgres-repository.ts` | `test/bookpi/financial-evidence.test.ts` | Gateados por DB: se omiten sin TEST_DATABASE_URL; corren en staging/CI con PG. | evidence-gated |
| Fraud review + payout guard + disputes | `src/lib/monetization/fraud-review.ts`<br>`src/server-routes/api/billing.ts` | `test/unit/fraud-review.test.ts` | Scoring, hold/decide un solo uso, doble aprobación, congelamiento por disputa; 12 tests verdes. | real |
| Backup/restore PG (snapshot + manifiesto) | `scripts/db-backup.mjs`<br>`scripts/db-restore.mjs`<br>`scripts/db-snapshot-lib.mjs` | `test/unit/db-snapshot.test.ts` | Manifiesto sha256 por tabla, restore aditivo ON CONFLICT DO NOTHING; 6 tests verdes. | real |
| Approval ledger durable (consumo atómico) | `src/lib/repositories/approval-repository.ts`<br>`supabase/migrations/20260907090000_approval_ledger.sql` | `test/bookpi/approval-evidence.test.ts` | Gateado por DB: SKIP LOCKED un ganador; grant idempotente. Corre con PG. | evidence-gated |
| Payment full-loop (payouts, chargebacks, fraud review) | `src/server-routes/api/billing.ts` | — | Sin evidencia automatizada: conteos pendientes, sin payouts automáticos. | manual |
