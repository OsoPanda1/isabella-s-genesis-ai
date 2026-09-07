-- ============================================================================
-- ALIGN TENANTS SCHEMA WITH DOMAIN (Phase 1.1 — Ruta Productiva Única)
-- Author: Edwin Oswaldo Castillo Trejo (Anubis Villaseñor)
-- Target Platform: PostgreSQL (Supabase Compatible)
-- ============================================================================

-- Alinear el esquema de tenants con el contrato de dominio canónico.
-- Idempotente: puede ejecutarse de forma segura repetidas veces.

alter table tenants
    add column if not exists slug text unique,
    add column if not exists quota_tier_limit bigint,
    add column if not exists created_by varchar(64) references profiles(id) on delete set null,
    add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Migrar datos existentes: derivar slug unívoco desde name si está vacío.
-- Para evitar colisiones de slug en datos preexistentes, se desambigua con id.
update tenants
set slug = lower(regexp_replace(trim(name), '[^a-z0-9]+', '-', 'g')) || '-' || substr(replace(id, '-', ''), 1, 8)
where slug is null or slug = '';

-- Valor por defecto de límite de cuota por tier (si no se ha definido).
update tenants
set quota_tier_limit = case
        when tier = 'Free' then 100
        when tier = 'Enterprise' then 10000
        when tier = 'Sovereign' then 1000000
        else 1000
    end
where quota_tier_limit is null;

-- Índice para búsquedas por slug (columna unique ya crea índice; add por claridad).
create index if not exists idx_tenants_slug on tenants(slug);

-- ============================================================================
-- SESSIONS: asegurar token_jti y revocación indexada (Phase 1.3)
-- ============================================================================
alter table sessions
    add column if not exists token_jti uuid unique;

create index if not exists idx_sessions_token_jti on sessions(token_jti);
create index if not exists idx_sessions_is_active on sessions(is_active);
create index if not exists idx_sessions_expires_at on sessions(expires_at);
