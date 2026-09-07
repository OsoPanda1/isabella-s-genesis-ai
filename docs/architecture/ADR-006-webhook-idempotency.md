# ADR-006: Idempotencia de webhooks por constraint de DB

- **Estado:** Aceptado · **Fecha:** 2026-09-05
- **Contexto:** `billing.ts` buscaba duplicados por substring de texto en el
  ledger (`STRIPE_EVENT:${eventId}`) → carrera/duplicados y mezcla de texto en
  datos económicos.
- **Decisión:** `webhook_events` con
  `UNIQUE(provider, provider_event_id)` (`uq_webhook_provider_event`).
  `claimWebhookEvent()` hace `INSERT ... ON CONFLICT DO NOTHING` y devuelve
  estados de negocio:
  - `processed` → primera entrega (procesar).
  - `duplicate` → reintento (responder `{duplicate:true}`).
  - `error` → fallo de persistencia → fail-closed en producción (500).
- **Consecuencias:** la idempotencia ya no depende de textos ni de memoria;
  las respuestas a Stripe son corréctas bajo reintento.

## Referencias
- `src/lib/economic-events.ts`; migración `20260905100000_economic_contract.sql`.