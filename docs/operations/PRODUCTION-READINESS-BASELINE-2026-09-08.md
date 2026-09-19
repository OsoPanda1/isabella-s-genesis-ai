# Production Readiness Baseline — 2026-09-09

## Status

**Current classification: NOT Production-Verified.**

This document is an evidence ledger, not a declaration of readiness. A capability is production-verified only after reproducible green CI, database, deployment and runtime evidence exist.

## Current commit

`375f4d1df528ffe3c2a511330ffea86bdf007bd3`

## Evidence observed

| Gate | State | Evidence |
|---|---|---|
| Canonical Isabella gateway | Implemented | `src/lib/isabella-chat-gateway.ts` |
| Canonical `/api/isabella` | Implemented | `src/routes/api/isabella.ts` |
| Compatibility `/api/v1/isabella` | Implemented | `src/routes/api/v1/isabella.ts` |
| Duplicate legacy Isabella route | Removed | `src/server-routes/api/isabella.ts` absent by design |
| Governance / CROWN | Implemented | Canonical gateway and principal context |
| Distributed rate limiting | Implemented | Production gateway path |
| Kill switch | Implemented | Production gateway path |
| Gemini provider | Implemented | Streaming REST gateway |
| Standard API envelope | Implemented | `src/lib/api-contracts.ts` |
| Production integrity gate | Implemented | `scripts/production-integrity-gate.mjs` |
| Production preflight | Implemented | `scripts/production-preflight.mjs` |
| Canonical CI gate | Configured | `.github/workflows/fgais-gate.yml` + reusable `.github/workflows/ci.yml` |
| Supabase baseline migration | Corrected | Canonical `audit_events` table and trigger ordering |
| Supabase corrective migration | Implemented | `supabase/migrations/20260908180000_audit_immutability_correction.sql` |
| Vercel configuration | Corrected | `vercel.json` now delegates TanStack Start output handling and pins frozen-lockfile install |
| Vercel deployment | **Failing** | Latest check for commit `375f4d1...` is failure; deployment logs are not exposed by repository tooling |
| GitHub Actions | Not yet evidenced green | No executable workflow run is currently associated with the latest commit |
| Production HTTP smoke test | Not verified | Requires live endpoint evidence |
| Production secrets/configuration | Not verified | Secrets are intentionally not inspectable through repository tooling |
| Database backup/restore drill | Not verified | Requires real environment evidence |
| Disaster recovery drill | Not verified | Requires real environment evidence |

## Defects corrected during this pass

1. Vercel configuration contained an explicit `outputDirectory` for a TanStack Start/Nitro deployment; this was removed so the framework adapter controls its output.
2. Vercel now uses `pnpm install --frozen-lockfile`, matching the repository's deterministic package contract.
3. The reusable CI wrapper was restored so documentation/capability references no longer point to a deleted workflow while keeping one canonical gate implementation.
4. The production readiness record was reconciled with the actual current commit and current deployment evidence.

## Remaining P0 blockers

1. Obtain a green Vercel deployment for the corrected configuration and same source commit.
2. Obtain a green GitHub FGAIS gate with executable steps and passing typecheck/lint/test/build/integrity/preflight/capability/route checks.
3. Obtain a green Supabase migration replay/preview result from the current migration set.
4. Run production HTTP smoke tests for liveness, readiness and Isabella inference.
5. Verify production environment variables/provider connectivity without exposing secrets.
6. Execute database backup/restore evidence.
7. Execute rollback evidence.

## P1 hardening

1. Reconcile remaining generated documentation references to removed legacy Isabella routes.
2. Remove non-authoritative `Math.random()` usage from security/authority-adjacent identifiers; UI-only visual randomness remains non-authoritative.
3. Add adversarial tenant-isolation and multimodal abuse tests.
4. Verify Gemini timeout/cancellation behavior under sustained streaming.
5. Verify audit-chain integrity across restart/failover.
6. Verify rate-limit capacity and Redis failure behavior under load.
7. Verify billing/BookPI settlement against real provider usage.
8. Verify dependency vulnerability/license gates on the production lockfile.

## Conservative readiness score

- Runtime implementation: **~92%**
- Security/governance controls: **~89%**
- Test/CI evidence: **~45%**
- Database production evidence: **~68%**
- Deployment evidence: **~50%**
- Operations/DR evidence: **~45%**

**Overall production readiness estimate: ~70%.**

**Overall deployment readiness estimate: ~58%.**

These are engineering-readiness estimates, not production certification. They must not become 100% until all P0 evidence gates are reproducibly green.

## Certification rule

`Production-Verified` requires:

`code implemented` + `tests green` + `build green` + `database green` + `deployment green` + `runtime smoke green` + `rollback evidence` + `secrets/config verified`.

Until then, the correct status remains `Implemented/Tested` or `Partial`.
