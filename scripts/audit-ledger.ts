import { PostgresAccountingRepository } from "../src/lib/accounting/accounting-postgres-repository";
import { createDoubleEntryService } from "../src/lib/accounting/double-entry-service";
import type {
  TrialBalance,
  BalanceSheet,
  LedgerLine,
  JournalEntry,
} from "../src/lib/accounting/types";
import { config } from "../src/lib/config";

export interface AuditReport {
  timestamp: string;
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  trialBalance: TrialBalance;
  balanceSheet: BalanceSheet;
  integrityChecks: {
    doubleEntryValid: boolean;
    balanceSheetBalanced: boolean;
    allEntriesPosted: boolean;
    noOrphanLines: boolean;
  };
  anomalies: string[];
  recommendations: string[];
}

export async function runLedgerAudit(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<AuditReport> {
  if (!tenantId) throw new Error("tenantId is required");
  if (!config().DATABASE_URL)
    throw new Error("DATABASE_URL is required: financial audit never uses an in-memory repository");
  const repository = new PostgresAccountingRepository();
  const service = createDoubleEntryService(repository);
  const anomalies: string[] = [];
  const recommendations: string[] = [];

  const trialBalance = await service.getTrialBalance(tenantId, periodStart, periodEnd);
  if (!trialBalance.isBalanced) {
    anomalies.push(
      `La balanza no está cuadrada: débitos=${trialBalance.totalDebitsCents}, créditos=${trialBalance.totalCreditsCents}`,
    );
    recommendations.push("Revisar entradas del período para identificar el desbalance.");
  }

  const balanceSheet = await service.getBalanceSheet(tenantId, periodEnd);
  if (!balanceSheet.isBalanced) {
    anomalies.push(
      `El balance no cumple la ecuación contable: activos=${balanceSheet.totalAssetsCents}, pasivos+patrimonio=${balanceSheet.totalLiabilitiesAndEquityCents}`,
    );
    recommendations.push("Verificar cuentas de resultado y cierre del período.");
  }

  const entries = await repository.getJournalEntriesByTenant(tenantId);
  let allEntriesValid = true;
  for (const entry of entries) {
    const lines = await repository.getLedgerLinesByEntry(entry.id);
    const totalDebits = lines.reduce((sum: number, line: LedgerLine) => sum + line.debitCents, 0);
    const totalCredits = lines.reduce((sum: number, line: LedgerLine) => sum + line.creditCents, 0);
    if (totalDebits !== totalCredits) {
      anomalies.push(
        `Entrada ${entry.entryNumber} desbalanceada: ${totalDebits} vs ${totalCredits}`,
      );
      allEntriesValid = false;
    }
  }

  const pendingEntries = entries.filter((entry: JournalEntry) => entry.status === "pending");
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const oldPending = pendingEntries.filter(
    (entry: JournalEntry) => entry.createdAt < thirtyDaysAgo,
  );
  if (oldPending.length > 0)
    recommendations.push("Revisar y asentar (post) o reversar las entradas pendientes antiguas.");

  const allAccounts = await repository.getAccountsByTenant(tenantId);
  let orphanLines = 0;
  for (const account of allAccounts) {
    const lines = await repository.getLedgerLinesByAccount(account.id);
    for (const line of lines) {
      const entry = await repository.getJournalEntryById(line.entryId);
      if (!entry || entry.tenantId !== tenantId) orphanLines++;
    }
  }
  if (orphanLines > 0) {
    anomalies.push(`${orphanLines} líneas de diario sin entrada válida vinculada`);
    recommendations.push("Corregir referencialidad antes de cualquier cierre financiero.");
  }

  if (trialBalance.accounts.length === 0)
    recommendations.push("No hay actividad contable en el período; validar origen de datos.");
  if (trialBalance.accounts.some((a) => Math.abs(a.netBalanceCents) > 1_000_000))
    recommendations.push("Someter cuentas de alto flujo a revisión adicional.");

  return {
    timestamp: new Date().toISOString(),
    tenantId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    trialBalance,
    balanceSheet,
    integrityChecks: {
      doubleEntryValid: allEntriesValid,
      balanceSheetBalanced: balanceSheet.isBalanced,
      allEntriesPosted: oldPending.length === 0,
      noOrphanLines: orphanLines === 0,
    },
    anomalies,
    recommendations,
  };
}

if (process.argv[1]?.includes("audit-ledger")) {
  const tenantId = process.argv[2];
  runLedgerAudit(tenantId, new Date("2026-01-01T00:00:00Z"), new Date("2026-12-31T23:59:59Z"))
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(
        "Critical ledger audit failure:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    });
}
