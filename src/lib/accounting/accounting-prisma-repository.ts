import { PrismaClient } from "@prisma/client";
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
import type { AccountingRepository, CreateAccountDTO, CreateJournalEntryDTO } from "./accounting-repository";
import { randomUUID } from "node:crypto";

export class PrismaAccountingRepository implements AccountingRepository {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || new PrismaClient();
  }

  async createAccount(dto: CreateAccountDTO, tx: any = this.prisma): Promise<Account> {
    const account = await tx.accountingAccount.create({
      data: {
        tenantId: dto.tenantId,
        code: dto.code,
        name: dto.name,
        type: dto.type,
        parentId: dto.parentId,
        currency: dto.currency || "USD",
      },
    });
    return this.mapAccount(account);
  }

  async getAccountById(id: string, tx: any = this.prisma): Promise<Account | null> {
    const account = await tx.accountingAccount.findUnique({ where: { id } });
    return account ? this.mapAccount(account) : null;
  }

  async getAccountsByTenant(tenantId: string, tx: any = this.prisma): Promise<Account[]> {
    const accounts = await tx.accountingAccount.findMany({ where: { tenantId } });
    return accounts.map((a: any) => this.mapAccount(a));
  }

  async updateAccount(id: string, updates: Partial<Account>, tx: any = this.prisma): Promise<Account> {
    const account = await tx.accountingAccount.update({
      where: { id },
      data: {
        name: updates.name,
        type: updates.type,
      },
    });
    return this.mapAccount(account);
  }

  async createJournalEntry(dto: CreateJournalEntryDTO, tx: any = this.prisma): Promise<JournalEntry> {
    const entryNumber = `JE-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const entry = await tx.accountingJournalEntry.create({
      data: {
        tenantId: dto.tenantId,
        entryNumber,
        description: dto.description,
        status: "pending",
        createdBy: dto.createdBy,
        metadata: dto.metadata ? JSON.parse(JSON.stringify(dto.metadata)) : undefined,
      },
    });
    return this.mapJournalEntry(entry);
  }

  async getJournalEntryById(id: string, tx: any = this.prisma): Promise<JournalEntry | null> {
    const entry = await tx.accountingJournalEntry.findUnique({ where: { id } });
    return entry ? this.mapJournalEntry(entry) : null;
  }

  async getJournalEntriesByTenant(tenantId: string, tx: any = this.prisma): Promise<JournalEntry[]> {
    const entries = await tx.accountingJournalEntry.findMany({ where: { tenantId } });
    return entries.map((e: any) => this.mapJournalEntry(e));
  }

  async updateJournalEntryStatus(id: string, status: TransactionStatus, tx: any = this.prisma): Promise<JournalEntry> {
    const entry = await tx.accountingJournalEntry.update({
      where: { id },
      data: {
        status,
        postedAt: status === "posted" ? new Date() : undefined,
      },
    });
    return this.mapJournalEntry(entry);
  }

  async createLedgerLines(lines: Omit<LedgerLine, "id" | "createdAt">[], tx: any = this.prisma): Promise<LedgerLine[]> {
    const createdLines = await tx.$transaction(
      lines.map((line) =>
        tx.accountingLedgerLine.create({
          data: {
            entryId: line.entryId,
            accountId: line.accountId,
            tenantId: line.tenantId,
            debitCents: line.debitCents,
            creditCents: line.creditCents,
            description: line.description,
            metadata: line.metadata ? JSON.parse(JSON.stringify(line.metadata)) : undefined,
          },
        })
      )
    );
    return createdLines.map((l: any) => this.mapLedgerLine(l));
  }

  async getLedgerLinesByEntry(entryId: string, tx: any = this.prisma): Promise<LedgerLine[]> {
    const lines = await tx.accountingLedgerLine.findMany({ where: { entryId } });
    return lines.map((l: any) => this.mapLedgerLine(l));
  }

  async getLedgerLinesByAccount(accountId: string, tx: any = this.prisma): Promise<LedgerLine[]> {
    const lines = await tx.accountingLedgerLine.findMany({ where: { accountId } });
    return lines.map((l: any) => this.mapLedgerLine(l));
  }

  async calculateAccountBalance(accountId: string, periodStart: Date, periodEnd: Date, tx: any = this.prisma): Promise<AccountBalance> {
    const account = await this.getAccountById(accountId, tx);
    if (!account) throw new Error("Account not found");

    const lines = await tx.accountingLedgerLine.findMany({
      where: {
        accountId,
        entry: {
          status: "posted",
          createdAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
      },
    });

    let debits = 0;
    let credits = 0;
    for (const l of lines) {
      debits += Number(l.debitCents);
      credits += Number(l.creditCents);
    }

    return {
      accountId,
      tenantId: account.tenantId,
      periodStart,
      periodEnd,
      openingBalanceCents: 0,
      debitCents: debits,
      creditCents: credits,
      closingBalanceCents: debits - credits,
      currency: account.currency,
    };
  }

  async generateTrialBalance(tenantId: string, periodStart: Date, periodEnd: Date, tx: any = this.prisma): Promise<TrialBalance> {
    const accounts = await this.getAccountsByTenant(tenantId, tx);
    const balances = await Promise.all(
      accounts.map((acc) => this.calculateAccountBalance(acc.id, periodStart, periodEnd, tx))
    );

    let totalDebits = 0;
    let totalCredits = 0;
    const accountsWithBalances = balances.map((balance, idx) => {
      totalDebits += balance.debitCents;
      totalCredits += balance.creditCents;
      return {
        accountId: balance.accountId,
        accountCode: accounts[idx].code,
        accountName: accounts[idx].name,
        accountType: accounts[idx].type,
        debitCents: balance.debitCents,
        creditCents: balance.creditCents,
        netBalanceCents: balance.closingBalanceCents,
      };
    });

    return {
      tenantId,
      periodStart,
      periodEnd,
      accounts: accountsWithBalances,
      totalDebitsCents: totalDebits,
      totalCreditsCents: totalCredits,
      isBalanced: totalDebits === totalCredits,
      generatedAt: new Date(),
    };
  }

  async generateBalanceSheet(tenantId: string, asOfDate: Date, tx: any = this.prisma): Promise<BalanceSheet> {
    const periodStart = new Date(asOfDate.getFullYear(), 0, 1);
    const accounts = await this.getAccountsByTenant(tenantId, tx);
    const balances = await Promise.all(
      accounts.map((acc) => this.calculateAccountBalance(acc.id, periodStart, asOfDate, tx))
    );

    type BalanceItem = { accountId: string; name: string; balanceCents: number };
    const assets: BalanceItem[] = [];
    const liabilities: BalanceItem[] = [];
    const equity: BalanceItem[] = [];
    let totalAssets = 0, totalLiabilitiesEquity = 0;

    balances.forEach((balance, idx) => {
      const item = {
        accountId: balance.accountId,
        name: accounts[idx].name,
        balanceCents: balance.closingBalanceCents,
      };
      if (accounts[idx].type === "asset") { assets.push(item); totalAssets += item.balanceCents; }
      if (accounts[idx].type === "liability") { liabilities.push(item); totalLiabilitiesEquity += item.balanceCents; }
      if (accounts[idx].type === "equity") { equity.push(item); totalLiabilitiesEquity += item.balanceCents; }
    });

    return {
      tenantId,
      asOfDate,
      assets,
      liabilities,
      equity,
      totalAssetsCents: totalAssets,
      totalLiabilitiesAndEquityCents: totalLiabilitiesEquity,
      isBalanced: totalAssets === totalLiabilitiesEquity,
      generatedAt: new Date(),
    };
  }

  async beginTransaction(): Promise<unknown> {
    // handled implicitly via $transaction callback approach usually,
    // mocking to preserve the generic interface for this codebase pattern.
    return this.prisma;
  }
  async commitTransaction(tx: unknown): Promise<void> {}
  async rollbackTransaction(tx: unknown): Promise<void> {}

  private mapAccount(row: any): Account {
    return {
      id: row.id,
      tenantId: row.tenantId,
      code: row.code,
      name: row.name,
      type: row.type as AccountType,
      parentId: row.parentId,
      currency: row.currency,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
  private mapJournalEntry(row: any): JournalEntry {
    return {
      id: row.id,
      tenantId: row.tenantId,
      entryNumber: row.entryNumber,
      description: row.description,
      status: row.status as TransactionStatus,
      postedAt: row.postedAt,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      metadata: row.metadata,
    };
  }
  private mapLedgerLine(row: any): LedgerLine {
    return {
      id: row.id,
      entryId: row.entryId,
      accountId: row.accountId,
      tenantId: row.tenantId,
      debitCents: Number(row.debitCents),
      creditCents: Number(row.creditCents),
      description: row.description,
      createdAt: row.createdAt,
      metadata: row.metadata,
    };
  }
}
