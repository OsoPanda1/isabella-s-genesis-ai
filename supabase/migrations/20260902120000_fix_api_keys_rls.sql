-- FIX: Correct RLS for api_keys — claim → claims + granular policies
-- Covers DBs where 20260901142000 already applied with buggy singular claim

DROP POLICY IF EXISTS api_keys_tenant_isolation ON public.api_keys;
DROP POLICY IF EXISTS api_keys_select ON public.api_keys;
DROP POLICY IF EXISTS api_keys_insert ON public.api_keys;
DROP POLICY IF EXISTS api_keys_update ON public.api_keys;
DROP POLICY IF EXISTS api_keys_delete ON public.api_keys;

CREATE POLICY api_keys_select ON public.api_keys
  FOR SELECT USING (tenant_id = current_setting('request.jwt.claims.tenant_id', true));
CREATE POLICY api_keys_insert ON public.api_keys
  FOR INSERT WITH CHECK (tenant_id = current_setting('request.jwt.claims.tenant_id', true));
CREATE POLICY api_keys_update ON public.api_keys
  FOR UPDATE USING (tenant_id = current_setting('request.jwt.claims.tenant_id', true)) WITH CHECK (tenant_id = current_setting('request.jwt.claims.tenant_id', true));
CREATE POLICY api_keys_delete ON public.api_keys
  FOR DELETE USING (tenant_id = current_setting('request.jwt.claims.tenant_id', true));
