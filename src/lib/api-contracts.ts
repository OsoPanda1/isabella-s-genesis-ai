import { z } from "zod";

/**
 * ISA-API Contract Authority (v3.0 Hardened)
 * Única fuente de verdad ejecutable para validación de contratos API.
 */

// ============================================================================
// 1. ESQUEMAS BASE DE LA ARQUITECTURA ISA-API
// ============================================================================

export const MetaSchema = z.object({
  request_id: z.string().uuid().describe("UUID único de la petición (correlación)"),
  trace_id: z.string().describe("UUID de traza distribuida"),
  decision_id: z.string().nullable().optional().describe("ID de decisión de autorización (PDP)"),
  api_version: z.string().describe("Versión de la API (semver)"),
  tenant_id: z.string().optional().describe("Tenant resuelto"),
  timestamp: z.string().datetime().describe("Timestamp ISO 8601 en UTC"),
});

export const ErrorPayloadSchema = z.object({
  code: z.string().describe("Código de error estandarizado (ej. CROWN_POLICY_DENY)"),
  message: z.string().describe("Mensaje seguro para cliente (sin filtrar secretos)"),
  correlation_id: z.string().describe("ID de correlación (request_id)"),
  retryable: z.boolean().describe("Indicador de reintento seguro"),
  details: z.record(z.string(), z.unknown()).optional().describe("Detalles adicionales no sensibles"),
});

export const StandardResponseSchema = z.object({
  meta: MetaSchema,
  data: z.unknown().nullable(),
  error: ErrorPayloadSchema.nullable(),
});

// ============================================================================
// 2. ESQUEMAS DE ENTRADA PARA SKILLS (Validación Estricta)
// ============================================================================

export const AtlasInputSchema = z.object({
  scenario: z.string().min(5).max(1000),
  variables: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      currentValue: z.number(),
      projectedChange: z.number(),
      weight: z.number().min(0).max(1),
    })
  ).min(1).max(50),
});

export const AnubisInputSchema = z.object({
  artifactId: z.string().min(3).max(128),
  content: z.string().min(1).max(500000), // Max 500KB per chunk
  expectedHash: z.string().max(128).optional(),
});

export const ThemisInputSchema = z.object({
  decisionId: z.string().min(1).max(128),
  decision: z.string().min(1).max(2000),
  evidence: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      excerpt: z.string(),
      score: z.number().min(0).max(1),
    })
  ).max(100),
  events: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const VigiaInputSchema = z.object({
  text: z.string().min(1).max(100000),
  riskSignals: z.array(z.string()).optional(),
});

// Fallback genérico para skills que aún no tienen un esquema Zod estricto definido
export const GenericSkillInputSchema = z.record(z.string(), z.unknown()).refine(
  (data) => Object.keys(data).length > 0,
  { message: "El payload de entrada no puede estar vacío." }
);

// ============================================================================
// 3. FUNCIONES DE VALIDACIÓN RUNTIME
// ============================================================================

export type StandardResponse = z.infer<typeof StandardResponseSchema>;
export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;

/**
 * Valida el payload de entrada contra el esquema específico del Skill.
 * Aplica Zero Trust: rechaza entradas malformadas inmediatamente.
 */
export function validateSkillInput(skillId: string, payload: unknown): unknown {
  try {
    switch (skillId.toUpperCase()) {
      case "ATLAS":
        return AtlasInputSchema.parse(payload);
      case "ANUBIS":
        return AnubisInputSchema.parse(payload);
      case "THEMIS":
        return ThemisInputSchema.parse(payload);
      case "VIGIA":
        return VigiaInputSchema.parse(payload);
      default:
        // Fallback seguro pero validando que sea un objeto estructurado
        return GenericSkillInputSchema.parse(payload);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Validation failed for skill ${skillId}: ${error.errors.map(e => e.message).join(", ")}`);
    }
    throw error;
  }
}

/**
 * Valida que la salida del Skill cumpla con los estándares de seguridad (no exfiltración básica).
 * En un pipeline productivo real, aquí se aplica PII Redaction.
 */
export function validateSkillOutput(skillId: string, output: unknown): unknown {
  // Verificación básica de estructura (no puede ser null si es un resultado exitoso de skill)
  if (!output || typeof output !== "object") {
    throw new Error(`Skill ${skillId} devolvió una salida escalar o nula, violando el contrato.`);
  }
  
  // Aquí se podrían agregar validaciones Zod específicas de salida.
  // Por ahora, aplicamos validación de sanitización.
  const jsonString = JSON.stringify(output);
  
  // Basic Regex checks for obvious secret leaks (P0 Protection)
  if (/(sk_live_|pk_live_|sk_test_|pk_test_|AIza[0-9A-Za-z-_]{35})/.test(jsonString)) {
    throw new Error(`[CRITICAL] Data Exfiltration Blocked: La salida del skill ${skillId} contiene posibles claves de API o secretos.`);
  }

  return output;
}
