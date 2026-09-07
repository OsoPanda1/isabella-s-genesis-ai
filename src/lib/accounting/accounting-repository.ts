import { randomUUID } from "node:crypto";
import type {
  Account,
  JournalEntry,
  LedgerLine,
  AccountBalance,
  TrialBalance,
  BalanceSheet,
  AccountType,
  TransactionStatus,
} from "./types";

export interface CreateAccountDTO {
  tenantId: string;
  code: string;
  name: string;
  type: AccountType;
  parentId?: string;
  currency?: string;
}

export interface CreateJournalEntryDTO {
  tenantId: string;
  description: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
  lines: Array<{
    accountId: string;
    debitCents?: number;
    creditCents?: number;
    description?: string;
  }>;
}

export interface AccountingRepository {
  // Accounts
  createAccount(dto: CreateAccountDTO, tx?: unknown): Promise<Account>;
  getAccountById(id: string, tx?: unknown): Promise<Account | null>;
  getAccountsByTenant(tenantId: string, tx?: unknown): Promise<Account[]>;
  updateAccount(id: string, updates: Partial<Account>, tx?: unknown): Promise<Account>;

  // Journal Entries
  createJournalEntry(dto: CreateJournalEntryDTO, tx?: unknown): Promise<JournalEntry>;
  getJournalEntryById(id: string, tx?: unknown): Promise<JournalEntry | null>;
  getJournalEntriesByTenant(tenantId: string, tx?: unknown): Promise<JournalEntry[]>;
  updateJournalEntryStatus(
    id: string,
    status: TransactionStatus,
    tx?: unknown,
  ): Promise<JournalEntry>;

  // Ledger Lines
  createLedgerLines(
    lines: Omit<LedgerLine, "id" | "createdAt">[],
    tx?: unknown,
  ): Promise<LedgerLine[]>;
  getLedgerLinesByEntry(entryId: string, tx?: unknown): Promise<LedgerLine[]>;
  getLedgerLinesByAccount(accountId: string, tx?: unknown): Promise<LedgerLine[]>;

  // Balances
  calculateAccountBalance(
    accountId: string,
    periodStart: Date,
    periodEnd: Date,
    tx?: unknown,
  ): Promise<AccountBalance>;
  generateTrialBalance(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    tx?: unknown,
  ): Promise<TrialBalance>;
  generateBalanceSheet(tenantId: string, asOfDate: Date, tx?: unknown): Promise<BalanceSheet>;

  // Transaction management
  beginTransaction(): Promise<unknown>;
  commitTransaction(tx: unknown): Promise<void>;
  rollbackTransaction(tx: unknown): Promise<void>;
}

// Implementación in-memory para pruebas
export class InMemoryAccountingRepository implements AccountingRepository {
  private accounts = new Map<string, Account>();
  private journalEntries = new Map<string, JournalEntry>();
  private ledgerLines = new Map<string, LedgerLine>();
  private activeTransactions = new Map<unknown, boolean>();

  async createAccount(dto: CreateAccountDTO, _tx?: unknown): Promise<Account> {
    const account: Account = {
      id: randomUUID(),
      tenantId: dto.tenantId,
      code: dto.code,
      name: dto.name,
      type: dto.type,
      parentId: dto.parentId,
      currency: dto.currency || "USD",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.accounts.set(account.id, account);
    return account;
  }

  async getAccountById(id: string, _tx?: unknown): Promise<Account | null> {
    return this.accounts.get(id) || null;
  }

  async getAccountsByTenant(tenantId: string, _tx?: unknown): Promise<Account[]> {
    return Array.from(this.accounts.values()).filter((a) => a.tenantId === tenantId);
  }

  async updateAccount(id: string, updates: Partial<Account>, _tx?: unknown): Promise<Account> {
    const account = this.accounts.get(id);
    if (!account) throw new Error(`Account ${id} not found`);
    const updated = { ...account, ...updates, updatedAt: new Date() };
    this.accounts.set(id, updated);
    return updated;
  }

  async createJournalEntry(dto: CreateJournalEntryDTO, _tx?: unknown): Promise<JournalEntry> {
    const entryNumber = `JE-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const entry: JournalEntry = {
      id: randomUUID(),
      tenantId: dto.tenantId,
      entryNumber,
      description: dto.description,
      status: "pending",
      createdAt: new Date(),
      createdBy: dto.createdBy,
      metadata: dto.metadata,
    };
    this.journalEntries.set(entry.id, entry);
    return entry;
  }

  async getJournalEntryById(id: string, _tx?: unknown): Promise<JournalEntry | null> {
    return this.journalEntries.get(id) || null;
  }

  async getJournalEntriesByTenant(tenantId: string, _tx?: unknown): Promise<JournalEntry[]> {
    return Array.from(this.journalEntries.values()).filter((e) => e.tenantId === tenantId);
  }

  async updateJournalEntryStatus(
    id: string,
    status: TransactionStatus,
    _tx?: unknown,
  ): Promise<JournalEntry> {
    const entry = this.journalEntries.get(id);
    if (!entry) throw new Error(`Journal entry ${id} not found`);
    const updated = {
      ...entry,
      status,
      postedAt: status === "posted" ? new Date() : entry.postedAt,
    };
    this.journalEntries.set(id, updated);
    return updated;
  }

  async createLedgerLines(
    lines: Omit<LedgerLine, "id" | "createdAt">[],
    _tx?: unknown,
  ): Promise<LedgerLine[]> {
    const created = lines.map((line) => ({
      ...line,
      id: randomUUID(),
      createdAt: new Date(),
    }));
    created.forEach((line) => this.ledgerLines.set(line.id, line));
    return created;
  }

  async getLedgerLinesByEntry(entryId: string, _tx?: unknown): Promise<LedgerLine[]> {
    return Array.from(this.ledgerLines.values()).filter((l) => l.entryId === entryId);
  }

  async getLedgerLinesByAccount(accountId: string, _tx?: unknown): Promise<LedgerLine[]> {
    return Array.from(this.ledgerLines.values()).filter((l) => l.accountId === accountId);
  }

  async calculateAccountBalance(
    accountId: string,
    periodStart: Date,
    periodEnd: Date,
    _tx?: unknown,
  ): Promise<AccountBalance> {
    const account = await this.getAccountById(accountId);
    if (!account) throw new Error(`Account ${accountId} not found`);

    const lines = await this.getLedgerLinesByAccount(accountId);
    const filteredLines = lines.filter((l) => {
      const entry = this.journalEntries.get(l.entryId);
      if (!entry || entry.status !== "posted") return false;
      const entryDate = entry.createdAt;
      return entryDate >= periodStart && entryDate <= periodEnd;
    });

    const debitCents = filteredLines.reduce((sum, l) => sum + l.debitCents, 0);
    const creditCents = filteredLines.reduce((sum, l) => sum + l.creditCents, 0);

    const openingBalanceCents = 0; // Simplificado
    const closingBalanceCents = openingBalanceCents + debitCents - creditCents;

    return {
      accountId,
      tenantId: account.tenantId,
      periodStart,
      periodEnd,
      openingBalanceCents,
      debitCents,
      creditCents,
      closingBalanceCents,
      currency: account.currency,
    };
  }

  async generateTrialBalance(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    _tx?: unknown,
  ): Promise<TrialBalance> {
    const accounts = await this.getAccountsByTenant(tenantId);
    const accountBalances = await Promise.all(
      accounts.map((acc) => this.calculateAccountBalance(acc.id, periodStart, periodEnd)),
    );

    const accountsWithBalances = accountBalances.map((balance, idx) => {
      const account = accounts[idx];
      return {
        accountId: balance.accountId,
        accountCode: account.code,
        accountName: account.name,
        accountType: account.type,
        debitCents: balance.debitCents,
        creditCents: balance.creditCents,
        netBalanceCents: balance.closingBalanceCents,
      };
    });

    const totalDebitsCents = accountBalances.reduce((sum, b) => sum + b.debitCents, 0);
    const totalCreditsCents = accountBalances.reduce((sum, b) => sum + b.creditCents, 0);

    return {
      tenantId,
      periodStart,
      periodEnd,
      accounts: accountsWithBalances,
      totalDebitsCents,
      totalCreditsCents,
      isBalanced: totalDebitsCents === totalCreditsCents,
      generatedAt: new Date(),
    };
  }

  async generateBalanceSheet(
    tenantId: string,
    asOfDate: Date,
    _tx?: unknown,
  ): Promise<BalanceSheet> {
    const accounts = await this.getAccountsByTenant(tenantId);
    const periodStart = new Date(asOfDate.getFullYear(), 0, 1);

    const balances = await Promise.all(
      accounts.map((acc) => this.calculateAccountBalance(acc.id, periodStart, asOfDate)),
    );

    const assets = balances
      .filter((_, idx) => accounts[idx].type === "asset")
      .map((balance, idx) => {
        const account = accounts.find((a) => a.id === balance.accountId)!;
        return {
          accountId: balance.accountId,
          name: account.name,
          balanceCents: balance.closingBalanceCents,
        };
      });

    const liabilities = balances
      .filter((_, idx) => accounts[idx].type === "liability")
      .map((balance, idx) => {
        const account = accounts.find((a) => a.id === balance.accountId)!;
        return {
          accountId: balance.accountId,
          name: account.name,
          balanceCents: balance.closingBalanceCents,
        };
      });

    const equity = balances
      .filter((_, idx) => accounts[idx].type === "equity")
      .map((balance, idx) => {
        const account = accounts.find((a) => a.id === balance.accountId)!;
        return {
          accountId: balance.accountId,
          name: account.name,
          balanceCents: balance.closingBalanceCents,
        };
      });

    const totalAssetsCents = assets.reduce((sum, a) => sum + a.balanceCents, 0);
    const totalLiabilitiesAndEquityCents =
      liabilities.reduce((sum, l) => sum + l.balanceCents, 0) +
      equity.reduce((sum, e) => sum + e.balanceCents, 0);

    return {
      tenantId,
      asOfDate,
      assets,
      liabilities,
      equity,
      totalAssetsCents,
      totalLiabilitiesAndEquityCents,
      isBalanced: totalAssetsCents === totalLiabilitiesAndEquityCents,
      generatedAt: new Date(),
    };
  }

  async beginTransaction(): Promise<unknown> {
    const tx = { id: randomUUID(), startTime: Date.now() };
    this.activeTransactions.set(tx, true);
    return tx;
  }

  async commitTransaction(tx: unknown): Promise<void> {
    if (!this.activeTransactions.has(tx)) {
      throw new Error("Transaction not found or already committed");
    }
    this.activeTransactions.delete(tx);
  }

  async rollbackTransaction(tx: unknown): Promise<void> {
    if (!this.activeTransactions.has(tx)) {
      throw new Error("Transaction not found or already committed");
    }
    this.activeTransactions.delete(tx);
  }
}

export function createAccountingRepository(): AccountingRepository {
  return new InMemoryAccountingRepository();
}
