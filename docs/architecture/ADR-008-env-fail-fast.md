# ADR-008: Env schema fail-fast y coerción booleana

- **Estado:** Aceptado · **Fecha:** 2026-09-05
- **Contexto:** `QUP_PEC_ENABLED`/`QUP_STRICT_ISOLATION` se declaraban
  `z.boolean()` sin coerción; con la plataforma (y los papers del equipo)
  seteándolos como strings, el arranque fallaba. `BOOKPI_SIGNATURE_ALGORITHM`
  tenía un enum incompleto y sin simulación demarcada.
- **Decisión:**
  1. Booleans admiten `"true"/"false"/true/false` con `z.preprocess`
     (mismo patrón que `DURABLE_JSON_ALLOWED`), invalidando cualquier otro
     valor — falla rápido y claro.
  2. `BOOKPI_SIGNATURE_ALGORITHM` = `["ML-DSA-87","ECDSA-P384","RSA-SHA256"]`
     (default `ECDSA-P384`); `ML-DSA-87` marcado simulation-only por ADR-005.
- **Enforcement:** en modo `production`, `config()` exige todas las vars de la
  matriz superior (NODE_ENV, PUBLIC_URL, SUPABASE_URL, SUPABASE_ANON_KEY,
  AUTH_JWT_SECRET, GEMINI_API_KEY, ENCRYPTION_MASTER_KEY,
  CROWN_POLICY_SIGNING_KEY, AEGIS_AUDIT_SECRET, BOOKPI_SIGNING_KEY,
  STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, DATABASE_URL) y fuerza a `false`
  `DURABLE_JSON_ALLOWED`, `AUTH_DEV_SESSION_ENABLED`, `ALLOW_GUEST_CHAT`.
- **Conocido:** `DATABASE_URL` está declarada DOBLE en `.env.local`;
  consolidarla requiere saber cuál mysql/Neon de destino es la real — no lo
  adivine el runtime; el usuario validará.

## Referencias
- `src/lib/env-schema.ts`, `src/lib/config.ts`, `.env.local`, `.env.example`.