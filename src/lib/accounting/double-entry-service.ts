import type { AccountingRepository, CreateJournalEntryDTO } from "./accounting-repository";
import type {
  JournalEntry,
  LedgerLine,
  TrialBalance,
  BalanceSheet,
  DoubleEntryValidation,
  AccountType,
} from "./types";

export interface DoubleEntryService {
  createDoubleEntryTransaction(dto: CreateJournalEntryDTO): Promise<{
    success: boolean;
    error?: string;
    entry?: JournalEntry;
    lines?: LedgerLine[];
  }>;
  postJournalEntry(entryId: string): Promise<{
    success: boolean;
    error?: string;
  }>;
  reverseJournalEntry(
    entryId: string,
    reason: string,
  ): Promise<{
    success: boolean;
    error?: string;
  }>;
  validateDoubleEntry(dto: CreateJournalEntryDTO): DoubleEntryValidation;
  getTrialBalance(tenantId: string, periodStart: Date, periodEnd: Date): Promise<TrialBalance>;
  getBalanceSheet(tenantId: string, asOfDate: Date): Promise<BalanceSheet>;
}

export function createDoubleEntryService(repository: AccountingRepository): DoubleEntryService {
  function validateDoubleEntry(dto: CreateJournalEntryDTO): DoubleEntryValidation {
    const errors: string[] = [];
    let totalDebitsCents = 0;
    let totalCreditsCents = 0;

    if (!dto.lines || dto.lines.length === 0) {
      errors.push("La transacción debe tener al menos una línea.");
      return {
        isValid: false,
        errors,
        totalDebitsCents: 0,
        totalCreditsCents: 0,
        differenceCents: 0,
      };
    }

    if (dto.lines.length < 2) {
      errors.push("La contabilidad de doble entrada requiere al menos dos líneas.");
    }

    for (const line of dto.lines) {
      if (!line.accountId) {
        errors.push("Cada línea debe tener una cuenta válida.");
      }
      if (line.debitCents !== undefined && line.debitCents < 0) {
        errors.push("Los débitos no pueden ser negativos.");
      }
      if (line.creditCents !== undefined && line.creditCents < 0) {
        errors.push("Los créditos no pueden ser negativos.");
      }
      if (
        (line.debitCents !== undefined && line.debitCents > 0) &&
        (line.creditCents !== undefined && line.creditCents > 0)
      ) {
        errors.push("Una línea no puede tener tanto débito como crédito.");
      }
      if (!line.debitCents && !line.creditCents) {
        errors.push("Cada línea debe tener débito o crédito.");
      }

      totalDebitsCents += line.debitCents || 0;
      totalCreditsCents += line.creditCents || 0;
    }

    if (totalDebitsCents === 0 && totalCreditsCents === 0) {
      errors.push("La transacción debe tener montos.");
    }

    if (totalDebitsCents !== totalCreditsCents) {
      errors.push(
        `Los débitos (${totalDebitsCents}) no son iguales a los créditos (${totalCreditsCents}).`,
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      totalDebitsCents,
      totalCreditsCents,
      differenceCents: Math.abs(totalDebitsCents - totalCreditsCents),
    };
  }

  async function createDoubleEntryTransaction(dto: CreateJournalEntryDTO): Promise<{
    success: boolean;
    error?: string;
    entry?: JournalEntry;
    lines?: LedgerLine[];
  }> {
    const validation = validateDoubleEntry(dto);
    if (!validation.isValid) {
      return { success: false, error: validation.errors.join(" ") };
    }

    let tx: unknown | undefined;
    try {
      tx = await repository.beginTransaction();

      const entry = await repository.createJournalEntry(dto, tx);

      const linesData = dto.lines.map((line) => ({
        entryId: entry.id,
        accountId: line.accountId,
        tenantId: dto.tenantId,
        debitCents: line.debitCents || 0,
        creditCents: line.creditCents || 0,
        description: line.description,
        metadata: line.description ? { note: line.description } : undefined,
      }));

      const lines = await repository.createLedgerLines(
        linesData as Omit<LedgerLine, "id" | "createdAt">[],
        tx,
      );

      await repository.commitTransaction(tx);

      return { success: true, entry, lines };
    } catch (error) {
      if (tx) {
        await repository.rollbackTransaction(tx);
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      };
    }
  }

  async function postJournalEntry(entryId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const entry = await repository.getJournalEntryById(entryId);
      if (!entry) {
        return { success: false, error: "Entrada de diario no encontrada" };
      }

      if (entry.status !== "pending") {
        return { success: false, error: "La entrada ya está publicada o reversada" };
      }

      const lines = await repository.getLedgerLinesByEntry(entryId);
      if (lines.length === 0) {
        return { success: false, error: "La entrada no tiene líneas" };
      }

      const totalDebits = lines.reduce((sum, l) => sum + l.debitCents, 0);
      const totalCredits = lines.reduce((sum, l) => sum + l.creditCents, 0);

      if (totalDebits !== totalCredits) {
        return {
          success: false,
          error: `Desbalance: débitos=${totalDebits}, créditos=${totalCredits}`,
        };
      }

      await repository.updateJournalEntryStatus(entryId, "posted");
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Error al publicar",
      };
    }
  }

  async function reverseJournalEntry(
    entryId: string,
    reason: string,
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const entry = await repository.getJournalEntryById(entryId);
      if (!entry) {
        return { success: false, error: "Entrada de diario no encontrada" };
      }

      if (entry.status !== "posted") {
        return { success: false, error: "Solo se pueden reversar entradas publicadas" };
      }

      const lines = await repository.getLedgerLinesByEntry(entryId);

      // Crear entrada de reversión
      const reversalDto: CreateJournalEntryDTO = {
        tenantId: entry.tenantId,
        description: `Reversión: ${reason}`,
        createdBy: "system",
        metadata: { reversedEntryId: entryId, reason },
        lines: lines.map((line) => ({
          accountId: line.accountId,
          debitCents: line.creditCents,
          creditCents: line.debitCents,
          description: `Reversión de: ${line.description || ""}`,
        })),
      };

      const result = await createDoubleEntryTransaction(reversalDto);
      if (!result.success) {
        return result;
      }

      await repository.updateJournalEntryStatus(entryId, "reversed");
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Error al reversar",
      };
    }
  }

  async function getTrialBalance(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<TrialBalance> {
    return repository.generateTrialBalance(tenantId, periodStart, periodEnd);
  }

  async function getBalanceSheet(tenantId: string, asOfDate: Date): Promise<BalanceSheet> {
    return repository.generateBalanceSheet(tenantId, asOfDate);
  }

  return {
    createDoubleEntryTransaction,
    postJournalEntry,
    reverseJournalEntry,
    validateDoubleEntry,
    getTrialBalance,
    getBalanceSheet,
  };
}
