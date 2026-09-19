import { z } from "zod";
import { SecuritySystem } from "@/lib/security";
import { standardError, IsabellaChatErrorCode } from "@/lib/api-contracts";
import { parseSafeJsonBody } from "@/lib/input-limits";
import { runNativeComprehension } from "@/lib/native-comprehension";

const NativeComprehensionRequestSchema = z.object({
  input: z.string().trim().min(1).max(8000),
  locale: z.enum(["es", "es-MX", "es-419", "auto"]).default("auto"),
  responseMode: z.enum(["concise", "balanced", "deep"]).default("balanced"),
});

function normalizeSpanishInput(input: string): string {
  return input
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type NativeGatewayContext = {
  ip: string;
  traceId: string;
  correlationId: string;
  tenantId: string;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: SecuritySystem.injectSecureHeaders(
      new Headers({
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-isabella-native": "ncua",
        "x-isabella-api-version": "3.2.0",
      }),
    ),
  });
}

export async function handleNativeComprehension(
  context: NativeGatewayContext,
  request: Request,
): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await parseSafeJsonBody(request);
  } catch {
    return standardError(
      IsabellaChatErrorCode.INVALID_JSON,
      "El cuerpo de la petición no contiene JSON válido.",
      context.correlationId,
      context.traceId,
      { status: 400, tenantId: context.tenantId },
    );
  }
  const validation = NativeComprehensionRequestSchema.safeParse(rawBody);
  if (!validation.success) {
    return standardError(
      IsabellaChatErrorCode.VALIDATION_ERROR,
      "La petición no cumple el contrato de comprensión nativa.",
      context.correlationId,
      context.traceId,
      { status: 400, tenantId: context.tenantId },
    );
  }
  const normalizedInput = normalizeSpanishInput(validation.data.input);
  const output = runNativeComprehension({
    input: normalizedInput,
    tenantId: context.tenantId,
    traceId: context.traceId,
  });
  return json({
    ok: output.ok,
    id: output.id,
    inferenceMode: output.inferenceMode,
    intent: output.intent,
    federations: output.federations,
    attention: output.attention,
    knowledge: output.knowledge,
    memory: output.memory,
    riskDetected: output.riskDetected,
    latencyMs: output.latencyMs,
    chainHash: output.chainHash,
    locale: validation.data.locale,
    responseMode: validation.data.responseMode,
  });
}
