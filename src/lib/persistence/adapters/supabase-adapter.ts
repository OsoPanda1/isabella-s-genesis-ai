import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { IRepository, AuditEntry, RepositoryError, ReadOptions, WriteOptions } from "../repository";
import { config } from "../../config";

const TABLE_MAP: Record<string, string> = {
  tenant: "tenants",
  session: "sessions",
  apiKey: "api_keys",
  audit: "audit_events",
};

function toRepositoryError(message: string, statusCode = 500, tenantId?: string): RepositoryError {
  const err = new Error(message) as RepositoryError;
  err.code = "REPOSITORY_ERROR";
  err.statusCode = statusCode;
  if (tenantId !== undefined) err.tenantId = tenantId;
  err.retryable = statusCode >= 500;
  return err;
}

function getSupabase(): SupabaseClient | null {
  const cfg = config();
  const url = cfg.SUPABASE_URL;
  const serviceKey = cfg.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function requireSupabase(tenantId?: string): SupabaseClient {
  const client = getSupabase();
  if (!client) {
    throw toRepositoryError("Supabase not configured — deployment blocker: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required", 500, tenantId);
  }
  return client;
}

export class SupabaseRepository<T extends { id: string }> implements IRepository<T> {
  private readonly table: string;
  private readonly type: string;

  constructor(type: string) {
    this.type = type;
    this.table = TABLE_MAP[type] ?? type;
  }

  async create(tenantId: string, data: Partial<T>, options?: WriteOptions): Promise<T> {
    if (!tenantId) throw toRepositoryError("tenantId required for create", 400);
    const supabase = requireSupabase(tenantId);
    const payload = { ...data, tenant_id: tenantId, tenantId: undefined } as Record<string, unknown>;
    // Map camelCase to snake_case for known fields
    const row = toSnake(payload);
    if (options?.idempotencyKey) {
      // Use idempotency key as id if provided and no id set
      if (!row.id) row.id = options.idempotencyKey;
    }
    const { data: inserted, error } = await supabase.from(this.table).insert(row).select().single();
    if (error) throw toRepositoryError(`Supabase insert failed: ${error.message}`, 500, tenantId);
    return toCamel<T>(inserted);
  }

  async read(tenantId: string, id: string, _options?: ReadOptions): Promise<T | null> {
    if (!tenantId) throw toRepositoryError("tenantId required for read", 400);
    const supabase = requireSupabase(tenantId);
    const { data, error } = await supabase.from(this.table).select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (error) throw toRepositoryError(`Supabase read failed: ${error.message}`, 500, tenantId);
    return data ? toCamel<T>(data) : null;
  }

  async list(tenantId: string, filters?: Record<string, unknown>, limit?: number, offset?: number): Promise<{ items: T[]; total: number }> {
    if (!tenantId) throw toRepositoryError("tenantId required for list", 400);
    const supabase = requireSupabase(tenantId);
    let query = supabase.from(this.table).select("*", { count: "exact" }).eq("tenant_id", tenantId);
    if (filters) {
      for (const [k, v] of Object.entries(filters)) {
        const col = toSnakeKey(k);
        if (v !== undefined) query = query.eq(col, v as string);
      }
    }
    if (offset !== undefined) query = query.range(offset, offset + (limit ?? 50) - 1);
    else if (limit !== undefined) query = query.limit(limit);
    const { data, error, count } = await query;
    if (error) throw toRepositoryError(`Supabase list failed: ${error.message}`, 500, tenantId);
    const items = (data ?? []).map(toCamel<T>);
    return { items, total: count ?? items.length };
  }

  async update(tenantId: string, id: string, data: Partial<T>, _options?: WriteOptions): Promise<T> {
    if (!tenantId) throw toRepositoryError("tenantId required for update", 400);
    const supabase = requireSupabase(tenantId);
    const row = toSnake(data as Record<string, unknown>);
    const { data: updated, error } = await supabase.from(this.table).update(row).eq("id", id).eq("tenant_id", tenantId).select().single();
    if (error) throw toRepositoryError(`Supabase update failed: ${error.message}`, 500, tenantId);
    if (!updated) throw toRepositoryError(`Record ${id} not found`, 404, tenantId);
    return toCamel<T>(updated);
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    if (!tenantId) throw toRepositoryError("tenantId required for delete", 400);
    const supabase = requireSupabase(tenantId);
    const { error, count } = await supabase.from(this.table).delete({ count: "exact" }).eq("id", id).eq("tenant_id", tenantId);
    if (error) throw toRepositoryError(`Supabase delete failed: ${error.message}`, 500, tenantId);
    return (count ?? 0) > 0;
  }

  async audit(entry: AuditEntry): Promise<void> {
    const supabase = requireSupabase(entry.tenantId);
    const row = toSnake(entry as unknown as Record<string, unknown>);
    const { error } = await supabase.from("audit_events").insert(row);
    if (error) throw toRepositoryError(`Supabase audit failed: ${error.message}`, 500, entry.tenantId);
  }

  async health(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = performance.now();
    try {
      const supabase = getSupabase();
      if (!supabase) return { ok: false, latencyMs: performance.now() - start };
      const { error } = await supabase.from(this.table).select("id").limit(1);
      return { ok: !error, latencyMs: performance.now() - start };
    } catch {
      return { ok: false, latencyMs: performance.now() - start };
    }
  }

  // Specialized lookup for API keys by prefix — avoids generic list for auth, tenant-agnostic then hash-verify
  async findByPrefix(prefix: string): Promise<T | null> {
    const supabase = getSupabase() ?? requireSupabase();
    const { data, error } = await supabase.from(this.table).select("*").eq("key_prefix", prefix).maybeSingle();
    if (error) throw toRepositoryError(`Supabase findByPrefix failed: ${error.message}`, 500);
    return data ? toCamel<T>(data) : null;
  }
}

// Helpers: camelCase <-> snake_case
function toSnake(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[toSnakeKey(k)] = v;
  }
  return out;
}
function toSnakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}
function toCamel<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[toCamelKey(k)] = v;
  }
  return out as T;
}
function toCamelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
