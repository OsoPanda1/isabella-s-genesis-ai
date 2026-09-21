/**
 * CAPA DE DATOS DE MONETIZACIÓN (src/lib/db.ts)
 * -----------------------------------------------------------------
 * Sustituye al cliente Prisma (motor nativo incompatible con el
 * runtime edge) por acceso directo a PostgreSQL vía `pg`.
 *
 * Expone una API mínima con la misma forma que se usaba antes
 * (`prisma.monetizationAccount.findUnique | create | update`) para no
 * alterar las rutas soberanas existentes, pero con SQL explícito,
 * parametrizado y auditable.
 *
 * Fail-closed: sin DATABASE_URL no hay degradación silenciosa.
 */

import { Pool } from "pg";
import { config } from "./config";

export interface MonetizationAccount {
  userId: string;
  earnedBalanceCents: number;
  qualifiedUses: number;
  approvedContributions: number;
  trainingCompleted: boolean;
  identityVerified: boolean;
  paymentAccountVerified: boolean;
  profileComplete: boolean;
  sanctioned: boolean;
  underFraudReview: boolean;
  createdAt: string;
}

type MonetizationAccountInput = Partial<MonetizationAccount> & { userId: string };

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;
  let url: string | undefined;
  try {
    url = config().DATABASE_URL;
  } catch {
    url = process.env.DATABASE_URL;
  }
  if (!url) {
    throw new Error(
      "CRITICAL: DATABASE_URL ausente. La monetización requiere persistencia durable (PostgreSQL).",
    );
  }
  pool = new Pool({ connectionString: url, max: 2 });
  return pool;
}

/** Consulta SQL parametrizada y auditable (uso interno del dominio). */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query(text, params as never[]);
  return res.rows as T[];
}

const COLUMNS: Record<Exclude<keyof MonetizationAccount, "createdAt">, string> = {
  userId: "user_id",
  earnedBalanceCents: "earned_balance_cents",
  qualifiedUses: "qualified_uses",
  approvedContributions: "approved_contributions",
  trainingCompleted: "training_completed",
  identityVerified: "identity_verified",
  paymentAccountVerified: "payment_account_verified",
  profileComplete: "profile_complete",
  sanctioned: "sanctioned",
  underFraudReview: "under_fraud_review",
};

function mapRow(row: Record<string, unknown>): MonetizationAccount {
  return {
    userId: String(row.user_id),
    earnedBalanceCents: Number(row.earned_balance_cents ?? 0),
    qualifiedUses: Number(row.qualified_uses ?? 0),
    approvedContributions: Number(row.approved_contributions ?? 0),
    trainingCompleted: row.training_completed === true,
    identityVerified: row.identity_verified === true,
    paymentAccountVerified: row.payment_account_verified === true,
    profileComplete: row.profile_complete === true,
    sanctioned: row.sanctioned === true,
    underFraudReview: row.under_fraud_review === true,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? new Date(0).toISOString()),
  };
}

async function findUnique(args: {
  where: { userId: string };
}): Promise<MonetizationAccount | null> {
  const res = await getPool().query(
    "select * from monetization_accounts where user_id = $1 limit 1",
    [args.where.userId],
  );
  const row = res.rows[0] as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

async function create(args: { data: MonetizationAccountInput }): Promise<MonetizationAccount> {
  const res = await getPool().query(
    `insert into monetization_accounts (user_id)
     values ($1)
     on conflict (user_id) do update set user_id = excluded.user_id
     returning *`,
    [args.data.userId],
  );
  return mapRow(res.rows[0] as Record<string, unknown>);
}

async function update(args: {
  where: { userId: string };
  data: Partial<Omit<MonetizationAccount, "userId">>;
}): Promise<MonetizationAccount> {
  const entries = Object.entries(args.data).filter(
    ([key, v]) => v !== undefined && key !== "createdAt",
  ) as Array<[Exclude<keyof MonetizationAccount, "createdAt">, unknown]>;
  if (entries.length === 0) {
    const current = await findUnique({ where: args.where });
    if (!current) throw new Error("Cuenta de monetización inexistente.");
    return current;
  }
  const setSql = entries.map(([key], i) => `${COLUMNS[key]} = $${i + 2}`).join(", ");
  const values = entries.map(([, value]) => value);
  const res = await getPool().query(
    `insert into monetization_accounts (user_id) values ($1)
     on conflict (user_id) do nothing`,
    [args.where.userId],
  );
  void res;
  const updated = await getPool().query(
    `update monetization_accounts set ${setSql}, updated_at = now() where user_id = $1 returning *`,
    [args.where.userId, ...values],
  );
  const row = updated.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error("Cuenta de monetización inexistente.");
  return mapRow(row);
}

export const prisma = {
  monetizationAccount: { findUnique, create, update },
};

export type { MonetizationAccountInput };
