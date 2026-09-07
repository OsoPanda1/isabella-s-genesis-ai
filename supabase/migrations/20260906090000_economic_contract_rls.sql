-- ============================================================================
-- ECONOMIC CONTRACT RLS — cierre de Row Level Security (§8)
-- Target Platform: PostgreSQL (Supabase / Neon Compatible)
-- ============================================================================
-- `webhook_events` y `economic_events` se crearon sin RLS: cualquier rol con
-- acceso PostgREST/Supabase podría leerlos. El runtime Node se conecta con el
-- propietario de la DB (DATABASE_URL), que omite RLS; por tanto se habilita
-- RLS en modo denegar-todo para anon/authenticated (sin políticas = deny).
-- ============================================================================

alter table webhook_events enable row level security;
alter table economic_events enable row level security;

-- Sin políticas CREATE POLICY: anon y authenticated no leen ni escriben.
-- El propietario/service_role conserva acceso total para el runtime server-side.
