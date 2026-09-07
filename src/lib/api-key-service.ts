import { repositoryFactory } from "./persistence/repository-factory";
import type { ApiKey } from "./persistence/repository";
import { ApiKeyCrypto } from "./api-key-crypto";
import type { ApiKeyRecord } from "./credential-types";
import { config } from "./config";
import { createApiKeyPostgresRepository } from "./repositories/api-key-repository";

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
  // P0-04: manejar la columna canónica `prefix` y la variante camelCase `keyPrefix`.
  const prefix = String(kk.prefix ?? kk.keyPrefix ?? "");
  const keyHash = String(kk.key_hash ?? kk.keyHash ?? "");
  const record: ApiKeyRecord = {
    id: String(kk.id),
    tenant_id: String(kk.tenant_id ?? kk.tenantId),
    owner_id: String(kk.owner_id ?? kk.ownerId),
    name: String(kk.name),
    prefix,
    key_hash: keyHash,
    role: String(kk.role),
    scopes: (kk.scopes as string[]) ?? [],
    status: (kk.status as ApiKeyRecord["status"]) ?? "active",
    created_at: String(kk.created_at ?? kk.createdAt),
    metadata: (kk.metadata as Record<string, unknown>) ?? {},
  };
  const optional = {
    expires_at: kk.expires_at ?? kk.expiresAt,
    last_used_at: kk.last_used_at ?? kk.lastUsedAt,
    revoked_at: kk.revoked_at ?? kk.revokedAt,
    rotated_from: kk.rotated_from ?? kk.rotatedAt,
    created_by: kk.created_by ?? kk.createdBy,
  } as Record<string, unknown>;
  for (const key of Object.keys(optional)) {
    const value = optional[key];
    if (value !== undefined && value !== null) {
      (record as unknown as Record<string, unknown>)[key] = String(value);
    }
  }
  return record;
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
    if (
      !tenantId ||
      !ownerId ||
      !name.trim() ||
      scopes.length === 0 ||
      scopes.some((scope) => !/^[a-z0-9:_-]+$/i.test(scope))
    ) {
      throw new Error("invalid_api_key_request");
    }
    if (
      expiresInSeconds !== undefined &&
      (!Number.isInteger(expiresInSeconds) || expiresInSeconds <= 0)
    ) {
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

    // P0-06/P0-13: lookup por prefix indexado. En runtime productivo la
    // verificación de API keys corre SIN identidad de usuario (es el flujo de
    // autenticación), por lo que NUNCA debe pasar por el adapter tenant-scoped
    // (que exige request identity para RLS) ni por service_role.
    const cfg = config();
    const usePostgres = Boolean(cfg.DATABASE_URL);
    let record: ApiKeyRecord | null = null;

    if (usePostgres) {
      const pg = createApiKeyPostgresRepository();
      const row = await pg.findByPrefix(prefix);
      if (row) record = apiKeyToRecord(row);
    } else {
      const repoWithPrefix = this.repo as unknown as {
        findByPrefix?: (p: string) => Promise<unknown>;
      };
      if (repoWithPrefix.findByPrefix) {
        const r = await repoWithPrefix.findByPrefix(prefix);
        if (r) record = apiKeyToRecord(r);
      } else {
        const { items } = await this.repo.list("", { keyPrefix: prefix });
        record = items[0] ? apiKeyToRecord(items[0]) : null;
      }
    }

    if (!record) {
      return { success: false, error: "invalid_credential" };
    }

    const signatureMatch = ApiKeyCrypto.verifySecret(rawKey, record.key_hash);
    if (!signatureMatch) {
      return { success: false, error: "invalid_credential" };
    }

    if (record.status !== "active") {
      return { success: false, error: `credential_${record.status}` };
    }

    if (record.expires_at && new Date(record.expires_at).getTime() < Date.now()) {
      if (usePostgres) {
        await createApiKeyPostgresRepository().updateStatus(record.id, "expired");
      } else {
        await this.repo.update(record.tenant_id, record.id, { status: "expired" });
      }
      return { success: false, error: "credential_expired" };
    }

    if (usePostgres) {
      await createApiKeyPostgresRepository().touchLastUsed(record.id);
    } else {
      await this.repo.update(record.tenant_id, record.id, { lastUsedAt: new Date().toISOString() });
    }

    return { success: true, record };
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
    await this.repo.update(tenantId, id, {
      status: "revoked",
      revokedAt: new Date().toISOString(),
    });

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
