import { neon } from "@neondatabase/serverless";
import { config } from "@/lib/config";
import type { ModelStatus } from "./model-registry";

export interface DurableModelRecord {
  tenantId: string;
  modelId: string;
  version: string;
  providerId: string;
  territoryId: string;
  modalities: string[];
  capabilities: string[];
  enabled: boolean;
  productionApproved: boolean;
  status: ModelStatus;
  artifactHash: string;
  license: string;
  createdAt: string;
}

// One pooled Neon client per process (re-created only if the URL changes).
// Creating a client per query added a full connection setup to every request.
function makeSql(url: string) {
  return neon(url);
}

let cachedSql: ReturnType<typeof makeSql> | undefined;
let cachedSqlUrl: string | undefined;

function sql() {
  const url = config().DATABASE_URL;
  if (!url) throw new Error("durable_model_registry_unavailable: DATABASE_URL is required");
  if (!cachedSql || cachedSqlUrl !== url) {
    cachedSql = makeSql(url);
    cachedSqlUrl = url;
  }
  return cachedSql;
}

export async function getDurableModel(
  tenantId: string,
  modelId: string,
  version?: string,
): Promise<DurableModelRecord | null> {
  const rows = version
    ? await sql()`
        SELECT tenant_id, model_id, version, provider_id, territory_id, modalities, capabilities,
               enabled, production_approved, status, artifact_hash, license, created_at
        FROM fgais_model_registry
        WHERE tenant_id = ${tenantId} AND model_id = ${modelId} AND version = ${version}
        ORDER BY created_at DESC
        LIMIT 1
      `
    : await sql()`
        SELECT tenant_id, model_id, version, provider_id, territory_id, modalities, capabilities,
               enabled, production_approved, status, artifact_hash, license, created_at
        FROM fgais_model_registry
        WHERE tenant_id = ${tenantId} AND model_id = ${modelId}
        ORDER BY created_at DESC
        LIMIT 1
      `;
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function upsertDurableModel(input: {
  tenantId: string;
  modelId: string;
  version: string;
  providerId: string;
  territoryId: string;
  modalities: string[];
  capabilities: string[];
  enabled: boolean;
  productionApproved: boolean;
  status: ModelStatus;
  artifactHash: string;
  license: string;
}): Promise<DurableModelRecord> {
  const rows = await sql()`
    INSERT INTO fgais_model_registry
      (tenant_id, model_id, version, provider_id, territory_id, modalities, capabilities,
       enabled, production_approved, status, artifact_hash, license)
    VALUES
      (${input.tenantId}, ${input.modelId}, ${input.version}, ${input.providerId}, ${input.territoryId},
       ${JSON.stringify(input.modalities)}::jsonb, ${JSON.stringify(input.capabilities)}::jsonb,
       ${input.enabled}, ${input.productionApproved}, ${input.status}, ${input.artifactHash}, ${input.license})
    ON CONFLICT (tenant_id, model_id, version)
    DO UPDATE SET
      provider_id = EXCLUDED.provider_id,
      territory_id = EXCLUDED.territory_id,
      modalities = EXCLUDED.modalities,
      capabilities = EXCLUDED.capabilities,
      enabled = EXCLUDED.enabled,
      production_approved = EXCLUDED.production_approved,
      status = EXCLUDED.status,
      artifact_hash = EXCLUDED.artifact_hash,
      license = EXCLUDED.license,
      updated_at = now()
    RETURNING tenant_id, model_id, version, provider_id, territory_id, modalities, capabilities,
              enabled, production_approved, status, artifact_hash, license, created_at
  `;
  return mapRow(rows[0]);
}

export async function setDurableModelStatus(
  tenantId: string,
  modelId: string,
  version: string,
  status: ModelStatus,
): Promise<void> {
  const result = await sql()`
    UPDATE fgais_model_registry
    SET status = ${status},
        production_approved = (${status} IN ('APPROVED','DEPLOYED')),
        enabled = (${status} NOT IN ('REVOKED')),
        updated_at = now()
    WHERE tenant_id = ${tenantId} AND model_id = ${modelId} AND version = ${version}
  `;
  if (result.length === 0) throw new Error("durable_model_not_found");
}

export async function assertProductionModel(
  tenantId: string,
  modelId: string,
  version?: string,
): Promise<DurableModelRecord> {
  const model = await getDurableModel(tenantId, modelId, version);
  if (
    !model ||
    !model.enabled ||
    !model.productionApproved ||
    !["APPROVED", "DEPLOYED"].includes(model.status)
  ) {
    throw new Error("production_model_not_approved");
  }
  return model;
}

function mapRow(row: Record<string, unknown>): DurableModelRecord {
  return {
    tenantId: String(row.tenant_id),
    modelId: String(row.model_id),
    version: String(row.version),
    providerId: String(row.provider_id),
    territoryId: String(row.territory_id),
    modalities: Array.isArray(row.modalities) ? row.modalities.map(String) : [],
    capabilities: Array.isArray(row.capabilities) ? row.capabilities.map(String) : [],
    enabled: Boolean(row.enabled),
    productionApproved: Boolean(row.production_approved),
    status: row.status as ModelStatus,
    artifactHash: String(row.artifact_hash),
    license: String(row.license),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}
