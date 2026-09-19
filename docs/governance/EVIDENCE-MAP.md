# Mapa de Evidencia — Charter FGAIS v2.0 ↔ Repositorio

> Operacionaliza D.5 (correspondencia estricta) y §13.3 (Evidence Registry).
> Cada claim/control del Charter apunta a implementación + prueba.
> Estados: `real` (código + tests verdes aquí) · `evidence-gated` (requiere
> PG/Stripe en CI/staging) · `manual` (proceso humano, sin automatizar).

## Claims Registry (§13.1)

| CLAIM-ID | Afirmación | Evidencia en repo | Estado |
|---|---|---|---|
| CLAIM-001 | Origen en Real del Monte, Hidalgo | Historial git + este documento + `docs/governance/` | VERIFIED |
| CLAIM-002 | HITL en operaciones de alto riesgo | `src/lib/execution-authority.ts` (approvals un solo uso) + `test/integration/runtime-chain.test.ts` + `approval-request/status` en `/api/db` | TESTED (no `Production-Verified`) |
| CLAIM-003 | Audit logging tamper-evident | `src/lib/repositories/audit-repository.ts` (hash chain) + `test/security/isolation-evidence.test.ts` (tamper + 20 escritores) | TESTED (WORM pendiente → Partial) |
| CLAIM-004 | Diseño para LFPDPPP/GDPR cuando aplique | Controles: minimización en `secret-redactor.ts`, RLS, retención en repos | EN PROCESO |

## Control Registry (§13.2 + §4.5)

| Control | Evidencia | Estado |
|---|---|---|
| RBAC mínimo (CTRL-002) | `src/lib/rbac.ts` + `permission-matrix.ts` + `test/unit/pdp-real.test.ts` | Implemented |
| ABAC policy evaluation | `src/lib/abac.ts` (deny-overrides, `notApplied` fail-closed) + tests | Implemented (Charter dice Designed: conservador) |
| Tenant isolation (CTRL-003) | `tenant-guard/context`, RLS por tabla, `test/security/isolation-evidence.test.ts` (crossover) | Partial (WORM y PG total pendientes) |
| Tamper-evident audit | hash chain + firmas HMAC-SHA3-512 + tests tamper | Partial (WORM pendiente) |
| HITL alto riesgo | Execution Authority + capability tokens + `emergency-*` API | Implemented (UI de revisión: manual) |
| Secret management | `src/lib/secrets.ts` (KMS, fail-fast) + `secret-scan.mjs` + `env-contract.test.ts` | Partial (rotación 90d: Planned) |
| Key rotation | `src/lib/key-rotation.ts` + versionado de formato | Planned (cron de 90d pendiente) |
| SAST | `github/codeql-action@v4` + `codeql-config.yml` oficial | Implemented |
| DAST | — | Planned |
| SCA | `pnpm audit` en CI + `scripts/supply-chain.mjs` | Implemented |
| Secret scanning | `secret-scan.mjs` + TruffleHog en CI | Implemented |
| SBOM | job release (`release.yml`) | Partial (verificar artefacto por release) |
| Kill switch (§7.1) | `src/lib/kill-switch.ts` + migración + `emergency-*` + `test/unit/kill-switch.test.ts` | Implemented (pruebas trimestrales: proceso) |
| MFA admins (CTRL-001) | — | Planned |
| Penetration test | — | Planned (anual) |

## Criptografía (§4.1)

| Estándar | Evidencia | Estado |
|---|---|---|
| ML-KEM / ML-DSA | Declarados SIMULATION-ONLY (`bookpi-signer.ts` fail-closed, manifiesto `simulated`) | Planned ✓ honesto |
| HKDF-SHA3-512 | `kms-provider.ts:subKey` + `test/unit/kms.test.ts` | Implemented |
| AES-256-GCM | `kms-provider.ts` + tests roundtrip/tamper | Implemented |
| SHA3-512 | `sovereign-audit.ts`, hashes de cadena | Implemented |

## Capacidades sensibles (§7.5, matriz)

Ver `docs/operations/CAPABILITY_MATRIX.md` (generada y verificada por
`node scripts/capability-matrix.mjs --check`, 27 entradas) y
`production-capabilities.json` (validado por `test/unit/production-capabilities.test.ts`).

## Brechas abiertas con dueño y fecha (D.5: nada sin clasificar)

| Brecha | Dueño | Evidencia actual | Test ID |
|---|---|---|---|
| WORM audit storage | CISO | hash chain + firmas (no WORM) | isolation-evidence |
| MFA admins | CISO | inexistente | — |
| DAST / pentest | AI Safety | inexistente | — |
| Payouts en vivo Stripe | CGO | executor + guard + disputes; sin transferencia real ejecutada | payout-executor |
| Multi-región | Infrastructure | runbook región única | — |
| Nonce-CSP enforcement | CISO | Report-Only + doc | response-headers |
