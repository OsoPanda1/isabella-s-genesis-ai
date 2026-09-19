import { createHash } from "node:crypto";

export type ModelState =
  "DRAFT" | "TRAINING" | "EVALUATION" | "APPROVED" | "PRODUCTION" | "DEPRECATED" | "ARCHIVED";

export interface EvaluationBenchmark {
  benchmarkId: string;
  modelId: string;
  version: string;
  passed: boolean;
  accuracy: number;
  f1Score: number;
  biasScore: number;
  latencyMs: number;
  approvedBy: string;
  evaluatedAt: string;
}

export interface ModelEntry {
  modelId: string;
  version: string;
  state: ModelState;
  baseModel: string;
  description: string;
  benchmarks: EvaluationBenchmark[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Legacy process-local evaluation cache.
 *
 * IMPORTANT: this is intentionally NOT a production authority. Durable model
 * approval lives in src/lib/intelligence/durable-model-registry.ts and is
 * enforced by production-model-gate.ts. Keeping this cache separate prevents
 * a process restart or a second instance from silently changing authority.
 */
export class EvaluationRegistry {
  private static readonly models: Map<string, ModelEntry> = new Map();

  public static registerModel(entry: ModelEntry): void {
    const key = `${entry.modelId}@${entry.version}`;
    this.models.set(key, structuredClone(entry));
  }

  public static getModel(modelId: string, version: string): ModelEntry | undefined {
    const model = this.models.get(`${modelId}@${version}`);
    return model ? structuredClone(model) : undefined;
  }

  public static addBenchmark(
    modelId: string,
    version: string,
    benchmark: EvaluationBenchmark,
  ): void {
    const key = `${modelId}@${version}`;
    const model = this.models.get(key);
    if (!model) throw new Error("Model not found in evaluation cache");
    model.benchmarks.push(structuredClone(benchmark));
    model.updatedAt = new Date().toISOString();
  }

  /**
   * Deliberately disabled. Production promotion must be performed through the
   * durable, tenant-scoped governance registry and an authorized approval.
   */
  public static transitionToProduction(): never {
    throw new Error(
      "production_authority_is_durable_only: use assertModelRuntimeAuthority and the durable governance registry",
    );
  }

  public static benchmarkDigest(modelId: string, version: string): string {
    const model = this.models.get(`${modelId}@${version}`);
    if (!model) throw new Error("Model not found in evaluation cache");
    return createHash("sha256").update(JSON.stringify(model.benchmarks)).digest("hex");
  }
}
