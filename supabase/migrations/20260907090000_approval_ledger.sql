-- ============================================================================
-- APPROVAL LEDGER — aprobaciones humanas durables de un solo uso
-- Target Platform: PostgreSQL (Supabase / Neon Compatible)
-- ============================================================================
-- Las aprobaciones de la Execution Authority no pueden vivir solo en
-- memoria del proceso (multi-instancia en Vercel las perdería). Esta tabla
-- las hace durables con consumo atómico (UPDATE ... WHERE NOT consumed).
-- ============================================================================

CREATE TABLE IF NOT EXISTS approval_grants (
    approval_id VARCHAR(64) PRIMARY KEY,
    trace_id VARCHAR(128) NOT NULL,
    tool VARCHAR(128) NOT NULL,
    actor_id VARCHAR(128) NOT NULL,
    tenant_id VARCHAR(128) NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed BOOLEAN NOT NULL DEFAULT FALSE,
    consumed_at TIMESTAMPTZ,
    CONSTRAINT uq_approval_trace_tool UNIQUE (trace_id, tool, actor_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_approval_grants_expiry
    ON approval_grants(expires_at) WHERE consumed = FALSE;

-- RLS defensiva deny-all (el runtime owner omite RLS; anon/authenticated denegados).
ALTER TABLE approval_grants ENABLE ROW LEVEL SECURITY;
