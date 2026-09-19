# P0 Implementation Status — 2026-09-09

## Current commit

`ea01ca9b6db5c32f5f1e3797cb095e7c55582b61`

## Completed in this pass

### Genesis evidence integrity

- `ClaimEngine` derives `dependencyLockHash` from the actual `pnpm-lock.yaml` using SHA3-512.
- The previous all-zero placeholder producer has been removed.
- The production integrity gate continues to reject placeholder lock hashes and malformed committed Genesis manifests.

### Isabella learning and cognitive runtime

- Provider-neutral learning core is implemented beyond token accumulation.
- Eight cognitive training strategies are implemented: semantic, procedural, contrastive, counterfactual, retrieval, reflection, preference and multimodal.
- Native executable learning API is exposed at `/api/isabella-learning`.
- Native executable cognitive-training API is exposed at `/api/isabella-cognitive-training`.
- Tenant learning state is persisted as a versioned, SHA3-512 integrity-checked PostgreSQL snapshot when `DATABASE_URL` is configured.
- Learning snapshots are canonicalized before hashing so PostgreSQL JSONB key ordering cannot invalidate integrity verification.
- The learning migration is part of the repository's ordered SQL migration set and is applied by the existing PostgreSQL migration path.
- The API catalog points to executable routes instead of documentation-only `/v1/...` paths.
- The live `/api/isabella` inference path now retrieves tenant-scoped learned references before provider invocation and injects them as explicitly untrusted context.
- Learning provenance (memory IDs, concepts and durable-state availability) is attached to inference telemetry/SSE metadata.
- A dedicated cognitive-runtime test covers learned-context injection and the no-memory path.

### Isabella governed skill execution

- Native `/api/isabella-skills` endpoint exposes the registered skill catalog.
- Skill execution is routed through `runIsabellaSkill`, including identity validation, CROWN/ARGUS authorization, input/output validation and BookPI audit settlement.
- Unknown skills remain deny-by-default.

### Isabella inference

- Primary Gemini model is `gemini-3.8-flash`; the gateway also supports Groq and xAI fallback providers when configured.
- Gemini requests no longer send the deprecated `temperature` generation parameter; fallback OpenAI-compatible providers retain their provider-specific temperature handling.
- The inference gateway preserves tenant authentication, policy checks, kill-switch checks, provider failover, SSE streaming and trace metadata.

## CI evidence status

The latest recorded FGAIS run before this implementation wave (`34392000928`) terminated with `failure` and GitHub exposed `steps: null` and no downloadable logs. Its head was `ba1b2798ecce06cd435173fd2c177d5f5d9227e1`, so it does not validate the newer commits in this document. A successful CI run for the current candidate commit is still required.

## Remaining P0 blockers

1. **Executable CI evidence:** GitHub Actions must expose real job steps/logs and complete the FGAIS gate successfully for the exact candidate commit.
2. **Production deployment evidence:** Vercel/Nitro deployment must complete successfully from the same candidate commit.
3. **Database evidence:** Migration replay/verification, backup and restore must execute against the real authoritative production database.
4. **Runtime smoke evidence:** Production HTTP liveness/readiness/inference, skill execution and learning endpoints must be exercised successfully.
5. **Provider/secrets evidence:** Gemini (and at least one fallback provider where intended), BookPI signing key, authentication secrets, database and Stripe configuration must be verified in the actual deployment environment without exposing secrets.
6. **Rollback evidence:** A real rollback must be executed and verified against the deployment target.
7. **Remaining production-path simulation:** Any simulation that can reach an authoritative production path must be replaced by a real provider or kept strictly outside production authority.

## Certification rule

The repository is **functionally implemented in code but NOT Production-Verified** until code, tests, build, database, deployment, runtime smoke, secrets/configuration and rollback evidence are all reproducibly green.
