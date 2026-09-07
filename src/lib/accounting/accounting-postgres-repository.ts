import { neon } from "@neondatabase/serverless";
import { config } from "../../lib/config";
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
import type {
  AccountingRepository,
  CreateAccountDTO,
  CreateJournalEntryDTO,
} from "./accounting-repository";
import { randomUUID } from "node:crypto";

const sql = neon(process.env.DATABASE_URL || config().DATABASE_URL || "");

export class PostgresAccountingRepository implements AccountingRepository {
  async createAccount(dto: CreateAccountDTO, tx: any = sql): Promise<Account> {
    const rows = await tx`
      INSERT INTO accounting_accounts (tenant_id, code, name, type, parent_id, currency)
      VALUES (${dto.tenantId}, ${dto.code}, ${dto.name}, ${dto.type}, ${dto.parentId || null}, ${dto.currency || "USD"})
      RETURNING *;
    `;
    return this.mapAccount(rows[0]);
  }

  async getAccountById(id: string, tx: any = sql): Promise<Account | null> {
    const rows = await tx`SELECT * FROM accounting_accounts WHERE id = ${id}`;
    return rows[0] ? this.mapAccount(rows[0]) : null;
  }

  async getAccountsByTenant(tenantId: string, tx: any = sql): Promise<Account[]> {
    const rows = await tx`SELECT * FROM accounting_accounts WHERE tenant_id = ${tenantId}`;
    return rows.map((r: any) => this.mapAccount(r));
  }

  async updateAccount(id: string, updates: Partial<Account>, tx: any = sql): Promise<Account> {
    // Basic dynamic update simulation for raw sql (neon)
    const existing = await this.getAccountById(id, tx);
    if (!existing) throw new Error("Account not found");
    const name = updates.name !== undefined ? updates.name : existing.name;
    const type = updates.type !== undefined ? updates.type : existing.type;
    const rows = await tx`
      UPDATE accounting_accounts 
      SET name = ${name}, type = ${type}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *;
    `;
    return this.mapAccount(rows[0]);
  }

  async createJournalEntry(dto: CreateJournalEntryDTO, tx: any = sql): Promise<JournalEntry> {
    const entryNumber = `JE-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const rows = await tx`
      INSERT INTO accounting_journal_entries (tenant_id, entry_number, description, status, created_by, metadata)
      VALUES (${dto.tenantId}, ${entryNumber}, ${dto.description}, 'pending', ${dto.createdBy}, ${dto.metadata ? JSON.stringify(dto.metadata) : null})
      RETURNING *;
    `;
    return this.mapJournalEntry(rows[0]);
  }

  async getJournalEntryById(id: string, tx: any = sql): Promise<JournalEntry | null> {
    const rows = await tx`SELECT * FROM accounting_journal_entries WHERE id = ${id}`;
    return rows[0] ? this.mapJournalEntry(rows[0]) : null;
  }

  async getJournalEntriesByTenant(tenantId: string, tx: any = sql): Promise<JournalEntry[]> {
    const rows = await tx`SELECT * FROM accounting_journal_entries WHERE tenant_id = ${tenantId}`;
    return rows.map((r: any) => this.mapJournalEntry(r));
  }

  async updateJournalEntryStatus(
    id: string,
    status: TransactionStatus,
    tx: any = sql,
  ): Promise<JournalEntry> {
    const postedAt = status === "posted" ? new Date().toISOString() : null;
    const rows = await tx`
      UPDATE accounting_journal_entries 
      SET status = ${status}, posted_at = COALESCE(posted_at, ${postedAt})
      WHERE id = ${id}
      RETURNING *;
    `;
    return this.mapJournalEntry(rows[0]);
  }

  async createLedgerLines(
    lines: Omit<LedgerLine, "id" | "createdAt">[],
    tx: any = sql,
  ): Promise<LedgerLine[]> {
    // In raw neon SQL we can do multiple inserts
    const created: LedgerLine[] = [];
    for (const line of lines) {
      const rows = await tx`
        INSERT INTO accounting_ledger_lines (entry_id, account_id, tenant_id, debit_cents, credit_cents, description, metadata)
        VALUES (${line.entryId}, ${line.accountId}, ${line.tenantId}, ${line.debitCents}, ${line.creditCents}, ${line.description || null}, ${line.metadata ? JSON.stringify(line.metadata) : null})
        RETURNING *;
      `;
      created.push(this.mapLedgerLine(rows[0]));
    }
    return created;
  }

  async getLedgerLinesByEntry(entryId: string, tx: any = sql): Promise<LedgerLine[]> {
    const rows = await tx`SELECT * FROM accounting_ledger_lines WHERE entry_id = ${entryId}`;
    return rows.map((r: any) => this.mapLedgerLine(r));
  }

  async getLedgerLinesByAccount(accountId: string, tx: any = sql): Promise<LedgerLine[]> {
    const rows = await tx`SELECT * FROM accounting_ledger_lines WHERE account_id = ${accountId}`;
    return rows.map((r: any) => this.mapLedgerLine(r));
  }

  async calculateAccountBalance(
    accountId: string,
    periodStart: Date,
    periodEnd: Date,
    tx: any = sql,
  ): Promise<AccountBalance> {
    const account = await this.getAccountById(accountId, tx);
    if (!account) throw new Error("Account not found");

    const rows = await tx`
      SELECT 
        COALESCE(SUM(l.debit_cents), 0) as total_debits,
        COALESCE(SUM(l.credit_cents), 0) as total_credits
      FROM accounting_ledger_lines l
      JOIN accounting_journal_entries e ON l.entry_id = e.id
      WHERE l.account_id = ${accountId} 
        AND e.status = 'posted'
        AND e.created_at >= ${periodStart.toISOString()}
        AND e.created_at <= ${periodEnd.toISOString()}
    `;

    const debits = Number(rows[0].total_debits);
    const credits = Number(rows[0].total_credits);
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

  async generateTrialBalance(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    tx: any = sql,
  ): Promise<TrialBalance> {
    const accounts = await this.getAccountsByTenant(tenantId, tx);
    const accountBalances = await Promise.all(
      accounts.map((acc) => this.calculateAccountBalance(acc.id, periodStart, periodEnd, tx)),
    );

    let totalDebits = 0;
    let totalCredits = 0;
    const accountsWithBalances = accountBalances.map((balance, idx) => {
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

  async generateBalanceSheet(
    tenantId: string,
    asOfDate: Date,
    tx: any = sql,
  ): Promise<BalanceSheet> {
    const periodStart = new Date(asOfDate.getFullYear(), 0, 1);
    const accounts = await this.getAccountsByTenant(tenantId, tx);
    const balances = await Promise.all(
      accounts.map((acc) => this.calculateAccountBalance(acc.id, periodStart, asOfDate, tx)),
    );

    type BalanceItem = { accountId: string; name: string; balanceCents: number };
    const assets: BalanceItem[] = [],
      liabilities: BalanceItem[] = [],
      equity: BalanceItem[] = [];
    let totalAssets = 0,
      totalLiabilitiesEquity = 0;

    balances.forEach((balance, idx) => {
      const type = accounts[idx].type;
      const item = {
        accountId: balance.accountId,
        name: accounts[idx].name,
        balanceCents: balance.closingBalanceCents,
      };
      if (type === "asset") {
        assets.push(item);
        totalAssets += item.balanceCents;
      }
      if (type === "liability") {
        liabilities.push(item);
        totalLiabilitiesEquity += item.balanceCents;
      }
      if (type === "equity") {
        equity.push(item);
        totalLiabilitiesEquity += item.balanceCents;
      }
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
    // In a real app we'd structure the service to take a callback for transaction.
    // For now, just return the sql instance to mock the transaction interface
    return sql;
  }

  async commitTransaction(tx: unknown): Promise<void> {}
  async rollbackTransaction(tx: unknown): Promise<void> {}

  private mapAccount(row: any): Account {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      code: row.code,
      name: row.name,
      type: row.type as AccountType,
      parentId: row.parent_id,
      currency: row.currency,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapJournalEntry(row: any): JournalEntry {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      entryNumber: row.entry_number,
      description: row.description,
      status: row.status as TransactionStatus,
      postedAt: row.posted_at ? new Date(row.posted_at) : undefined,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  private mapLedgerLine(row: any): LedgerLine {
    return {
      id: row.id,
      entryId: row.entry_id,
      accountId: row.account_id,
      tenantId: row.tenant_id,
      debitCents: row.debit_cents,
      creditCents: row.credit_cents,
      description: row.description,
      createdAt: new Date(row.created_at),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }
}
