/**
 * APPROVAL LEDGER POSTGRES (src/lib/repositories/approval-repository.ts)
 * -----------------------------------------------------------------
 * Misma interfaz que el ledger en memoria de execution-authority, pero
 * durable en PostgreSQL con consumo atómico (una sola fila gana la
 * carrera). Sin DATABASE_URL el factory lanza (fail-closed): las
 * aprobaciones no se degradan a memoria en producción.
 */

import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { config } from "../config";
import type { ApprovalGrant } from "../execution-authority";

const APPROVAL_TTL_MS = 5 * 60 * 1000;

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;
  const url = config().DATABASE_URL;
  if (!url) {
    throw new Error("CRITICAL: DATABASE_URL ausente. Approvals requieren persistencia durable.");
  }
  pool = new Pool({ connectionString: url, max: 2 });
  return pool;
}

function mapRow(row: Record<string, unknown>): ApprovalGrant {
  return {
    approvalId: String(row.approval_id),
    traceId: String(row.trace_id),
    tool: String(row.tool),
    actorId: String(row.actor_id),
    tenantId: String(row.tenant_id),
    grantedAt: new Date(String(row.granted_at)).getTime(),
    expiresAt: new Date(String(row.expires_at)).getTime(),
    consumed: row.consumed === true,
  };
}

export function createPostgresApprovalStore(): {
  has(traceId: string, tool: string, actorId: string, tenantId: string): Promise<boolean>;
  consume(
    traceId: string,
    tool: string,
    actorId: string,
    tenantId: string,
  ): Promise<ApprovalGrant | null>;
} {
  return { has: hasApprovalAsync, consume: consumeApprovalAsync };
}

export async function grantApprovalAsync(
  traceId: string,
  tool: string,
  actorId: string,
  tenantId: string,
): Promise<ApprovalGrant> {
  const approvalId = `apr_${randomUUID().replace(/-/g, "")}`;
  const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS).toISOString();
  const { rows } = await getPool().query(
    `INSERT INTO approval_grants (approval_id, trace_id, tool, actor_id, tenant_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (trace_id, tool, actor_id, tenant_id) DO NOTHING
     RETURNING *`,
    [approvalId, traceId, tool, actorId, tenantId, expiresAt],
  );
  if (rows[0]) return mapRow(rows[0]);
  const existing = await getPool().query(
    `SELECT * FROM approval_grants WHERE trace_id = $1 AND tool = $2 AND actor_id = $3 AND tenant_id = $4 LIMIT 1`,
    [traceId, tool, actorId, tenantId],
  );
  return mapRow(existing.rows[0]);
}

/** Consumo atómico: exactamente un consumidor gana aunque haya carreras. */
export async function consumeApprovalAsync(
  traceId: string,
  tool: string,
  actorId: string,
  tenantId: string,
): Promise<ApprovalGrant | null> {
  const { rows } = await getPool().query(
    `UPDATE approval_grants
     SET consumed = TRUE, consumed_at = NOW()
     WHERE approval_id IN (
       SELECT approval_id FROM approval_grants
       WHERE trace_id = $1 AND tool = $2 AND actor_id = $3 AND tenant_id = $4
         AND consumed = FALSE AND expires_at > NOW()
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [traceId, tool, actorId, tenantId],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function hasApprovalAsync(
  traceId: string,
  tool: string,
  actorId: string,
  tenantId: string,
): Promise<boolean> {
  const { rows } = await getPool().query(
    `SELECT 1 FROM approval_grants
     WHERE trace_id = $1 AND tool = $2 AND actor_id = $3 AND tenant_id = $4
       AND consumed = FALSE AND expires_at > NOW()
     LIMIT 1`,
    [traceId, tool, actorId, tenantId],
  );
  return rows.length > 0;
}

export const APPROVAL_REPOSITORY = {
  grant: grantApprovalAsync,
  consume: consumeApprovalAsync,
  has: hasApprovalAsync,
  store: createPostgresApprovalStore,
};
