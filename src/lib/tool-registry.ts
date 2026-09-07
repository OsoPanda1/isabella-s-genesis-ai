/**
 * REGISTRO DE HERRAMIENTAS — WHITELIST ZERO TRUST (src/lib/tool-registry.ts)
 * -----------------------------------------------------------------
 * Catálogo canónico de herramientas autorizadas. Real, sin mockdata:
 *  - Cada herramienta declara propósito, entrada, salida, riesgo,
 *    permisos, tiempo máximo, reintentos y evento de auditoría (§9).
 *  - Ninguna herramienta puede ejecutarse si no está registrada aquí
 *    (deny-by-default / fail-closed).
 *  - El registro NO decide autoridad: la política (`policy-engine`) y
 *    la autorización (`authorization.ts`) deciden; este registro solo
 *    define la whitelist y sus metadatos operativos.
 */

export type ToolRisk = "low" | "medium" | "high" | "critical";
export type ToolCategory =
  "memory" | "ledger" | "compute" | "storage" | "network" | "identity" | "system" | "creativity";

export interface RegisteredTool {
  name: string;
  purpose: string;
  inputSchemaDescription: string;
  outputDescription: string;
  risk: ToolRisk;
  requiredPermissions: readonly string[];
  maxTimeMs: number;
  maxRetries: number;
  auditEvent: string;
  category: ToolCategory;
  /** Si true, la ejecución requiere aprobación humana previa. */
  requiresApproval: boolean;
  /** Si true, nunca debe enviarse a ningún tercero. */
  territorialBoundary: boolean;
}

export interface ToolExecutionDecision {
  allowed: boolean;
  reason: string;
}

export const TOOL_REGISTRY_SEED: readonly RegisteredTool[] = [
  {
    name: "memory.retrieve",
    purpose: "Recuperar contexto de memoria dentro del scope y tenant autorizados.",
    inputSchemaDescription: "tenantId, actorId, scope, sensitivity",
    outputDescription: "Registros de memoria filtrados por autorización.",
    risk: "medium",
    requiredPermissions: ["memory:read"],
    maxTimeMs: 2000,
    maxRetries: 0,
    auditEvent: "tool.memory.retrieve",
    category: "memory",
    requiresApproval: false,
    territorialBoundary: false,
  },
  {
    name: "memory.record",
    purpose: "Persistir una pieza de memoria con consentimiento y procedencia.",
    inputSchemaDescription: "content, scope, sensitivity, purpose, consent",
    outputDescription: "Registro de memoria persistido con hash de integridad.",
    risk: "medium",
    requiredPermissions: ["memory:write"],
    maxTimeMs: 2000,
    maxRetries: 0,
    auditEvent: "tool.memory.record",
    category: "memory",
    requiresApproval: false,
    territorialBoundary: false,
  },
  {
    name: "ledger.record",
    purpose: "Registrar un asiento inmutable en el libro mayor BookPI.",
    inputSchemaDescription: "tenantId, userId, operation, category, cost, tokens",
    outputDescription: "Bloque BookPI encadenado criptográficamente.",
    risk: "high",
    requiredPermissions: ["ledger:write"],
    maxTimeMs: 1500,
    maxRetries: 0,
    auditEvent: "tool.ledger.record",
    category: "ledger",
    requiresApproval: false,
    territorialBoundary: false,
  },
  {
    name: "compute.sandbox",
    purpose: "Ejecutar tarea aislada en contenedor/WASM bajo sandbox soberano.",
    inputSchemaDescription: "command, envVars, inputPayload (solo fuentes autorizadas)",
    outputDescription: "Resultado de ejecución aislada con verificación.",
    risk: "critical",
    requiredPermissions: ["compute:execute"],
    maxTimeMs: 2500,
    maxRetries: 0,
    auditEvent: "tool.compute.sandbox",
    category: "compute",
    requiresApproval: true,
    territorialBoundary: true,
  },
  {
    name: "storage.read",
    purpose: "Leer datos de repositorio autorizado dentro de la frontera de tenant.",
    inputSchemaDescription: "tenantId, path, scope",
    outputDescription: "Contenido leído tras verificación de policy.",
    risk: "medium",
    requiredPermissions: ["storage:read"],
    maxTimeMs: 2000,
    maxRetries: 1,
    auditEvent: "tool.storage.read",
    category: "storage",
    requiresApproval: false,
    territorialBoundary: false,
  },
  {
    name: "identity.resolve",
    purpose: "Resolver identidad/roles/scopes de un principal en el servidor.",
    inputSchemaDescription: "token/session, tenantId",
    outputDescription: "Perfil de identidad autoritativo.",
    risk: "high",
    requiredPermissions: ["identity:read"],
    maxTimeMs: 1500,
    maxRetries: 0,
    auditEvent: "tool.identity.resolve",
    category: "identity",
    requiresApproval: false,
    territorialBoundary: false,
  },
];

/**
 * Crea el registro de herramientas. La lista puede inyectarse (para test),
 * pero el comportamiento default es deny-by-default: toda herramienta no
 * registrada se considera NO autorizada.
 */
export function createToolRegistry(seed: readonly RegisteredTool[] = TOOL_REGISTRY_SEED) {
  const byName = new Map<string, RegisteredTool>();
  for (const tool of seed)
    byName.set(tool.name, { ...tool, requiredPermissions: [...tool.requiredPermissions] });

  return {
    /** Verifica si una herramienta está en la whitelist y qué riesgo tiene. */
    check(name: string): ToolExecutionDecision {
      const tool = byName.get(name);
      if (!tool) {
        return {
          allowed: false,
          reason: `Herramienta '${name}' no está en la whitelist Zero Trust.`,
        };
      }
      return { allowed: true, reason: `Herramienta '${name}' registrada con riesgo ${tool.risk}.` };
    },

    /** Obtiene los metadatos completos de una herramienta, si existe. */
    lookup(name: string): RegisteredTool | null {
      const tool = byName.get(name);
      return tool ? { ...tool, requiredPermissions: [...tool.requiredPermissions] } : null;
    },

    list(): RegisteredTool[] {
      return seed.map((t) => ({ ...t, requiredPermissions: [...t.requiredPermissions] }));
    },
  };
}

export type ToolRegistry = ReturnType<typeof createToolRegistry>;
export const TOOL_REGISTRY = {
  create: createToolRegistry,
};
