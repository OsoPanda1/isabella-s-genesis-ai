import { isProductionLike, resolveRuntimeMode } from "@/lib/runtime-mode";
import { config } from "@/lib/config";
import {
  getDurableModel,
  upsertDurableModel,
  type DurableModelRecord,
} from "./durable-model-registry";
import type { IntelligenceProvider } from "./contracts";

/** Runtime authority for model selection. Registration in process memory is never production approval. */

function isRuntimeApproved(model: DurableModelRecord): boolean {
  return (
    model.enabled && model.productionApproved && ["APPROVED", "DEPLOYED"].includes(model.status)
  );
}

/**
 * Single read/write for both registration and authority. Reusing the fetched
 * record avoids the previous 3 chained SELECTs per candidate per request.
 */
async function loadOrRegisterModel(
  tenantId: string,
  provider: IntelligenceProvider,
): Promise<DurableModelRecord> {
  const existing = await getDurableModel(tenantId, provider.modelId, provider.modelId);
  if (existing) return existing;
  return upsertDurableModel({
    tenantId,
    modelId: provider.modelId,
    version: provider.modelId,
    providerId: provider.providerId,
    territoryId: "global",
    modalities: [...provider.capabilities],
    capabilities: [...provider.capabilities],
    enabled: true,
    productionApproved: false,
    status: "PROPOSED",
    artifactHash: `provider:${provider.providerId}:${provider.modelId}`,
    license: "provider-managed",
  });
}

export async function ensureModelRecord(
  tenantId: string,
  provider: IntelligenceProvider,
): Promise<void> {
  await loadOrRegisterModel(tenantId, provider);
}

/**
 * Registers (if needed) and authorizes a model in production with a single
 * durable read. Non-production runtimes only register, never authorize.
 */
export async function authorizeModelForRuntime(
  tenantId: string,
  provider: IntelligenceProvider,
): Promise<void> {
  const record = await loadOrRegisterModel(tenantId, provider);
  const production = isProductionLike(resolveRuntimeMode(config().ISABELLA_RUNTIME_MODE));
  if (!production) return;
  if (!isRuntimeApproved(record)) throw new Error("production_model_not_approved");
}

export async function assertModelRuntimeAuthority(
  tenantId: string,
  provider: IntelligenceProvider,
): Promise<void> {
  const production = isProductionLike(resolveRuntimeMode(config().ISABELLA_RUNTIME_MODE));
  if (!production) return;
  const model = await getDurableModel(tenantId, provider.modelId, provider.modelId);
  if (!model) throw new Error("inference_unavailable: model-not-registered");
  if (!isRuntimeApproved(model)) throw new Error("production_model_not_approved");
}
