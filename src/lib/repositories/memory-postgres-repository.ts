import { neon } from "@neondatabase/serverless";
import { createHash, randomUUID } from "node:crypto";
import { config } from "../config";
import type { MemoryRecord, MemoryScope, MemorySensitivity } from "./memory-repository";

const GENESIS_HASH = "0".repeat(64);

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function mapSensitivity(raw: string): MemorySensitivity {
  switch (raw) {
    case "low":
    case "public":
      return "public";
    case "high":
    case "restricted":
      return "restricted";
    default:
      return "internal";
  }
}

function sanitizeExpires(raw: string): string | undefined {
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

function mapRow(row: Record<string, unknown>): MemoryRecord {
  const scope = String(row.scope).toLowerCase() as MemoryScope;
  const record: MemoryRecord = {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    content: String(row.content),
    source: "system",
    scope,
    sensitivity: mapSensitivity(String(row.sensitivity ?? "")),
    purpose: String(row.purpose ?? ""),
    consentRequired: false,
    consentGranted: Boolean(row.consent),
    createdAt: new Date(String(row.created_at)).toISOString(),
    deletable: true,
    provenance: row.provenance ? String(row.provenance).split(",").filter(Boolean) : [],
    contentHash: String(row.content_hash ?? ""),
    chainHash: GENESIS_HASH,
  };
  if (row.user_id) record.ownerId = String(row.user_id);
  if (row.expires_at) {
    const exp = sanitizeExpires(String(row.expires_at));
    if (exp) record.expiresAt = exp;
  }
  return record;
}

/**
 * Repositorio de memoria contra la tabla canónica `memories` (FASE 3).
 * Persistencia real en Postgres con hash de contenido y expiración.
 */
export function createMemoryPostgresRepository() {
  const cfg = config();
  const dsn = cfg.DATABASE_URL as string;
  const sql = neon(dsn);

  return {
    async add(input: {
      tenantId: string;
      ownerId?: string;
      content: string;
      scope: MemoryScope;
      sensitivity: "low" | "medium" | "high";
      purpose: string;
      consent: boolean;
      provenance: string[];
      expiresAt?: string;
    }): Promise<{ success: true; record: MemoryRecord } | { success: false; error: string }> {
      if (!input.content || input.content.length === 0) {
        return { success: false, error: "Contenido de memoria vacío." };
      }
      const id = randomUUID();
      const contentHash = sha256(input.content);
      const payload: Record<string, unknown> = {
        id,
        tenant_id: input.tenantId,
        content: input.content,
        scope: input.scope,
        sensitivity: input.sensitivity,
        purpose: input.purpose,
        consent: input.consent,
        provenance: input.provenance.join(","),
        content_hash: contentHash,
        metadata: { hash: contentHash },
      };
      if (input.ownerId) payload.user_id = input.ownerId;
      if (input.expiresAt) payload.expires_at = input.expiresAt;

      try {
        const rows = await sql`INSERT INTO public.memories
          (id, tenant_id, user_id, content, scope, sensitivity, purpose, consent, provenance, content_hash, metadata, expires_at)
          VALUES (${payload.id}, ${payload.tenant_id}, ${payload.user_id ?? null}, ${payload.content}, ${payload.scope}, ${payload.sensitivity}, ${payload.purpose}, ${payload.consent}, ${payload.provenance}, ${payload.content_hash}, ${JSON.stringify(payload.metadata)}, ${payload.expires_at ?? null})
          RETURNING *`;
        const record = mapRow(rows[0]!);
        return { success: true, record };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "memory_insert_failed",
        };
      }
    },

    async list(tenantId: string, scope?: MemoryScope): Promise<MemoryRecord[]> {
      if (scope) {
        const rows =
          await sql`SELECT * FROM public.memories WHERE tenant_id = ${tenantId} AND scope = ${scope} ORDER BY created_at DESC`;
        return rows.map(mapRow);
      }
      const rows =
        await sql`SELECT * FROM public.memories WHERE tenant_id = ${tenantId} ORDER BY created_at DESC`;
      return rows.map(mapRow);
    },

    async prune(now: number = Date.now()): Promise<{ removed: number }> {
      const rows =
        await sql`DELETE FROM public.memories WHERE expires_at IS NOT NULL AND expires_at < ${new Date(now).toISOString()} RETURNING id`;
      return { removed: rows.length };
    },

    async verifyIntegrity(): Promise<{ success: boolean; error?: string; corruptedId?: string }> {
      const rows = await sql`SELECT * FROM public.memories ORDER BY created_at ASC`;
      for (const row of rows) {
        const expected = sha256(String(row.content));
        if (row.content_hash && String(row.content_hash) !== expected) {
          return { success: false, error: "Contenido alterado.", corruptedId: String(row.id) };
        }
      }
      return { success: true };
    },
  };
}

export type MemoryPostgresRepository = ReturnType<typeof createMemoryPostgresRepository>;
