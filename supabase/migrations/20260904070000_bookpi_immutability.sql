-- P1-04: BookPI Immutability at the DB level
-- Deny UPDATE and DELETE on bookpi_ledger table

CREATE OR REPLACE FUNCTION prevent_bookpi_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'ISABELLA CROWN VIOLATION: The BookPI ledger is append-only. Modifying or deleting blocks is strictly forbidden by Sovereign DB rules.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_bookpi_update
BEFORE UPDATE ON public.bookpi_ledger
FOR EACH ROW
EXECUTE FUNCTION prevent_bookpi_mutation();

CREATE TRIGGER trg_prevent_bookpi_delete
BEFORE DELETE ON public.bookpi_ledger
FOR EACH ROW
EXECUTE FUNCTION prevent_bookpi_mutation();

-- We also make sure the audit table is strictly append-only
CREATE TRIGGER trg_prevent_audit_update
BEFORE UPDATE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_bookpi_mutation();

CREATE TRIGGER trg_prevent_audit_delete
BEFORE DELETE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_bookpi_mutation();
