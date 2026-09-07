-- ============================================================================
-- ECONOMIC CONTRACT & IDEMPOTENCY (P0 — Manual de Reparación §4, §5, §6.7)
-- Author: Isabella Sovereign Hub
-- Target Platform: PostgreSQL (Supabase / Neon Compatible)
-- ============================================================================
-- Objetivos:
--  1. `webhook_events`: idempotencia REAL de webhooks por UNIQUE(provider,
--     provider_event_id). Reemplaza la búsqueda de texto en el ledger.
--  2. `economic_events`: modelo económico canónico (fuente de verdad) con
--     amount_minor (enteros/centavos), dirección, proveedor y dos constraints
--     de unicidad: UNIQUE(provider, provider_event_id) y
--     UNIQUE(tenant_id, idempotency_key).
--  3. `bookpi_ledger.original_event_id`: idempotencia de REFUND por
--     constraint de base de datos (UNIQUE partial), nunca por LIKE/scan.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. WEBHOOK EVENTS — deduplicación atómica (§5)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_events (
    id BIGSERIAL PRIMARY KEY,
    provider VARCHAR(32) NOT NULL,
    provider_event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    status VARCHAR(16) NOT NULL DEFAULT 'received'
        CHECK (status IN ('received', 'processed', 'failed', 'ignored_duplicate')),
    error TEXT,
    CONSTRAINT uq_webhook_provider_event UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);

-- ----------------------------------------------------------------------------
-- 2. ECONOMIC EVENTS — fuente de verdad económica (§4)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS economic_events (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(128) NOT NULL,
    actor_id VARCHAR(128) NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'USD',
    amount_minor BIGINT NOT NULL DEFAULT 0,
    direction VARCHAR(8) NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
    source VARCHAR(128) NOT NULL DEFAULT 'internal',
    provider VARCHAR(64),
    provider_event_id VARCHAR(255),
    idempotency_key VARCHAR(128),
    correlation_id VARCHAR(128),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Un proveedor jamás duplica un evento económico.
    CONSTRAINT uq_economic_provider_event UNIQUE (provider, provider_event_id),
    -- Idempotencia de la operación por tenant + clave de negocio.
    CONSTRAINT uq_economic_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_economic_tenant_created
    ON economic_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_economic_provider_event
    ON economic_events(provider, provider_event_id);

-- ----------------------------------------------------------------------------
-- 3. REFUND IDEMPOTENCY — UNIQUE partial sobre bookpi_ledger (§6.7)
-- ----------------------------------------------------------------------------
ALTER TABLE public.bookpi_ledger
    ADD COLUMN IF NOT EXISTS original_event_id VARCHAR(128);

-- Un bloque de refund solo puede existir una vez por evento original.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookpi_refund_original
    ON public.bookpi_ledger (original_event_id)
    WHERE original_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookpi_ledger_tenant_index
    ON public.bookpi_ledger(tenant_id, index);