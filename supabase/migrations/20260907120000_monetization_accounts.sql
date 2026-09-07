-- ============================================================================
-- MONETIZATION ACCOUNTS (durable, reemplaza al cliente Prisma)
-- ============================================================================

create table if not exists monetization_accounts (
    user_id varchar(255) primary key,
    earned_balance_cents bigint not null default 0,
    qualified_uses integer not null default 0,
    approved_contributions integer not null default 0,
    training_completed boolean not null default false,
    identity_verified boolean not null default false,
    payment_account_verified boolean not null default false,
    profile_complete boolean not null default false,
    sanctioned boolean not null default false,
    under_fraud_review boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

grant all on public.monetization_accounts to service_role;

alter table public.monetization_accounts enable row level security;
