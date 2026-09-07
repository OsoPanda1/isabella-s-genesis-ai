# ADR-004: Eventos económicos como fuente de verdad; saldo = proyección

- **Estado:** Aceptado · **Fecha:** 2026-09-05
- **Contexto:** `tenant.quotaBalance` en memoria es mutable y puede divergir del
  ledger; info de facturación no tiene query para reconciliación.
- **Decisión:** `economic_events` es la fuente de verdad económica:
  - `amount_minor` BIGINT (enteros, nunca flotantes).
  - `direction` `CREDIT|DEBIT` con CHECK.
  - Idempotencia: `UNIQUE(tenant_id, idempotency_key)` y
    `UNIQUE(provider, provider_event_id)`.
  - `source` distingue STRIPE | QUANTUM | TOPUP.
  Se registran eventos para grants de suscripción, cargos de hardware y topups.
  El saldo operativo se expone como proyección
  (`sumEconomicBalance`) y puede reconstruirse (`rebuildBalance`).
- **Consecuencias:** `DEFAULT_MARKETPLACE_LISTINGS` en código NO es fuente
  económica autorizada (pendiente: tabla `marketplace_listings`; ver
  DEPENDENCY_MATRIX.md).