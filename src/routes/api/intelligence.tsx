import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withSovereignAuth } from "@/lib/principal-context";
import { SecuritySystem } from "@/lib/security";
import { initializeIntelligencePlane, invokeIntelligence, listModels } from "@/lib/intelligence";

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z
    .string()
    .min(1)
    .max(12000)
    .refine(
      (value) =>
        [...value].every((character) => {
          const code = character.codePointAt(0) ?? 0;
          return code >= 0x20 && code !== 0x7f;
        }),
      "control characters are not allowed",
    ),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(40),
  temperature: z.number().finite().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(32768).optional(),
  preferredModel: z
    .string()
    .max(160)
    .regex(/^[a-zA-Z0-9._:/-]+$/)
    .optional(),
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: SecuritySystem.injectSecureHeaders(
      new Headers({ "content-type": "application/json; charset=utf-8" }),
    ),
  });
}

function requestContentBytes(messages: Array<{ content: string }>): number {
  return new TextEncoder().encode(messages.map((message) => message.content).join("\n")).byteLength;
}

export const Route = createFileRoute("/api/intelligence")({
  server: {
    handlers: {
      GET: withSovereignAuth("system", "read", async () => {
        initializeIntelligencePlane();
        return json({ models: listModels() });
      }),
      POST: withSovereignAuth("system", "execute", async (context, request) => {
        initializeIntelligencePlane();
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_json", traceId: context.traceId }, 400);
        }

        const parsed = requestSchema.safeParse(body);
        if (!parsed.success) {
          return json({ error: "invalid_request", traceId: context.traceId }, 400);
        }

        if (requestContentBytes(parsed.data.messages) > 131072) {
          return json({ error: "request_too_large", traceId: context.traceId }, 413);
        }

        try {
          const result = await invokeIntelligence({
            tenantId: context.tenantId,
            actorId: context.userId,
            ...parsed.data,
          });
          return json(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : "inference_unavailable";
          return json(
            {
              error: message.startsWith("inference_")
                ? message.split(":")[0]
                : "inference_unavailable",
              traceId: context.traceId,
            },
            503,
          );
        }
      }),
    },
  },
});
