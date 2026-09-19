import { createFileRoute } from "@tanstack/react-router";
import { withSovereignAuth } from "@/lib/principal-context";
import { SecuritySystem } from "@/lib/security";
import {
  createNativeLearningApi,
  LearningEvaluateApiSchema,
  LearningIngestApiSchema,
  LearningQueryApiSchema,
} from "@/lib/isabella-learning-api";
import { loadLearningRuntime, persistLearningRuntime } from "@/lib/isabella-learning-persistence";
import { config } from "@/lib/config";
import { readJsonBody, RequestLimitError } from "@/lib/request-limits";

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

async function enforceLearningQuota(tenantId: string, ip: string) {
  const limit = Math.max(1, Math.min(config().RATE_LIMIT_DEFAULT_PER_MINUTE, 120));
  const [tenantLimit, clientLimit] = await Promise.all([
    SecuritySystem.checkRateLimitDistributed(`learning-tenant:${tenantId}`, limit),
    SecuritySystem.checkRateLimitDistributed(`learning-client:${ip}`, limit),
  ]);
  if (tenantLimit.degraded || clientLimit.degraded) {
    return json({ error: "RATE_LIMIT_INFRASTRUCTURE_UNAVAILABLE" }, 503);
  }
  if (!tenantLimit.allowed || !clientLimit.allowed) return json({ error: "RATE_LIMITED" }, 429);
  return null;
}

async function runtimeFor(tenantId: string, correlationId: string) {
  try {
    return await loadLearningRuntime(tenantId);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[isabella-learning] runtime unavailable", {
      correlationId,
      tenantId,
      error: detail,
    });
    return { error: "LEARNING_RUNTIME_UNAVAILABLE" } as const;
  }
}

export const Route = createFileRoute("/api/isabella-learning")({
  server: {
    handlers: {
      GET: withSovereignAuth("system", "read", async (context, request) => {
        const quotaResponse = await enforceLearningQuota(context.tenantId, context.ip);
        if (quotaResponse) return quotaResponse;
        const runtime = await runtimeFor(context.tenantId, context.correlationId);
        if ("error" in runtime) return json({ error: runtime.error }, 503);
        const url = new URL(request.url);
        const action = url.searchParams.get("action") ?? "snapshot";
        const api = createNativeLearningApi(runtime.engine);

        if (action === "snapshot") return api.snapshot();
        if (action === "retrieve") {
          const parsed = LearningQueryApiSchema.safeParse({
            query: url.searchParams.get("query") ?? "",
            limit: Number(url.searchParams.get("limit") ?? 8),
          });
          if (!parsed.success)
            return json({ error: "VALIDATION_ERROR", issues: parsed.error.issues }, 400);
          return api.retrieve(parsed.data);
        }
        if (action === "evaluate") {
          const parsed = LearningEvaluateApiSchema.safeParse({
            query: url.searchParams.get("query") ?? "",
          });
          if (!parsed.success)
            return json({ error: "VALIDATION_ERROR", issues: parsed.error.issues }, 400);
          return api.evaluate(parsed.data);
        }
        return json(
          {
            error: "UNKNOWN_ACTION",
            allowed: ["snapshot", "retrieve", "evaluate"],
          },
          400,
        );
      }),

      POST: withSovereignAuth("system", "execute", async (context, request) => {
        const quotaResponse = await enforceLearningQuota(context.tenantId, context.ip);
        if (quotaResponse) return quotaResponse;
        let body: unknown;
        try {
          body = await readJsonBody(request, config().INPUT_MAX_BODY_BYTES);
        } catch (error) {
          if (error instanceof RequestLimitError) return json({ error: error.code }, 413);
          return json({ error: "INVALID_JSON" }, 400);
        }

        const runtime = await runtimeFor(context.tenantId, context.correlationId);
        if ("error" in runtime) return json({ error: runtime.error }, 503);
        const action =
          typeof body === "object" && body !== null && "action" in body
            ? (body as { action?: unknown }).action
            : "ingest";
        const payload =
          typeof body === "object" && body !== null && "payload" in body
            ? (body as { payload?: unknown }).payload
            : body;
        const api = createNativeLearningApi(runtime.engine);

        if (action === "ingest") {
          const parsed = LearningIngestApiSchema.safeParse(payload);
          if (!parsed.success)
            return json({ error: "VALIDATION_ERROR", issues: parsed.error.issues }, 400);
          const response = api.ingest(parsed.data);
          if (response.ok && runtime.durable)
            await persistLearningRuntime(context.tenantId, runtime.engine);
          return response;
        }
        if (action === "retrieve") {
          const parsed = LearningQueryApiSchema.safeParse(payload);
          if (!parsed.success)
            return json({ error: "VALIDATION_ERROR", issues: parsed.error.issues }, 400);
          return api.retrieve(parsed.data);
        }
        if (action === "evaluate") {
          const parsed = LearningEvaluateApiSchema.safeParse(payload);
          if (!parsed.success)
            return json({ error: "VALIDATION_ERROR", issues: parsed.error.issues }, 400);
          return api.evaluate(parsed.data);
        }
        if (action === "snapshot") return api.snapshot();
        return json(
          {
            error: "UNKNOWN_ACTION",
            allowed: ["ingest", "retrieve", "evaluate", "snapshot"],
          },
          400,
        );
      }),
    },
  },
});
