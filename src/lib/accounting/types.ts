/**
 * BOOKPI — SISTEMA DE CONTABILIDAD DE DOBLE ENTRADA
 * Tipos fundamentales para transacciones contables
 */

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export type TransactionStatus = "pending" | "posted" | "reversed" | "failed";

export interface Account {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  type: AccountType;
  parentId?: string;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface JournalEntry {
  id: string;
  tenantId: string;
  entryNumber: string;
  description: string;
  status: TransactionStatus;
  postedAt?: Date;
  createdAt: Date;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

export interface LedgerLine {
  id: string;
  entryId: string;
  accountId: string;
  tenantId: string;
  debitCents: number;
  creditCents: number;
  description?: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface AccountBalance {
  accountId: string;
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  openingBalanceCents: number;
  debitCents: number;
  creditCents: number;
  closingBalanceCents: number;
  currency: string;
}

export interface TrialBalance {
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  accounts: Array<{
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: AccountType;
    debitCents: number;
    creditCents: number;
    netBalanceCents: number;
  }>;
  totalDebitsCents: number;
  totalCreditsCents: number;
  isBalanced: boolean;
  generatedAt: Date;
}

export interface BalanceSheet {
  tenantId: string;
  asOfDate: Date;
  assets: Array<{ accountId: string; name: string; balanceCents: number }>;
  liabilities: Array<{ accountId: string; name: string; balanceCents: number }>;
  equity: Array<{ accountId: string; name: string; balanceCents: number }>;
  totalAssetsCents: number;
  totalLiabilitiesAndEquityCents: number;
  isBalanced: boolean;
  generatedAt: Date;
}

export interface DoubleEntryValidation {
  isValid: boolean;
  errors: string[];
  totalDebitsCents: number;
  totalCreditsCents: number;
  differenceCents: number;
}
