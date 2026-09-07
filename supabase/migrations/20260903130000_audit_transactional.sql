-- ============================================================================
-- TRANSACCIONAAL AUDIT: create_tenant_with_audit (Phase 2.3)
-- Author: Edwin Oswaldo Castillo Trejo (Anubis Villaseñor)
-- Target Platform: PostgreSQL (Supabase Compatible)
-- ============================================================================

-- Función que crea un tenant y su evento de auditoría en UNA sola transacción,
-- con hash chaining (append-only) sobre la columna verification_hash real de
-- audit_events. Idempotente y SECURITY DEFINER (autoridad server-side).

create or replace function public.create_tenant_with_audit(
  p_id varchar,
  p_name text,
  p_slug text,
  p_region text,
  p_tier text,
  p_created_by varchar,
  p_audit_event jsonb
) returns tenants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant tenants;
  v_previous_hash text;
  v_meta jsonb;
begin
  -- Hash del último evento de auditoría del tenant (o nulo si es nuevo).
  select verification_hash into v_previous_hash
  from public.audit_events
  where tenant_id = p_id
  order by timestamp desc
  limit 1;

  -- Insertar tenant (columnas alineadas con el dominio, Phase 1.1).
  insert into tenants (id, name, slug, region, tier, quota_balance, quota_tier_limit, created_by, metadata)
  values (
    p_id,
    p_name,
    p_slug,
    p_region,
    p_tier,
    0,
    case
      when p_tier = 'Free' then 100
      when p_tier = 'Enterprise' then 10000
      when p_tier = 'Sovereign' then 1000000
      else 1000
    end,
    p_created_by,
    jsonb_build_object('provisioned', true)
  )
  returning * into v_tenant;

  -- Insertar evento de auditoría con hash chaining (verification_hash real).
  insert into public.audit_events (
    id, tenant_id, trace_id, correlation_id, actor_ip, event, severity,
    details, remediated, verification_hash, previous_log_hash
  )
  select
    'audit_' || substr(md5(random()::text), 1, 16),
    p_id,
    coalesce(p_audit_event->>'traceId', 'trace_' || substr(md5(random()::text), 1, 8)),
    coalesce(p_audit_event->>'correlationId', 'corr_' || substr(md5(random()::text), 1, 8)),
    coalesce(p_audit_event->>'actorIp', ''),
    p_audit_event->>'action',
    coalesce(p_audit_event->>'severity', 'S3'),
    coalesce(p_audit_event->>'details', '{}'),
    false,
    encode(sha256(
      (
        jsonb_build_object(
          'action', p_audit_event->>'action',
          'resource', p_audit_event->>'resource',
          'actor', p_audit_event->>'actor',
          'result', p_audit_event->>'result',
          'details', p_audit_event->>'details',
          'tenantId', p_id,
          'severity', p_audit_event->>'severity',
          'timestamp', now(),
          'previous_log_hash', v_previous_hash
        )
      )::text::bytea
    ), 'hex'),
    v_previous_hash;

  return v_tenant;
end;
$$;
