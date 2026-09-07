# ADR-009: Health checks y economic integrity

- **Estado:** Aceptado · **Fecha:** 2026-09-05
- **Contexto:** No había readiness ni verificación de la cadena económica.
- **Decisión:** dos endpoints internos:
  - `GET /api/health?stage=live|ready|deep`
    - `live` → proceso vivo (sin dependencias).
    - `ready` → PostgreSQL alcanzable (`SELECT 1`).
    - `deep` → PostgreSQL + BookPI `verifyIntegrity()` + disponibilidad de
      `GEMINI_API_KEY` (IMPORTANTE: solo info booleana, nunca secretos).
  - `GET /api/economic-integrity`
    - 200 OK únicamente si signer real + cadena válida + proyección disponible.
    - 503 `economic_integrity_failure` si alguno falla.
  Ambos inyectan cabeceras de seguridad (SecuritySystem).

## Referencias
- `src/routes/api/health.ts`, `src/routes/api/economic-integrity.ts`.