import { repositoryFactory } from "./persistence/repository-factory";
import type { ApiKey } from "./persistence/repository";
import { ApiKeyCrypto } from "./api-key-crypto";
import type { ApiKeyRecord } from "./credential-types";
import { config } from "./config";

function recordToApiKey(r: ApiKeyRecord): Partial<ApiKey> {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    ownerId: r.owner_id,
    keyHash: r.key_hash,
    keyPrefix: r.prefix,
    name: r.name,
    secretHint: "",
    role: r.role,
    status: (r.status as ApiKey["status"]) ?? "active",
    scopes: r.scopes,
    createdAt: r.created_at,
    expiresAt: r.expires_at ?? null,
    rotatedAt: r.rotated_from ?? null,
    revokedAt: r.revoked_at ?? null,
    lastUsedAt: r.last_used_at ?? null,
    createdBy: r.created_by ?? "",
    metadata: r.metadata ?? {},
  };
}

function apiKeyToRecord(k: unknown): ApiKeyRecord {
  const kk = k as Record<string, unknown>;
  return {
    id: String(kk.id),
    tenant_id: String(kk.tenantId),
    owner_id: String(kk.ownerId),
    name: String(kk.name),
    prefix: String(kk.keyPrefix),
    key_hash: String(kk.keyHash),
    role: String(kk.role),
    scopes: (kk.scopes as string[]) ?? [],
    status: (kk.status as ApiKeyRecord["status"]) ?? "active",
    created_at: String(kk.createdAt),
    expires_at: (kk.expiresAt as string) ?? undefined,
    last_used_at: (kk.lastUsedAt as string) ?? undefined,
    revoked_at: (kk.revokedAt as string) ?? undefined,
    rotated_from: (kk.rotatedAt as string) ?? undefined,
    created_by: String(kk.createdBy),
    metadata: (kk.metadata as Record<string, unknown>) ?? {},
  };
}

export class ApiKeyService {
  private static get repo() {
    return repositoryFactory.getApiKeyRepository();
  }
  private static get auditRepo() {
    return repositoryFactory.getAuditRepository();
  }

  public static async createApiKey(
    tenantId: string,
    ownerId: string,
    name: string,
    role: string,
    scopes: string[],
    expiresInSeconds?: number,
  ): Promise<{
    id: string;
    name: string;
    key: string;
    prefix: string;
    scopes: string[];
    expiresAt?: string;
  }> {
    if (!tenantId || !ownerId || !name.trim() || scopes.length === 0 || scopes.some((scope) => !/^[a-z0-9:_-]+$/i.test(scope))) {
      throw new Error("invalid_api_key_request");
    }
    if (expiresInSeconds !== undefined && (!Number.isInteger(expiresInSeconds) || expiresInSeconds <= 0)) {
      throw new Error("invalid_api_key_ttl");
    }
    const id = crypto.randomUUID();
    const prefix = `${config().API_KEY_PREFIX || "isa_live"}_${ApiKeyCrypto.generatePrefix()}`;
    const secret = ApiKeyCrypto.generateSecret();
    const rawKey = `${prefix}_${secret}`;
    const keyHash = ApiKeyCrypto.hashSecret(rawKey);

    const ttl = expiresInSeconds !== undefined ? expiresInSeconds : config().API_KEY_DEFAULT_TTL;
    const expiresAt = ttl ? new Date(Date.now() + ttl * 1000).toISOString() : undefined;

    const record: ApiKeyRecord = {
      id,
      tenant_id: tenantId,
      owner_id: ownerId,
      name,
      prefix,
      key_hash: keyHash,
      role,
      scopes,
      status: "active",
      created_at: new Date().toISOString(),
      ...(expiresAt ? { expires_at: expiresAt } : {}),
    };

    await this.repo.create(tenantId, recordToApiKey(record));

    await this.auditRepo.audit({
      id: crypto.randomUUID(),
      tenantId,
      traceId: `trace_ak_${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      action: "api_key.created",
      resource: "api_key",
      severity: "S3",
      actor: ownerId,
      result: "success",
      details: { keyId: id, prefix, tenantId },
    });

    return {
      id,
      name,
      key: rawKey,
      prefix,
      scopes,
      ...(expiresAt ? { expiresAt } : {}),
    };
  }

  public static async verifyApiKey(rawKey: string): Promise<{
    success: boolean;
    record?: ApiKeyRecord;
    error?: string;
  }> {
    if (!rawKey) {
      return { success: false, error: "invalid_credential" };
    }

    const parts = rawKey.split("_");
    if (parts.length < 3) {
      return { success: false, error: "invalid_credential" };
    }

    const prefix = parts.slice(0, -1).join("_");

    // P0-06: use indexed prefix lookup, not generic list — fail-closed if prefix not found
    const repoWithPrefix = this.repo as unknown as { findByPrefix?: (prefix: string) => Promise<unknown> };
    let record: unknown | null = null;
    if (repoWithPrefix.findByPrefix) {
      record = await repoWithPrefix.findByPrefix(prefix);
    } else {
      const { items } = await this.repo.list("", { keyPrefix: prefix });
      record = items[0] ?? null;
    }
    if (!record) {
      return { success: false, error: "invalid_credential" };
    }

    const rec = apiKeyToRecord(record);
    const signatureMatch = ApiKeyCrypto.verifySecret(rawKey, rec.key_hash);
    if (!signatureMatch) {
      return { success: false, error: "invalid_credential" };
    }

    if (rec.status !== "active") {
      return { success: false, error: `credential_${rec.status}` };
    }

    if (rec.expires_at && new Date(rec.expires_at).getTime() < Date.now()) {
      await this.repo.update(rec.tenant_id, rec.id, { status: "expired" });
      return { success: false, error: "credential_expired" };
    }

    await this.repo.update(rec.tenant_id, rec.id, { lastUsedAt: new Date().toISOString() });

    return { success: true, record: rec };
  }

  public static async revokeApiKey(id: string, tenantId: string): Promise<boolean> {
    const existing = await this.repo.read(tenantId, id);
    if (!existing) return false;

    await this.repo.update(tenantId, id, {
      status: "revoked",
      revokedAt: new Date().toISOString(),
    });

    await this.auditRepo.audit({
      id: crypto.randomUUID(),
      tenantId,
      traceId: `trace_ak_${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      action: "api_key.revoked",
      resource: "api_key",
      severity: "S2",
      actor: existing.createdBy,
      result: "success",
      details: { keyId: id },
    });

    return true;
  }

  public static async rotateApiKey(
    id: string,
    tenantId: string,
  ): Promise<{
    success: boolean;
    newKey?: {
      id: string;
      name: string;
      key: string;
      prefix: string;
      scopes: string[];
      expiresAt?: string;
    };
    error?: string;
  }> {
    const existing = await this.repo.read(tenantId, id);
    if (!existing) {
      return { success: false, error: "Llave no encontrada." };
    }

    const rec = apiKeyToRecord(existing);
    await this.repo.update(tenantId, id, { status: "revoked", revokedAt: new Date().toISOString() });

    const newKey = await this.createApiKey(
      tenantId,
      rec.owner_id,
      rec.name,
      rec.role,
      rec.scopes,
      rec.expires_at
        ? Math.max(0, Math.floor((new Date(rec.expires_at).getTime() - Date.now()) / 1000))
        : undefined,
    );

    await this.repo.update(tenantId, newKey.id, { rotatedAt: id });

    return { success: true, newKey };
  }

  public static async listApiKeys(tenantId: string): Promise<ApiKeyRecord[]> {
    const { items } = await this.repo.list(tenantId, { tenantId });
    return items.map(apiKeyToRecord);
  }
}
