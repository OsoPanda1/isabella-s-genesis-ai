# Matriz de dependencias (isabella-ai-genesis)

> **NoInstanceState:** lo que sigue es un mapa estático de las dependencias
> principales del sistema, útil para entender qué componentes afectan la
> disponibilidad económica y la integridad del ledger.

| Componente | Dependencias | Impacto si cae | Fail-closed | Nota |
|---|---|---|---|---|
| BookPI Ledger (Postgres) | Neon/Supabase `DATABASE_URL` | No se pueden registrar créditos ni procesar consumos (§6.5) | Sí: `/api/health?stage=deep` = 503; charge = DENY | Único autor del estado económico (ADR-001) |
| Auth (JWT) | `AUTH_JWT_SECRET` (Vercel env) | Todas las rutas protegidas caen 401/403 | Sí | El secret debe tener ≥32 chars |
| Gemini (Generative AI, federado) | `GEMINI_API_KEY` (Vercel env) | Producción: 503 `inference_unavailable` explícito (sin fallback generativo). Desarrollo: SSE declarado `provider: native-fallback, degraded: true` | Sí en prod (503 maintenance) | Substrato de inferencia externo: arquitectura de gobernanza soberana, inferencia federada |
| Stripe (Facturación) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (Vercel env) | No se procesan pagos, grants, ni topups | Sí: webhook sin secret válido = 400 | Webhook idempotente por `webhook_events` |
| SovereignDB (engine) | In-memory + Postgres ledger (si DURABLE_JSON_ALLOWED=false) | Snapshot de tenants inaccesible → econ-deny | Parcial: heartbeat sigue (S3) | Postgres es fuente durable; refetch por request |
| SecuritySystem | Crypto + config | No se inyectan cabeceras, no se valida admin | Sí: `/api/health` en deny | Raramente cae |
| Certbot / SSL | DNS, certbot, Lets Encrypt | HTTPS cae → la app es inaccesible desde browser | Sí | Configuración manual del dominio |
| DNS | Registrar DNS (ej. Cloudflare/Vercel) | Dominio inalcanzable | Sí | El dominio se redirige a Vercel |
| Neon DB (independiente) | `DATABASE_URL` / `DATABASE_DIRECT_URL` | Ledger económico y proyección no disponibles | Sí (carga = DENY) | Conexión: `DATABASE_URL` es la de apps; `DATABASE_DIRECT_URL` solo para migraciones |

## Variables de entorno obligatorias en Vercel (fail-fast si faltan)
`NODE_ENV` · `PUBLIC_URL` · `SUPABASE_URL` · `SUPABASE_ANON_KEY` · `AUTH_JWT_SECRET` · `GEMINI_API_KEY` · `ENCRYPTION_MASTER_KEY` · `CROWN_POLICY_SIGNING_KEY` · `AEGIS_AUDIT_SECRET` · `BOOKPI_SIGNING_KEY` · `STRIPE_SECRET_KEY` · `STRIPE_WEBHOOK_SECRET` · `DATABASE_URL`

## Flags forzados a `false` en producción
`DURABLE_JSON_ALLOWED` · `AUTH_DEV_SESSION_ENABLED` · `ALLOW_GUEST_CHAT`

## Deuda técnica abierta
1. **Transaccionalidad (P0):** ledger + economic_events + saldo en una sola
   TX → outbox transaccional + worker (ADR-010).
2. **DEFAULT_MARKETPLACE_LISTINGS (P0):** fuente económica in-memory → tabla
   `marketplace_listings` (ADR-004 pendiente).
3. **Revocación efectiva de sesiones/API keys (P1):** ACLs actuales son
   degradación parcial (session invalidation no persistente).
4. **Rate limits por categoría (P1):** actualmente sin distinción
   (`QUOTA_SYSTEM_MODE` 1.0 pero no consume).
5. **Chaos/DR/staging (P1):** sin pipeline de chaos ni recoverpoint.