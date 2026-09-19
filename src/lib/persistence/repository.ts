/**
 * REPOSITORY PATTERN INTERFACE
 *
 * PostgreSQL/Neon is the authoritative durable state provider in production.
 * Supabase is an identity/integration boundary and is intentionally not exposed
 * as a state-authority adapter through RepositoryFactory. Redis is a cache/session
 * adapter and must never become the source of financial or governance truth.
 */

export type OperationType = "READ" | "WRITE" | "DELETE" | "AUDIT";

export interface AuditEntry {
  id: string;
  tenantId: string;
  traceId: string;
  timestamp: string;
  action: string;
  resource: string;
  severity: "S0" | "S1" | "S2" | "S3";
  actor: string;
  result: "success" | "failure" | "denied";
  details: Record<string, unknown>;
}

export interface ApiKey {
  id: string;
  tenantId: string;
  ownerId: string;
  keyHash: string;
  keyPrefix: string;
  name: string;
  role: string;
  status: "active" | "suspended" | "expired" | "revoked";
  secretHint: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string | null;
  rotatedAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdBy: string;
  metadata: Record<string, unknown>;
}

export interface Tenant {
  id: string;
  slug: string;
  tier: "free" | "pro" | "enterprise" | "sovereign";
  quotaBalance: number;
  quotaTierLimit: number;
  createdAt: string;
  createdBy: string;
  metadata: Record<string, unknown>;
}

export interface Session {
  id: string;
  tenantId: string;
  userId: string;
  principalType: "user" | "machine" | "service";
  tokenJti?: string;
  expiresAt: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface ReadOptions {
  cache?: boolean;
  cacheTtlSeconds?: number;
}

export interface WriteOptions {
  idempotencyKey?: string;
}

export interface IRepository<T> {
  create(tenantId: string, data: Partial<T>, options?: WriteOptions): Promise<T>;
  read(tenantId: string, id: string, options?: ReadOptions): Promise<T | null>;
  list(
    tenantId: string,
    filters?: Record<string, unknown>,
    limit?: number,
    offset?: number,
  ): Promise<{ items: T[]; total: number }>;
  update(tenantId: string, id: string, data: Partial<T>, options?: WriteOptions): Promise<T>;
  delete(tenantId: string, id: string): Promise<boolean>;
  audit(entry: AuditEntry): Promise<void>;
  health(): Promise<{ ok: boolean; latencyMs: number }>;
  findByPrefix?(prefix: string): Promise<T | null>;
}

export interface RepositoryFactory {
  /** Authoritative durable/cache adapters only. Supabase is deliberately excluded. */
  getAdapter<T extends { id: string }>(type: "neon" | "redis", schema?: string): IRepository<T>;
  getApiKeyRepository(): IRepository<ApiKey>;
  getAuditRepository(): IRepository<AuditEntry>;
  getTenantRepository(): IRepository<Tenant>;
  getSessionRepository(): IRepository<Session>;
}

export interface RepositoryError extends Error {
  code: string;
  statusCode: number;
  tenantId?: string;
  retryable: boolean;
}

export function isRepositoryError(error: unknown): error is RepositoryError {
  return error instanceof Error && "code" in error && "statusCode" in error && "retryable" in error;
}

export { JsonFileRepository, JsonRepositoryFactory } from "./adapters/json-adapter";
