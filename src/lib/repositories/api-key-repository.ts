import { neon } from "@neondatabase/serverless";
import { config } from "../config";

// ============================================================================
// API KEY REPOSITORY (src/lib/repositories/api-key-repository.ts)
// ----------------------------------------------------------------------------
// Repositorio DEDICADO con SQL explícito (P0-04/P1-19).
// Contrato canónico, sin conversión genérica: `prefix`, `key_hash`, etc.
// ============================================================================

export interface ApiKeyRow {
  id: string;
  tenant_id: string;
  owner_id: string;
  name: string;
  prefix: string;
  key_hash: string;
  role: string;
  scopes: string[];
  status: "active" | "suspended" | "expired" | "revoked";
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  rotated_from: string | null;
  created_by: string | null;
  metadata: Record<string, unknown>;
}

function mapRow(row: Record<string, unknown>): ApiKeyRow {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    owner_id: String(row.owner_id),
    name: String(row.name),
    prefix: String(row.prefix),
    key_hash: String(row.key_hash),
    role: String(row.role),
    scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
    status: row.status as ApiKeyRow["status"],
    created_at: new Date(String(row.created_at)).toISOString(),
    expires_at: row.expires_at ? new Date(String(row.expires_at)).toISOString() : null,
    last_used_at: row.last_used_at ? new Date(String(row.last_used_at)).toISOString() : null,
    revoked_at: row.revoked_at ? new Date(String(row.revoked_at)).toISOString() : null,
    rotated_from: row.rotated_from ? String(row.rotated_from) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

export function createApiKeyPostgresRepository() {
  const cfg = config();
  const dsn = cfg.DATABASE_URL as string;
  const sql = neon(dsn);

  async function findByPrefix(prefix: string): Promise<ApiKeyRow | null> {
    const rows =
      await sql`SELECT * FROM public.api_keys WHERE prefix = ${prefix} AND status <> 'revoked' LIMIT 1`;
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async function findByPrefixAllowAny(prefix: string): Promise<ApiKeyRow | null> {
    const rows = await sql`SELECT * FROM public.api_keys WHERE prefix = ${prefix} LIMIT 1`;
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async function findById(tenantId: string, id: string): Promise<ApiKeyRow | null> {
    const rows =
      await sql`SELECT * FROM public.api_keys WHERE id = ${id} AND tenant_id = ${tenantId} LIMIT 1`;
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async function list(tenantId: string): Promise<ApiKeyRow[]> {
    const rows =
      await sql`SELECT * FROM public.api_keys WHERE tenant_id = ${tenantId} ORDER BY created_at DESC`;
    return rows.map(mapRow);
  }

  async function create(row: {
    id: string;
    tenant_id: string;
    owner_id: string;
    name: string;
    prefix: string;
    key_hash: string;
    role: string;
    scopes: string[];
    expires_at?: string;
  }): Promise<ApiKeyRow> {
    const rows = await sql`INSERT INTO public.api_keys
      (id, tenant_id, owner_id, name, prefix, key_hash, role, scopes, status, created_by, expires_at)
      VALUES (
        ${row.id}, ${row.tenant_id}, ${row.owner_id}, ${row.name}, ${row.prefix},
        ${row.key_hash}, ${row.role}, ${row.scopes}, 'active', ${row.owner_id},
        ${row.expires_at ?? null}
      )
      RETURNING *`;
    return mapRow(rows[0]!);
  }

  async function revoke(id: string, tenantId: string): Promise<boolean> {
    const rows = await sql`UPDATE public.api_keys
      SET status = 'revoked', revoked_at = now()
      WHERE id = ${id} AND tenant_id = ${tenantId}
      RETURNING id`;
    return rows.length > 0;
  }

  async function touchLastUsed(id: string): Promise<void> {
    await sql`UPDATE public.api_keys SET last_used_at = now() WHERE id = ${id}`;
  }

  async function updateStatus(id: string, status: ApiKeyRow["status"]): Promise<void> {
    await sql`UPDATE public.api_keys SET status = ${status} WHERE id = ${id}`;
  }

  async function setRotatedFrom(newId: string, oldId: string, tenantId: string): Promise<void> {
    await sql`UPDATE public.api_keys SET rotated_from = ${oldId} WHERE id = ${newId} AND tenant_id = ${tenantId}`;
  }

  return {
    findByPrefix,
    findByPrefixAllowAny,
    findById,
    list,
    create,
    revoke,
    touchLastUsed,
    updateStatus,
    setRotatedFrom,
  };
}

export type ApiKeyPostgresRepository = ReturnType<typeof createApiKeyPostgresRepository>;
