/**
 * REPOSITORY PATTERN INTERFACE
 * Abstraction layer for multi-database persistence.
 * Implementations: Supabase (auth, audit), Neon (transactional), Redis (cache, sessions).
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
  actor: string; // hashed principal identifier
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
  expiresAt: string;
  createdAt: string;
}

export interface ReadOptions {
  cache?: boolean;
  cacheTtlSeconds?: number;
}

export interface WriteOptions {
  idempotencyKey?: string;
}

/**
 * IRepository<T> — Canonical interface for all persistence operations.
 * All adapters (Supabase, Neon, Redis) must implement this contract.
 */
export interface IRepository<T> {
  /**
   * Create a new record
   */
  create(tenantId: string, data: Partial<T>, options?: WriteOptions): Promise<T>;

  /**
   * Read by ID with tenant isolation
   */
  read(tenantId: string, id: string, options?: ReadOptions): Promise<T | null>;

  /**
   * List with pagination and filters
   */
  list(
    tenantId: string,
    filters?: Record<string, unknown>,
    limit?: number,
    offset?: number,
  ): Promise<{ items: T[]; total: number }>;

  /**
   * Update record
   */
  update(tenantId: string, id: string, data: Partial<T>, options?: WriteOptions): Promise<T>;

  /**
   * Delete record
   */
  delete(tenantId: string, id: string): Promise<boolean>;

  /**
   * Append audit log entry
   */
  audit(entry: AuditEntry): Promise<void>;

  /**
   * Health check / connection verification
   */
  health(): Promise<{ ok: boolean; latencyMs: number }>;

  /**
   * Find candidate by key prefix for API key auth — tenant-agnostic prefix lookup, hash verification follows
   * Implementations must not use generic list for auth; use indexed prefix lookup
   */
  findByPrefix?(prefix: string): Promise<T | null>;
}

export interface RepositoryFactory {
  /**
   * Get adapter by type
   */
  getAdapter<T extends { id: string }>(
    type: "supabase" | "neon" | "redis",
    schema?: string,
  ): IRepository<T>;

  /**
   * Get specialized API key repository
   */
  getApiKeyRepository(): IRepository<ApiKey>;

  /**
   * Get specialized audit repository
   */
  getAuditRepository(): IRepository<AuditEntry>;

  /**
   * Get specialized tenant repository
   */
  getTenantRepository(): IRepository<Tenant>;

  /**
   * Get specialized session repository
   */
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
