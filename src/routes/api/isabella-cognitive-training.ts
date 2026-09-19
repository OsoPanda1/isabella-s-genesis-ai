import { createFileRoute } from "@tanstack/react-router";
import { withSovereignAuth } from "@/lib/principal-context";
import { SecuritySystem } from "@/lib/security";
import {
  createIsabellaCognitiveTrainingEngine,
  type CognitiveTrainingSample,
  type CognitiveTrainingStrategy,
} from "@/lib/isabella-cognitive-training";
import { loadLearningRuntime, persistLearningRuntime } from "@/lib/isabella-learning-persistence";
import { config } from "@/lib/config";
import { assertBoundedJsonValue, readJsonBody, RequestLimitError } from "@/lib/request-limits";

const STRATEGIES = new Set<CognitiveTrainingStrategy>([
  "semantic",
  "procedural",
  "contrastive",
  "counterfactual",
  "retrieval",
  "reflection",
  "preference",
  "multimodal",
]);

const MAX_TEXT_LENGTH = 100_000;
const MAX_SOURCE_LENGTH = 256;
const MAX_SKILL_IDS = 32;
const MAX_SKILL_ID_LENGTH = 80;
const MAX_CONTEXT_KEYS = 64;
const MAX_BATCH_ITEMS = 128;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: SecuritySystem.injectSecureHeaders(
      new Headers({
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      }),
    ),
  });
}

function parseSample(value: unknown): CognitiveTrainingSample | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const sample = value as Record<string, unknown>;
  if (
    typeof sample.input !== "string" ||
    sample.input.length === 0 ||
    sample.input.length > MAX_TEXT_LENGTH ||
    typeof sample.source !== "string" ||
    sample.source.length === 0 ||
    sample.source.length > MAX_SOURCE_LENGTH
  )
    return null;
  if (typeof sample.target === "string" && sample.target.length > MAX_TEXT_LENGTH) return null;
  if (typeof sample.negative === "string" && sample.negative.length > MAX_TEXT_LENGTH) return null;
  if (sample.context !== undefined) {
    if (
      !sample.context ||
      typeof sample.context !== "object" ||
      Array.isArray(sample.context) ||
      Object.keys(sample.context).length > MAX_CONTEXT_KEYS
    )
      return null;
    try {
      assertBoundedJsonValue(sample.context, {
        maxDepth: 6,
        maxObjectKeys: MAX_CONTEXT_KEYS,
        maxArrayItems: 32,
      });
    } catch {
      return null;
    }
  }
  if (sample.skillIds !== undefined) {
    if (
      !Array.isArray(sample.skillIds) ||
      sample.skillIds.length > MAX_SKILL_IDS ||
      sample.skillIds.some(
        (id) => typeof id !== "string" || id.length === 0 || id.length > MAX_SKILL_ID_LENGTH,
      )
    )
      return null;
  }
  if (
    sample.quality !== undefined &&
    (typeof sample.quality !== "number" || !Number.isFinite(sample.quality))
  )
    return null;
  return {
    input: sample.input,
    target: typeof sample.target === "string" ? sample.target : undefined,
    negative: typeof sample.negative === "string" ? sample.negative : undefined,
    context:
      sample.context && typeof sample.context === "object"
        ? (sample.context as Record<string, unknown>)
        : undefined,
    source: sample.source,
    skillIds: Array.isArray(sample.skillIds)
      ? sample.skillIds.filter((id): id is string => typeof id === "string")
      : [],
    quality: typeof sample.quality === "number" ? sample.quality : 0.5,
    consent: sample.consent === true,
  };
}

async function enforceTrainingQuota(tenantId: string, ip: string) {
  const limit = Math.max(1, Math.min(config().RATE_LIMIT_INFERENCE_PER_MINUTE, 120));
  const [tenantLimit, clientLimit] = await Promise.all([
    SecuritySystem.checkRateLimitDistributed(`training-tenant:${tenantId}`, limit),
    SecuritySystem.checkRateLimitDistributed(`training-client:${ip}`, limit),
  ]);
  if (tenantLimit.degraded || clientLimit.degraded)
    return json({ error: "RATE_LIMIT_INFRASTRUCTURE_UNAVAILABLE" }, 503);
  if (!tenantLimit.allowed || !clientLimit.allowed) return json({ error: "RATE_LIMITED" }, 429);
  return null;
}

export const Route = createFileRoute("/api/isabella-cognitive-training")({
  server: {
    handlers: {
      POST: withSovereignAuth("system", "execute", async (context, request) => {
        const quotaResponse = await enforceTrainingQuota(context.tenantId, context.ip);
        if (quotaResponse) return quotaResponse;

        let body: unknown;
        try {
          body = await readJsonBody(request, config().INPUT_MAX_BODY_BYTES);
          assertBoundedJsonValue(body, {
            maxDepth: 8,
            maxObjectKeys: 128,
            maxArrayItems: MAX_BATCH_ITEMS,
          });
        } catch (error) {
          if (error instanceof RequestLimitError) return json({ error: error.code }, 413);
          return json({ error: "INVALID_JSON" }, 400);
        }
        if (!body || typeof body !== "object" || Array.isArray(body))
          return json({ error: "VALIDATION_ERROR" }, 400);
        const payload = body as Record<string, unknown>;
        const action = payload.action ?? "train";
        const runtime = await loadLearningRuntime(context.tenantId).catch(
          () => ({ error: "LEARNING_RUNTIME_UNAVAILABLE" }) as const,
        );
        if ("error" in runtime) return json({ error: runtime.error }, 503);
        const engine = createIsabellaCognitiveTrainingEngine(runtime.engine);

        if (action === "train") {
          const strategy = payload.strategy;
          if (
            typeof strategy !== "string" ||
            !STRATEGIES.has(strategy as CognitiveTrainingStrategy)
          ) {
            return json({ error: "INVALID_STRATEGY", allowed: [...STRATEGIES] }, 400);
          }
          const sample = parseSample(payload.sample);
          if (!sample) return json({ error: "INVALID_SAMPLE", required: ["input", "source"] }, 400);
          const result = engine.train(strategy as CognitiveTrainingStrategy, sample);
          if (runtime.durable && result.accepted > 0)
            await persistLearningRuntime(context.tenantId, runtime.engine);
          return json(result);
        }

        if (action === "train-batch") {
          if (!Array.isArray(payload.samples) || payload.samples.length > MAX_BATCH_ITEMS) {
            return json({ error: "INVALID_BATCH", maxItems: MAX_BATCH_ITEMS }, 400);
          }
          const samples = [] as Array<{
            strategy: CognitiveTrainingStrategy;
            sample: CognitiveTrainingSample;
          }>;
          for (const item of payload.samples) {
            if (!item || typeof item !== "object" || Array.isArray(item))
              return json({ error: "INVALID_BATCH_ITEM" }, 400);
            const row = item as Record<string, unknown>;
            const strategy = row.strategy;
            const sample = parseSample(row.sample);
            if (
              typeof strategy !== "string" ||
              !STRATEGIES.has(strategy as CognitiveTrainingStrategy) ||
              !sample
            ) {
              return json({ error: "INVALID_BATCH_ITEM" }, 400);
            }
            samples.push({ strategy: strategy as CognitiveTrainingStrategy, sample });
          }
          const result = engine.trainBatch(samples);
          if (runtime.durable && result.accepted > 0)
            await persistLearningRuntime(context.tenantId, runtime.engine);
          return json(result);
        }

        if (action === "evaluate") {
          if (
            typeof payload.query !== "string" ||
            !payload.query.trim() ||
            payload.query.length > MAX_TEXT_LENGTH
          )
            return json({ error: "QUERY_INVALID" }, 400);
          return json(engine.evaluateUnderstanding(payload.query));
        }

        if (action === "retrieve") {
          if (
            typeof payload.query !== "string" ||
            !payload.query.trim() ||
            payload.query.length > MAX_TEXT_LENGTH
          )
            return json({ error: "QUERY_INVALID" }, 400);
          const limit =
            typeof payload.limit === "number"
              ? Math.max(1, Math.min(50, Math.trunc(payload.limit)))
              : 8;
          return json({ items: engine.retrieveRelevantKnowledge(payload.query, limit) });
        }

        if (action === "snapshot") return json(engine.snapshot());
        return json(
          {
            error: "UNKNOWN_ACTION",
            allowed: ["train", "train-batch", "evaluate", "retrieve", "snapshot"],
          },
          400,
        );
      }),
    },
  },
});
