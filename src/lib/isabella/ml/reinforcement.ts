import { createHash } from "node:crypto";
import { EvaluationRegistry } from "../models/registry";

export interface MLTrainingSample {
  inputData: string;
  expectedOutput: string;
  actualOutput?: string;
  loss?: number;
  biasPenalty?: number;
  latencyMs?: number;
}

function normalize(text: string): string[] {
  return text.normalize("NFKC").toLowerCase().trim().split(/\s+/u).filter(Boolean);
}

function tokenF1(expected: string, actual: string): number {
  const expectedTokens = normalize(expected);
  const actualTokens = normalize(actual);
  if (expectedTokens.length === 0 && actualTokens.length === 0) return 1;
  if (expectedTokens.length === 0 || actualTokens.length === 0) return 0;

  const expectedCounts = new Map<string, number>();
  for (const token of expectedTokens)
    expectedCounts.set(token, (expectedCounts.get(token) ?? 0) + 1);
  let overlap = 0;
  const actualCounts = new Map<string, number>();
  for (const token of actualTokens) actualCounts.set(token, (actualCounts.get(token) ?? 0) + 1);
  for (const [token, count] of actualCounts)
    overlap += Math.min(count, expectedCounts.get(token) ?? 0);

  const precision = overlap / actualTokens.length;
  const recall = overlap / expectedTokens.length;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

/**
 * Deterministic evaluation only. This class never fabricates model output,
 * latency, approval, or bias measurements. It is an evaluation harness, not
 * a training engine and cannot grant production authority by itself.
 */
export class AdvancedReinforcementEngine {
  public static async evaluateSample(sample: MLTrainingSample): Promise<number> {
    if (typeof sample.actualOutput !== "string") {
      throw new Error("evaluation_requires_actual_model_output");
    }
    const f1 = tokenF1(sample.expectedOutput, sample.actualOutput);
    const exactMatch =
      normalize(sample.expectedOutput).join(" ") === normalize(sample.actualOutput).join(" ");
    const baseLoss = exactMatch ? 0 : 1 - f1;
    const biasPenalty = Math.max(0, sample.biasPenalty ?? 0);
    return Math.min(1, Math.max(0, baseLoss + biasPenalty));
  }

  public static async executeReinforcementCycle(
    modelId: string,
    version: string,
    samples: MLTrainingSample[],
  ): Promise<void> {
    if (samples.length === 0) throw new Error("evaluation_requires_non_empty_dataset");

    let totalLoss = 0;
    let totalF1 = 0;
    let maxBias = 0;
    let measuredLatencyTotal = 0;
    let measuredLatencySamples = 0;

    for (const sample of samples) {
      const loss = await this.evaluateSample(sample);
      totalLoss += loss;
      if (typeof sample.actualOutput !== "string")
        throw new Error("evaluation_requires_actual_model_output");
      totalF1 += tokenF1(sample.expectedOutput, sample.actualOutput);
      maxBias = Math.max(maxBias, Math.max(0, sample.biasPenalty ?? 0));
      if (
        typeof sample.latencyMs === "number" &&
        Number.isFinite(sample.latencyMs) &&
        sample.latencyMs >= 0
      ) {
        measuredLatencyTotal += sample.latencyMs;
        measuredLatencySamples += 1;
      }
    }

    const avgLoss = totalLoss / samples.length;
    const accuracy = Math.max(0, 1 - avgLoss);
    const f1Score = totalF1 / samples.length;
    const latencyMs =
      measuredLatencySamples > 0 ? measuredLatencyTotal / measuredLatencySamples : 0;
    const datasetDigest = createHash("sha256").update(JSON.stringify(samples)).digest("hex");
    const benchmarkId = createHash("sha256")
      .update(`${modelId}@${version}:${datasetDigest}`)
      .digest("hex")
      .slice(0, 16);

    EvaluationRegistry.addBenchmark(modelId, version, {
      benchmarkId,
      modelId,
      version,
      passed: accuracy >= 0.85 && f1Score >= 0.85 && maxBias < 0.1,
      accuracy,
      f1Score,
      biasScore: maxBias,
      latencyMs,
      // Evaluation evidence is not human approval. Keeping this empty makes
      // the production gate fail closed until an authorized human approves it.
      approvedBy: "",
      evaluatedAt: new Date().toISOString(),
    });
  }
}
