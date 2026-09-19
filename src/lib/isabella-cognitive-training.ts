import { createHash } from "node:crypto";
import {
  createIsabellaLearningEngine,
  type IsabellaLearningEngine,
  type LearningResult,
} from "./isabella-learning";

/**
 * Cognitive training strategies that operate above the token/model layer.
 * Each strategy produces auditable learning signals and ultimately delegates
 * persistence to IsabellaLearningEngine.
 */
export type CognitiveTrainingStrategy =
  | "semantic"
  | "procedural"
  | "contrastive"
  | "counterfactual"
  | "retrieval"
  | "reflection"
  | "preference"
  | "multimodal";

export interface CognitiveTrainingSample {
  input: string;
  target?: string;
  negative?: string;
  context?: Record<string, unknown>;
  source: string;
  skillIds?: string[];
  quality?: number;
  consent?: boolean;
}

export interface CognitiveTrainingResult {
  strategy: CognitiveTrainingStrategy;
  accepted: number;
  rejected: number;
  signatures: string[];
  results: LearningResult[];
}

export interface CognitiveTrainingBatchResult {
  accepted: number;
  rejected: number;
  byStrategy: Record<CognitiveTrainingStrategy, CognitiveTrainingResult>;
}

const strategyModes: Record<
  CognitiveTrainingStrategy,
  | "supervised"
  | "contrastive"
  | "preference"
  | "episodic"
  | "procedural"
  | "reflective"
  | "multimodal"
> = {
  semantic: "supervised",
  procedural: "procedural",
  contrastive: "contrastive",
  counterfactual: "contrastive",
  retrieval: "episodic",
  reflection: "reflective",
  preference: "preference",
  multimodal: "multimodal",
};

export class IsabellaCognitiveTrainingEngine {
  constructor(private readonly learning: IsabellaLearningEngine = createIsabellaLearningEngine()) {}

  train(
    strategy: CognitiveTrainingStrategy,
    sample: CognitiveTrainingSample,
  ): CognitiveTrainingResult {
    const normalized = normalizeSample(sample);
    const expanded = expandStrategy(strategy, normalized);
    const results: LearningResult[] = [];
    const signatures: string[] = [];

    for (const item of expanded) {
      const result = this.learning.ingest({
        ...item,
        mode: strategyModes[strategy],
        source: normalized.source,
        skillIds: normalized.skillIds ?? [],
        quality: normalized.quality ?? 0.5,
        consent: normalized.consent ?? false,
      });
      results.push(result);
      if (result.accepted && result.memory) signatures.push(result.memory.signature);
    }

    return {
      strategy,
      accepted: results.filter((result) => result.accepted).length,
      rejected: results.filter((result) => !result.accepted).length,
      signatures: [...new Set(signatures)],
      results,
    };
  }

  trainBatch(
    samples: Array<{
      strategy: CognitiveTrainingStrategy;
      sample: CognitiveTrainingSample;
    }>,
  ): CognitiveTrainingBatchResult {
    const byStrategy = {} as Record<CognitiveTrainingStrategy, CognitiveTrainingResult>;
    let accepted = 0;
    let rejected = 0;

    for (const item of samples) {
      const result = this.train(item.strategy, item.sample);
      accepted += result.accepted;
      rejected += result.rejected;
      byStrategy[item.strategy] = mergeTrainingResults(byStrategy[item.strategy], result);
    }

    return { accepted, rejected, byStrategy };
  }

  evaluateUnderstanding(query: string) {
    return this.learning.evaluate(query);
  }

  retrieveRelevantKnowledge(query: string, limit = 8) {
    return this.learning.retrieve(query, limit);
  }

  snapshot() {
    return this.learning.snapshot();
  }
}

export function createIsabellaCognitiveTrainingEngine(
  learning?: IsabellaLearningEngine,
): IsabellaCognitiveTrainingEngine {
  return new IsabellaCognitiveTrainingEngine(learning);
}

function expandStrategy(strategy: CognitiveTrainingStrategy, sample: CognitiveTrainingSample) {
  switch (strategy) {
    case "counterfactual":
      return [
        {
          input: sample.input,
          target: sample.target,
          negative: sample.negative ?? "Alternative outcome to avoid.",
          context: { ...sample.context, trainingSignal: "counterfactual" },
        },
        {
          input: `What would change if the assumptions were reversed? ${sample.input}`,
          target: sample.negative ?? sample.target,
          context: { ...sample.context, trainingSignal: "assumption-reversal" },
        },
      ];
    case "retrieval":
      return [
        {
          input: sample.input,
          target: sample.target,
          context: { ...sample.context, trainingSignal: "retrieval-practice" },
        },
        {
          input: `Recall the relevant procedure or concept for: ${sample.input}`,
          target: sample.target,
          context: { ...sample.context, trainingSignal: "active-recall" },
        },
      ];
    case "reflection":
      return [
        {
          input: sample.input,
          target: sample.target,
          context: { ...sample.context, trainingSignal: "reflection" },
        },
        {
          input: `Critically review the reasoning behind: ${sample.input}`,
          target: sample.target,
          context: { ...sample.context, trainingSignal: "self-critique" },
        },
      ];
    case "semantic":
      return [
        {
          input: sample.input,
          target: sample.target,
          context: { ...sample.context, trainingSignal: "semantic-grounding" },
        },
      ];
    case "procedural":
      return [
        {
          input: sample.input,
          target: sample.target,
          context: {
            ...sample.context,
            trainingSignal: "procedure-acquisition",
          },
        },
      ];
    case "contrastive":
      return [
        {
          input: sample.input,
          target: sample.target,
          negative: sample.negative,
          context: { ...sample.context, trainingSignal: "contrastive-ranking" },
        },
      ];
    case "preference":
      return [
        {
          input: sample.input,
          target: sample.target,
          context: { ...sample.context, trainingSignal: "preference-learning" },
        },
      ];
    case "multimodal":
      return [
        {
          input: sample.input,
          target: sample.target,
          context: {
            ...sample.context,
            trainingSignal: "multimodal-grounding",
          },
        },
      ];
  }
}

function stripControlCharacters(value: string): string {
  let sanitized = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code >= 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) sanitized += character;
  }
  return sanitized;
}

function normalizeSample(sample: CognitiveTrainingSample): CognitiveTrainingSample {
  const input = stripControlCharacters(sample.input).trim();
  const target = sample.target ? stripControlCharacters(sample.target).trim() : undefined;
  const negative = sample.negative ? stripControlCharacters(sample.negative).trim() : undefined;
  if (!input) throw new Error("Cognitive training input cannot be empty");

  return {
    ...sample,
    input,
    target,
    negative,
    source: sample.source.trim().slice(0, 256),
    skillIds: [
      ...new Set((sample.skillIds ?? []).map((id) => id.trim().toLowerCase()).filter(Boolean)),
    ],
    quality: Math.min(1, Math.max(0, sample.quality ?? 0.5)),
  };
}

function mergeTrainingResults(
  existing: CognitiveTrainingResult | undefined,
  incoming: CognitiveTrainingResult,
): CognitiveTrainingResult {
  if (!existing) return incoming;
  return {
    strategy: incoming.strategy,
    accepted: existing.accepted + incoming.accepted,
    rejected: existing.rejected + incoming.rejected,
    signatures: [...new Set([...existing.signatures, ...incoming.signatures])],
    results: [...existing.results, ...incoming.results],
  };
}

export function trainingSampleSignature(
  strategy: CognitiveTrainingStrategy,
  sample: CognitiveTrainingSample,
): string {
  return createHash("sha3-512")
    .update(JSON.stringify({ strategy, sample: normalizeSample(sample) }))
    .digest("hex");
}
