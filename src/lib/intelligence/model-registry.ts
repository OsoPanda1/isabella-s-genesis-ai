import { createHash } from "node:crypto";
import type { IntelligenceProvider, Modality } from "./contracts";

export type ModelStatus = "PROPOSED" | "EVALUATED" | "APPROVED" | "DEPLOYED" | "REVOKED";
export interface ModelIdentity {
  modelId: string;
  version: string;
  provider: string;
  family: string;
  task: string;
  artifactHash: string;
  license: string;
  status: ModelStatus;
  createdAt: string;
}
export interface ModelDescriptor {
  modelId: string;
  providerId: string;
  modalities: Modality[];
  enabled: boolean;
  productionApproved: boolean;
  maxContextTokens?: number;
  dataResidency?: string;
  capabilities: string[];
}

const runtimeRegistry = new Map<string, ModelDescriptor>();

function copyDescriptor(model: ModelDescriptor): ModelDescriptor {
  return {
    ...model,
    modalities: [...model.modalities],
    capabilities: [...model.capabilities],
  };
}

export function registerModel(model: ModelDescriptor): void {
  if (!/^[a-zA-Z0-9._:/-]{2,160}$/.test(model.modelId)) throw new Error("Invalid modelId");
  runtimeRegistry.set(model.modelId, Object.freeze(copyDescriptor(model)));
}
export function getModel(modelId: string): ModelDescriptor | undefined {
  const model = runtimeRegistry.get(modelId);
  return model ? copyDescriptor(model) : undefined;
}
export function listModels(): ModelDescriptor[] {
  return [...runtimeRegistry.values()].map(copyDescriptor);
}
export function registerProvider(provider: IntelligenceProvider): void {
  registerModel({
    modelId: provider.modelId,
    providerId: provider.providerId,
    modalities: [...provider.capabilities],
    enabled: true,
    productionApproved: false,
    capabilities: [...provider.capabilities],
  });
}
export function approveModel(modelId: string): void {
  const model = runtimeRegistry.get(modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  runtimeRegistry.set(modelId, Object.freeze({ ...model, productionApproved: true }));
}
export function disableModel(modelId: string): void {
  const model = runtimeRegistry.get(modelId);
  if (!model) return;
  runtimeRegistry.set(modelId, Object.freeze({ ...model, enabled: false }));
}

export class ModelRegistry {
  private readonly models = new Map<string, ModelIdentity>();
  register(
    input: Omit<ModelIdentity, "artifactHash" | "status" | "createdAt"> & {
      artifact: unknown;
    },
  ): ModelIdentity {
    const key = `${input.modelId}@${input.version}`;
    if (this.models.has(key)) throw new Error(`Modelo ya registrado: ${key}`);
    const model: ModelIdentity = {
      modelId: input.modelId,
      version: input.version,
      provider: input.provider,
      family: input.family,
      task: input.task,
      artifactHash: `sha3-512:${createHash("sha3-512").update(stableSerialize(input.artifact)).digest("hex")}`,
      license: input.license,
      status: "PROPOSED",
      createdAt: new Date().toISOString(),
    };
    this.models.set(key, model);
    return { ...model };
  }
  setStatus(modelId: string, version: string, status: ModelStatus): ModelIdentity {
    const key = `${modelId}@${version}`;
    const current = this.models.get(key);
    if (!current) throw new Error(`Modelo no encontrado: ${key}`);
    const updated = { ...current, status };
    this.models.set(key, updated);
    return { ...updated };
  }
  get(modelId: string, version: string): ModelIdentity | undefined {
    const model = this.models.get(`${modelId}@${version}`);
    return model ? { ...model } : undefined;
  }
  list(): ModelIdentity[] {
    return [...this.models.values()].map((model) => ({ ...model }));
  }
}
function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableSerialize((value as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}
