-- ============================================================================
-- ALIGN MEMORIES (Phase 3)
-- Author: Edwin Oswaldo Castillo Trejo (Anubis Villaseñor)
-- Target Platform: PostgreSQL (Supabase Compatible)
-- ============================================================================

-- ============================================================================
-- MEMORIES: añadir columnas del contrato de dominio
-- ============================================================================
alter table memories
    add column if not exists sensitivity varchar(20) not null default 'low'
        check (sensitivity in ('low', 'medium', 'high')),
    add column if not exists purpose text,
    add column if not exists consent boolean not null default false,
    add column if not exists provenance text,
    add column if not exists content_hash char(64),
    add column if not exists expires_at timestamptz;

-- Índice de expiración para retención mínima necesaria.
create index if not exists idx_memories_expires_at on memories(expires_at);
create index if not exists idx_memories_owner on memories(user_id);
