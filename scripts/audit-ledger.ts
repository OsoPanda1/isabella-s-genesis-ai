import { InMemoryAccountingRepository } from "../src/lib/accounting/accounting-repository";
import { PostgresAccountingRepository } from "../src/lib/accounting/accounting-postgres-repository";
import { createDoubleEntryService } from "../src/lib/accounting/double-entry-service";
import type { TrialBalance, BalanceSheet, LedgerLine, JournalEntry } from "../src/lib/accounting/types";
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
  // Use postgres if DB URL is available, otherwise in-memory for tests
  let repository;
  if (process.env.DATABASE_URL || config().DATABASE_URL) {
    repository = new PostgresAccountingRepository();
  } else {
    repository = new InMemoryAccountingRepository();
  }
  const service = createDoubleEntryService(repository);
  const anomalies: string[] = [];
  const recommendations: string[] = [];

  console.log(`\n🔍 Iniciando auditoría contable avanzada para tenant: ${tenantId}`);
  console.log(`📅 Período: ${periodStart.toISOString()} - ${periodEnd.toISOString()}`);

  // 1. Generar balanza de comprobación
  console.log("\n📊 Generando balanza de comprobación...");
  const trialBalance = await service.getTrialBalance(tenantId, periodStart, periodEnd);

  if (!trialBalance.isBalanced) {
    anomalies.push(
      `La balanza no está cuadrada: débitos=${trialBalance.totalDebitsCents}, créditos=${trialBalance.totalCreditsCents}`,
    );
    recommendations.push("Revisar entradas del período para identificar el desbalance.");
  }

  console.log(`✓ Total débitos: $${(trialBalance.totalDebitsCents / 100).toFixed(2)}`);
  console.log(`✓ Total créditos: $${(trialBalance.totalCreditsCents / 100).toFixed(2)}`);
  console.log(`✓ Balanceada: ${trialBalance.isBalanced ? "✅" : "❌"}`);

  // 2. Generar balance general
  console.log("\n📈 Generando balance general...");
  const balanceSheet = await service.getBalanceSheet(tenantId, periodEnd);

  if (!balanceSheet.isBalanced) {
    anomalies.push(
      `El balance no cumple la ecuación contable: activos=${balanceSheet.totalAssetsCents}, pasivos+patrimonio=${balanceSheet.totalLiabilitiesAndEquityCents}`,
    );
    recommendations.push("Verificar cuentas de resultado y cierre del período.");
  }

  console.log(`✓ Activos: $${(balanceSheet.totalAssetsCents / 100).toFixed(2)}`);
  console.log(
    `✓ Pasivos + Patrimonio: $${(balanceSheet.totalLiabilitiesAndEquityCents / 100).toFixed(2)}`,
  );
  console.log(`✓ Ecuación contable: ${balanceSheet.isBalanced ? "✅" : "❌"}`);

  // 3. Verificar integridad de doble entrada
  console.log("\n🔐 Verificando integridad de asientos contables (Doble Entrada)...");
  const entries = await repository.getJournalEntriesByTenant(tenantId);
  let allEntriesValid = true;

  for (const entry of entries) {
    const lines = await repository.getLedgerLinesByEntry(entry.id);
    const totalDebits = lines.reduce((sum: number, l: LedgerLine) => sum + l.debitCents, 0);
    const totalCredits = lines.reduce((sum: number, l: LedgerLine) => sum + l.creditCents, 0);

    if (totalDebits !== totalCredits) {
      anomalies.push(
        `Entrada ${entry.entryNumber} desbalanceada: ${totalDebits} vs ${totalCredits}`,
      );
      allEntriesValid = false;
    }
  }

  console.log(
    `✓ Todas las entradas cumplen la ecuación fundamental: ${allEntriesValid ? "✅" : "❌"}`,
  );

  // 4. Verificar entradas pendientes antiguas
  console.log("\n⏳ Verificando entradas pendientes de asentar...");
  const pendingEntries = entries.filter((e: JournalEntry) => e.status === "pending");
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const oldPending = pendingEntries.filter((e: JournalEntry) => e.createdAt < thirtyDaysAgo);
  if (oldPending.length > 0) {
    anomalies.push(`${oldPending.length} entradas pendientes con más de 30 días`);
    recommendations.push("Revisar y asentar (post) o reversar las entradas pendientes antiguas.");
  }

  console.log(`✓ Entradas pendientes totales: ${pendingEntries.length}`);
  console.log(`✓ Entradas pendientes antiguas: ${oldPending.length}`);

  // 5. Verificar líneas orfanadas
  console.log("\n🔍 Verificando líneas de mayor orfanadas...");
  const allAccounts = await repository.getAccountsByTenant(tenantId);
  let orphanLines = 0;

  for (const account of allAccounts) {
    const lines = await repository.getLedgerLinesByAccount(account.id);
    for (const line of lines) {
      const entry = await repository.getJournalEntryById(line.entryId);
      if (!entry || entry.tenantId !== tenantId) {
        orphanLines++;
      }
    }
  }

  if (orphanLines > 0) {
    anomalies.push(`${orphanLines} líneas de diario sin entrada válida vinculada`);
    recommendations.push(
      "Ejecutar purga de integridad sobre líneas orfanadas que violen referencialidad.",
    );
  }

  console.log(`✓ Líneas orfanadas detectadas: ${orphanLines}`);

  // 6. Recomendaciones y Análisis Anómalo
  if (trialBalance.accounts.length === 0) {
    recommendations.push(
      "No hay actividad contable en el período. Validar origen de datos o inicio de operaciones.",
    );
  }

  const highValueAccounts = trialBalance.accounts.filter(
    (a) => Math.abs(a.netBalanceCents) > 1000000, // > $10,000
  );
  if (highValueAccounts.length > 0) {
    console.log(`\n⚠️  ALERTA SOBERANA: Cuentas con saldos inusualmente altos (> $10,000):`);
    highValueAccounts.forEach((acc) => {
      console.log(
        `   - [${acc.accountType.toUpperCase()}] ${acc.accountCode} ${acc.accountName}: $${(acc.netBalanceCents / 100).toFixed(2)}`,
      );
    });
    recommendations.push("Someter a auditoría externa las cuentas de alto flujo detectadas.");
  }

  const report: AuditReport = {
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

  console.log("\n" + "=".repeat(65));
  console.log("📋 RESUMEN DE AUDITORÍA BOOKPI — DOBLE ENTRADA");
  console.log("=".repeat(65));
  console.log(`Anomalías Detectadas: ${anomalies.length}`);
  console.log(`Recomendaciones de Gobernanza: ${recommendations.length}`);
  console.log(
    `Estado del Ledger: ${anomalies.length === 0 ? "✅ INMACULADO (SIN NOVEDADES)" : "⚠️ ALERTA DE INTEGRIDAD"}`,
  );

  if (anomalies.length > 0) {
    console.log("\n🔴 Lista de Anomalías:");
    anomalies.forEach((a, i) => console.log(`   ${i + 1}. ${a}`));
  }

  if (recommendations.length > 0) {
    console.log("\n💡 Sugerencias de Gobernanza:");
    recommendations.forEach((r, i) => console.log(`   ${i + 1}. ${r}`));
  }

  return report;
}

// Ejecutar CLI directamente
if (process.argv[1]?.includes("audit-ledger")) {
  const tenantId = process.argv[2] || "00000000-0000-0000-0000-000000000000";
  const periodStart = new Date(2026, 0, 1);
  const periodEnd = new Date(2026, 11, 31);

  runLedgerAudit(tenantId, periodStart, periodEnd)
    .then(() => {
      console.log("\n✅ Auditoría C.R.O.W.N. finalizada.");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Error Crítico en auditoría:", error);
      process.exit(1);
    });
}
