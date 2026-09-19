# ADR-011: Blueprint Maestro v2.0 — Adaptación al stack TypeScript

- **Estado:** Aceptado · **Fecha:** 2026-09-17
- **Autor:** Equipo Isabella AI
- **Fuente byte-a-byte:** `BLUEPRINT MAESTRO v2.0` (documento externo, entregado truncado en §3.5) + adjuntos canónicos NCUA v2.0.

## Contexto

El blueprint propone elevar Isabella a "plataforma multimodal, alineada,
comercializable y soberana" con arquitectura ML production-grade. Sin embargo,
su análisis técnico detectó un repositorio **Python** (`requirements.txt`,
`isabella/model.py`, PyTorch/Transformers/PEFT/FAISS, FastAPI, Poetry, MLflow/DVC,
Stripe) que **no corresponde** a este repositorio.

`isabella-ai-genesis` es **TypeScript/Node** (TanStack Start, pnpm con lockfile
congelado, vitest, ESLint+tsc estrictos, Vercel + Supabase/PostgreSQL, GitHub
Actions). Aplicar el blueprint verbatim (pyproject.toml, `Dockerfile FROM
python:3.10-slim`, `app/main.py`) rompería el stack y violaría AGENTS.md
(TypeScript estricto, sin `process.env` fuera de `config.ts`, sin secretos,
main siempre desplegable, compatibilidad Lovable/Vercel).

**Decisión:** no migrar de runtime. Se adoptan los **objetivos y conceptos** del
blueprint y se mapean a módulos nativos TS ya existentes; los huecos genuinos
entran al roadmap. Los fragmentos de código Python del blueprint se descartan
como material ilustrativo, no aplicable.

## Mapeo concepto → módulo real

| Concepto blueprint | Decisión | Módulo nativo del repo |
| --- | --- | --- |
| Entorno reproducible (Poetry + hashes) | Ya cubierto | `pnpm` + `pnpm-lock.yaml` congelado, `packageManager` y `engines (>=22 <25)` en `package.json`, CI en `.github/workflows/`. Sin DVC/MLflow: no se entrenan pesos en runtime. |
| Servicio de inferencia (FastAPI `POST /generate`) | Panel de inferencia gobernado | `src/lib/intelligence/*` (`model-registry`, `durable-model-registry`, `open-model-catalog`, `production-model-gate`, `inference-firewall`, providers `gemini`/`ollama`/`openai-compatible`/`http`, `local-egress`, `router`) + `src/lib/api-contracts.ts` + `src/lib/api-gateway.ts`. |
| API keys + rate limiting + sanitización | Ya cubierto | `src/lib/api-key-*`, `src/lib/capability-tokens.ts`, `src/lib/api-key-authenticator.ts`, `src/lib/input-limits.ts`, `src/lib/inference-firewall.ts`, `src/lib/trusted-client-ip.ts`; tests en `test/security/*` (`aegis-adversarial`, `ssrf`, `request-boundary-hardening`, `capability-token`). |
| Modelo con LoRA/PEFT (adaptadores) | NO aplica a pesos locales; equivalencia adapters provider-neutral | `src/lib/isabella-learning-api.ts` (`ingest`/`retrieve`/`evaluate`/`snapshot`), estados de competencia acotados `[0,1]` y versionados. La actualización de pesos de modelos queda como capacidad provider-specific con evidencia independiente (ver `docs/architecture/ISABELLA-LEARNING-ARCHITECTURE.md`). |
| RAG (FAISS + SentenceTransformers) | Memoria soberana + NCUA kg/embed + pgvector (roadmap) | `src/lib/memory-engine.ts` + `src/lib/repositories/memory-repository.ts`; `src/lib/ncua/{kg,intent,embed,lsh}.ts`; Supabase/PostgreSQL. **No** se introduce FAISS. |
| RLHF (feedback humano) | Loop de preferencias/constrastivo, sin ajuste de pesos | Modos de aprendizaje Preference/Contrastive/Reflective de la Learning Architecture + BookPI `approval-evidence`/`decision-ledger` + feedback con consentimiento y dedupe por firma SHA3-512. |
| Multimodalidad (audio+imagen) | Texto+audio parcial; visión pendiente (roadmap) | `src/lib/voice.ts` (audio), `src/lib/attachments.ts`, modo Multimodal de la Learning Architecture. Imagen/visión es el **gap real**. |
| Monetización (Stripe, planes, marketplace) | Ya cubierto (ledger soberano, no Stripe directo) | `billing-authorization.ts`, `economic-events.ts`, `financial-settlement.ts`, `accounting/*` (double-entry), `bookpi/*` (royalties), `monetization/payout-executor.ts`; ADR-002 (api-key-plane), ADR-004 (economic-events), ADR-006 (webhook idempotencia), ADR-007 (refund inmutabilidad), ADR-010 (concurrencia). |
| Observabilidad (Prometheus + Sentry) | Ya cubierto vía OpenTelemetry | `src/lib/telemetry/*` (`otel-init`, `otel-neutral`, `observability`, `health`, `coverage`) + `src/lib/ncua/metrics.ts`. |
| NCUA v2.0 tokenless + ERI≥95 + BookPI + QUP | Ya implementado y verificado | `src/lib/ncua/*` (`entropy-patcher`, `eri`, `sophia-epistemics`, `concept-engine`, `quantum-align`, `bookpi-trajectory`, `academic-pipeline`, `benchmark`) + tests `test/unit/ncua-*.test.ts` y carga `test/security/ncua-load.test.ts`. |
| Secretos hardcodeados (claves `ISABELLA_SOVEREIGN_KEY_V433` / `ISABELLA_ACADEMIC_SOVEREIGN_KEY_V433` de los adjuntos) | Rechazado por AGENTS.md | Clave HMAC derivada de `config().AEGIS_AUDIT_SECRET` o inyectada en tests; `fail-closed` si ausente (`bookpi-trajectory.ts`). |

## Pendiente (roadmap priorizado, en TS)

1. **P1 — Loop RLHF formal:** exponer `POST /api/learning/feedback` →
   episode de preferencia → evidencia BookPI → refuerzo de competencia
   acotado `[0,1]` (reutilizando `isabella-learning-api`). No ajusta pesos.
2. **P1 — RAG con pgvector:** embeddings de corpus territorial (Nodo Cero /
   Real del Monte) en Supabase/PostgreSQL, retrievers nativos conectados a
   `memory-engine` y al KG NCUA.
3. **P2 — Visión multimodal:** entrada de imagen en el pipeline perceptivo
   (Perceive) con sello y descripción auditables antes de SOPHIA/ERI.
4. **P2 — Métricas de negocio por API key:** uso/costo por tenant (billing
   granular) alimentadas por `telemetry`/`ncua/metrics`.
5. **P2 — Dashboard de observabilidad** sobre el plano OTel existente.

## Riesgos

- Introducir dependencias Python o "adapters LoRA" locales falsificaría
  "model-weight training" sin pipeline de entrenamiento verificado → viola la
  regla de producción de la Learning Architecture.
- FAISS/MLflow/DVC sin entrenamiento real añadiría infraestructura muerta.
- Incorporar claves hardcodeadas de los adjuntos = fallo de seguridad.

## Referencias

- `AGENTS.md` (§1, §8, §12–§14): stack TS, prohibición de secretos y
  `process.env`, gates de validación.
- `docs/architecture/ISABELLA-LEARNING-ARCHITECTURE.md`: modos de aprendizaje y
  regla de producción (separación conocimiento vs. pesos).
- `docs/architecture/ISABELLA-COGNITIVE-TRAINING.md`, `docs/ROADMAP-PRODUCTION-HARDENING.md`,
  `docs/operations/CAPABILITY_MATRIX.md`, `docs/rfcs/RFC-0001-*`.
- ADRs: `ADR-001/002-authorization|api-key-plane`, `ADR-004-bookpi-integrity`,
  `ADR-006-webhook-idempotency`, `ADR-007-refund-immutability`, `ADR-010-concurrency`.
- `src/lib/ncua/*`: implementación v2.0 (ERI≥95, QUP SHA3-512, BookPI HMAC, benchmark).
- Doc externo: `BLUEPRINT MAESTRO v2.0` (Python, no aplicable al código) + adjuntos
  `ncua-tokenless-engine.ts`, `ncua-academic-pipeline.ts`, `ncua-benchmark-and-tuning.ts`.