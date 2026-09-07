CREATE TABLE public.accounting_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  parent_id UUID REFERENCES public.accounting_accounts(id),
  currency VARCHAR(10) DEFAULT 'USD' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(tenant_id, code)
);

CREATE TABLE public.accounting_journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  entry_number VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(50) NOT NULL,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by VARCHAR(255) NOT NULL,
  metadata JSONB,
  UNIQUE(tenant_id, entry_number)
);

CREATE TABLE public.accounting_ledger_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.accounting_journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounting_accounts(id),
  tenant_id UUID NOT NULL,
  debit_cents BIGINT NOT NULL DEFAULT 0,
  credit_cents BIGINT NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  metadata JSONB
);

CREATE INDEX idx_accounting_lines_account ON public.accounting_ledger_lines(account_id);
CREATE INDEX idx_accounting_lines_entry ON public.accounting_ledger_lines(entry_id);
CREATE INDEX idx_accounting_entries_tenant ON public.accounting_journal_entries(tenant_id);

-- Enforce immutability for posted ledger lines
CREATE OR REPLACE FUNCTION prevent_posted_ledger_mutation()
RETURNS TRIGGER AS $$
DECLARE
    entry_status VARCHAR(50);
BEGIN
    SELECT status INTO entry_status FROM public.accounting_journal_entries WHERE id = OLD.entry_id;
    IF entry_status = 'posted' THEN
        RAISE EXCEPTION 'ISABELLA CROWN VIOLATION: Cannot modify ledger lines of a posted journal entry.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_posted_ledger_update
BEFORE UPDATE ON public.accounting_ledger_lines
FOR EACH ROW
EXECUTE FUNCTION prevent_posted_ledger_mutation();

CREATE TRIGGER trg_prevent_posted_ledger_delete
BEFORE DELETE ON public.accounting_ledger_lines
FOR EACH ROW
EXECUTE FUNCTION prevent_posted_ledger_mutation();
