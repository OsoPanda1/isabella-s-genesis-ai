-- ============================================================================
-- SOVEREIGN STATE — PRODUCTION PERSISTENCE ADAPTER (P0 deployment blocker)
-- Author: Isabella Sovereign Hub
-- Target Platform: PostgreSQL (Supabase / Neon Compatible)
-- ============================================================================
-- SovereignDB today is backed by a JSON file (sovereign_db.json) which is
-- strictly forbidden in production (throws). This migration provides a
-- durable PostgreSQL-backed storage for the SovereignDB state so the billing /
-- quota / monetization routes can run in production without the JSON file.
--
-- The state is stored as a single JSONB row (id = 'canonical'). This mirrors
-- the serializable DatabaseSchema of SovereignDB and keeps every read-modify-
-- write atomic at the row level.
-- ============================================================================

create table if not exists sovereign_state (
    id varchar(32) primary key default 'canonical',
    payload jsonb not null default '{}'::jsonb,
    version varchar(32) not null default 'v1',
    updated_at timestamptz not null default now()
);

-- Keep updated_at fresh on write
create or replace function update_sovereign_state_modtime()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sovereign_state_modtime on sovereign_state;
create trigger trg_sovereign_state_modtime
    before update on sovereign_state
    for each row execute function update_sovereign_state_modtime();

-- RLS: only the service role / DB owner manages sovereign state directly.
-- The Node runtime connects with the DB password (DATABASE_URL), bypassing RLS,
-- so no restrictive policies are needed. Enable RLS defensively with no
-- policies (deny-all for anon/authenticated).
alter table sovereign_state enable row level security;
