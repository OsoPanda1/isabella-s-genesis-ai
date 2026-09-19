import { z } from "zod";
import { createIsabellaLearningEngine, type IsabellaLearningEngine } from "./isabella-learning";

export const LearningIngestApiSchema = z.object({
  mode: z.enum([
    "supervised",
    "contrastive",
    "preference",
    "episodic",
    "procedural",
    "reflective",
    "multimodal",
  ]),
  input: z.string().min(1).max(100_000),
  target: z.string().max(100_000).optional(),
  negative: z.string().max(100_000).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  outcome: z.enum(["success", "partial", "failure", "unknown"]).default("unknown"),
  quality: z.number().min(0).max(1).default(0.5),
  consent: z.boolean().default(false),
  source: z.string().min(1).max(256),
  skillIds: z.array(z.string().min(1).max(80)).max(32).default([]),
});

export const LearningQueryApiSchema = z.object({
  query: z.string().min(1).max(20_000),
  limit: z.number().int().min(1).max(50).default(8),
});

export const LearningEvaluateApiSchema = z.object({
  query: z.string().min(1).max(20_000),
});

export interface NativeLearningApi {
  ingest(payload: unknown): Response;
  retrieve(payload: unknown): Response;
  evaluate(payload: unknown): Response;
  snapshot(): Response;
}

export function createNativeLearningApi(
  engine: IsabellaLearningEngine = createIsabellaLearningEngine(),
): NativeLearningApi {
  return {
    ingest(payload) {
      const result = engine.ingest(payload);
      return json(result, result.accepted ? 200 : 422);
    },
    retrieve(payload) {
      const parsed = LearningQueryApiSchema.safeParse(payload);
      if (!parsed.success)
        return json({ error: "VALIDATION_ERROR", issues: parsed.error.issues }, 400);
      return json({ items: engine.retrieve(parsed.data.query, parsed.data.limit) }, 200);
    },
    evaluate(payload) {
      const parsed = LearningEvaluateApiSchema.safeParse(payload);
      if (!parsed.success)
        return json({ error: "VALIDATION_ERROR", issues: parsed.error.issues }, 400);
      return json(engine.evaluate(parsed.data.query), 200);
    },
    snapshot() {
      return json(engine.snapshot(), 200);
    },
  };
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
