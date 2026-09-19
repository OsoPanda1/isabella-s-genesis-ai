import { createFileRoute } from "@tanstack/react-router";
import { withSovereignAuth } from "@/lib/principal-context";
import { SecuritySystem } from "@/lib/security";
import { runIsabellaSkill } from "@/lib/skills/run-skill";
import { listIsabellaSkills, type IsabellaSkillId } from "@/lib/skills/registry";
import { parseSkillInput } from "@/lib/skills/input-schemas";
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

async function enforceSkillQuota(tenantId: string, ip: string) {
  const limit = Math.max(1, Math.min(config().RATE_LIMIT_DEFAULT_PER_MINUTE, 120));
  const [tenantLimit, clientLimit] = await Promise.all([
    SecuritySystem.checkRateLimitDistributed(`skill-tenant:${tenantId}`, limit),
    SecuritySystem.checkRateLimitDistributed(`skill-client:${ip}`, limit),
  ]);
  if (tenantLimit.degraded || clientLimit.degraded)
    return json({ error: "RATE_LIMIT_INFRASTRUCTURE_UNAVAILABLE" }, 503);
  if (!tenantLimit.allowed || !clientLimit.allowed) return json({ error: "RATE_LIMITED" }, 429);
  return null;
}

export const Route = createFileRoute("/api/isabella-skills")({
  server: {
    handlers: {
      GET: withSovereignAuth("system", "read", async () => json({ skills: listIsabellaSkills() })),

      POST: withSovereignAuth("system", "execute", async (context, request) => {
        const quotaResponse = await enforceSkillQuota(context.tenantId, context.ip);
        if (quotaResponse) return quotaResponse;

        let body: unknown;
        try {
          body = await readJsonBody(request, config().INPUT_MAX_BODY_BYTES);
        } catch (error) {
          if (error instanceof RequestLimitError) return json({ error: error.code }, 413);
          return json({ error: "INVALID_JSON" }, 400);
        }
        if (!body || typeof body !== "object" || Array.isArray(body))
          return json({ error: "VALIDATION_ERROR" }, 400);
        const payload = body as Record<string, unknown>;
        const skillId = typeof payload.skillId === "string" ? payload.skillId : "";
        const known = listIsabellaSkills().some((skill) => skill.id === skillId);
        if (!known) return json({ error: "SKILL_NOT_FOUND", skills: listIsabellaSkills() }, 404);

        const parsedInput = parseSkillInput(skillId as IsabellaSkillId, payload.input);
        if (!parsedInput.success)
          return json({ error: "INVALID_SKILL_INPUT", issues: parsedInput.error.issues }, 400);

        const result = await runIsabellaSkill(skillId as IsabellaSkillId, parsedInput.data, {
          requestId: context.correlationId,
          actorId: context.userId,
          tenantId: context.tenantId,
          role: context.role,
          authenticated: context.role !== "Guest",
          ipAddress: context.ip,
          intent:
            typeof payload.intent === "string"
              ? payload.intent.slice(0, 2_000)
              : "API skill execution",
          locale: typeof payload.locale === "string" ? payload.locale.slice(0, 32) : "es-MX",
        });
        const status = result.error ? (result.error.code === "CROWN_POLICY_DENY" ? 403 : 422) : 200;
        return json(result, status);
      }),
    },
  },
});
