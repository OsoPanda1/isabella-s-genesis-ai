-- API KEY SCHEMA MIGRATION FOR ISABELLA AI
-- AUTHORITATIVE TRUST PLANE

CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  name VARCHAR(150) NOT NULL,
  prefix VARCHAR(32) NOT NULL UNIQUE,
  key_hash TEXT NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL,
  scopes TEXT[] NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'suspended', 'expired', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  rotated_from UUID,
  created_by VARCHAR(64),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation Policies — FIX 2026-09-02: request.jwt.claims (plural) + granular per-operation
DROP POLICY IF EXISTS api_keys_tenant_isolation ON public.api_keys;
CREATE POLICY api_keys_select ON public.api_keys
  FOR SELECT USING (tenant_id = current_setting('request.jwt.claims.tenant_id', true));
CREATE POLICY api_keys_insert ON public.api_keys
  FOR INSERT WITH CHECK (tenant_id = current_setting('request.jwt.claims.tenant_id', true));
CREATE POLICY api_keys_update ON public.api_keys
  FOR UPDATE USING (tenant_id = current_setting('request.jwt.claims.tenant_id', true)) WITH CHECK (tenant_id = current_setting('request.jwt.claims.tenant_id', true));
CREATE POLICY api_keys_delete ON public.api_keys
  FOR DELETE USING (tenant_id = current_setting('request.jwt.claims.tenant_id', true));

-- Create indexes for extremely fast lookup
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON public.api_keys(prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON public.api_keys(tenant_id);
