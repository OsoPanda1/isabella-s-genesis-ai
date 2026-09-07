import { randomUUID } from "node:crypto";
import { isabellaSkills, IsabellaSkillId } from "./registry";
import { evaluateAuthorization, AuthorizationContext } from "../authorization";
import { createBookpiPostgresRepository } from "../repositories/bookpi-postgres-repository";
import { validateSkillInput, validateSkillOutput, StandardResponse } from "../api-contracts";

/**
 * ISA-API Hardened Pipeline (v3.0)
 * Orquestador principal que ejecuta la política inmutable de 10 etapas.
 * Todo skill debe pasar por aquí. Nunca se invoca `skill.run()` directamente.
 */
export async function runIsabellaSkill(
  skillId: IsabellaSkillId,
  input: unknown,
  context: {
    requestId?: string;
    locale?: string;
    federation?: string;
    intent?: string;
    actorId?: string;
    tenantId?: string;
    /** Rol resuelto de la identidad (requerido: sin rol no hay decisión PDP). */
    role?: string;
    /** Si la identidad está autenticada (requerido). */
    authenticated?: boolean;
    ipAddress?: string;
    userAgent?: string;
  } = {},
): Promise<StandardResponse> {
  // ==========================================================================
  // ETAPA 1 & 2: Normalización y Correlación
  // ==========================================================================
  const requestId = context.requestId || `req_${randomUUID()}`;
  const traceId = `trace_${randomUUID()}`;
  const apiVersion = "v3.0.0-hardened";
  const timestamp = new Date().toISOString();

  // ==========================================================================
  // ETAPA 3 & 4: Identidad y Resolución de Tenant (fail-closed, sin defaults)
  // ==========================================================================
  // La identidad debe venir inyectada del middleware JWT o del llamador
  // server-side autorizado. Sin identidad explícita no hay ejecución.
  const subjectId = context.actorId;
  const tenantId = context.tenantId;
  const ipAddress = context.ipAddress || "127.0.0.1";
  const userAgent = context.userAgent || "Isabella-Agent-Stack/1.0";

  let decisionId: string | null = null;

  try {
    if (!subjectId || !tenantId || !context.role || context.authenticated === undefined) {
      throw new SecurityError(
        "IDENTITY_REQUIRED",
        "Ejecución denegada: se requiere identidad explícita (actorId, tenantId, role, authenticated).",
      );
    }
    // ========================================================================
    // ETAPA 5: Validación Estricta de Esquema de Entrada (Zero Trust)
    // ========================================================================
    const validatedInput = validateSkillInput(skillId, input);

    // ========================================================================
    // ETAPA 6 & 7: Evaluación de Políticas PDP (C.R.O.W.N. / A.R.G.U.S.)
    // ========================================================================
    const authContext: AuthorizationContext = {
      tenant_id: tenantId,
      subject_id: subjectId,
      action: "skill.execute",
      resource: `skill:${skillId.toLowerCase()}`,
      role: context.role,
      authenticated: context.authenticated,
      context: {
        ip_address: ipAddress,
        user_agent: userAgent,
        timestamp: new Date(),
      },
    };

    const decision = await evaluateAuthorization(authContext);
    decisionId = decision.decision_id;

    if (!decision.allow) {
      throw new SecurityError(
        "CROWN_POLICY_DENY",
        "Acceso denegado por políticas de seguridad estructurales.",
      );
    }

    // ========================================================================
    // ETAPA 8: Operación de Dominio (Ejecutar Skill)
    // ========================================================================
    const skill = isabellaSkills[skillId];
    if (!skill) {
      throw new SecurityError("TOOL_NOT_FOUND", `Skill '${skillId}' no registrado en el sistema.`);
    }

    const skillContext: import("./contracts").SkillContext = {
      actorId: subjectId,
      federation: (context.federation || skill.federation) as import("./contracts").FederationId,
      requestId,
      locale: context.locale || "es",
      intent: context.intent || "Unknown intent",
      evidence: [],
    };

    // Risk Gate: Validar que el input cumpla las condiciones can() del skill
    if (skill.canRun && !skill.canRun(validatedInput as any, skillContext)) {
      throw new SecurityError(
        "CROWN_OBLIGATION_FAILURE",
        "El input no satisface los pre-requisitos funcionales del skill.",
      );
    }

    const skillResult = await skill.run(validatedInput as any, skillContext);

    // ========================================================================
    // ETAPA 9: Validación Estricta de Salida (Data Exfiltration Protection)
    // ========================================================================
    const validatedOutput = validateSkillOutput(skillId, skillResult);

    // ========================================================================
    // ETAPA 10: Auditoría Inmutable (BookPI Ledger)
    // ========================================================================
    const bookpiRepo = createBookpiPostgresRepository();

    // Registrar el costo computacional del skill como transacción en el Ledger
    const costUsd = skill.risk === "CRITICAL" ? 0.5 : skill.risk === "HIGH" ? 0.1 : 0.02;

    const blockRes = await bookpiRepo.append({
      tenantId: tenantId,
      userId: subjectId,
      operation: `SKILL_EXECUTION: ${skillId} | Decision: ${decisionId} | Intent: ${context.intent || "N/A"}`,
      category: "skills" as any,
      cost: costUsd,
      tokens: 0,
      status: "settled",
    });

    if (!blockRes.success) {
      // Fail closed: Si la auditoría falla, la transacción de dominio debe ser revertida/rechazada.
      throw new SecurityError(
        "AUDIT_WRITE_FAILED",
        "Fallo al registrar la evidencia en el Ledger Inmutable BookPI.",
      );
    }

    // Respuesta Estándar ISA-API
    return {
      meta: {
        request_id: requestId,
        trace_id: traceId,
        decision_id: decisionId,
        api_version: apiVersion,
        tenant_id: tenantId,
        timestamp,
      },
      data: validatedOutput,
      error: null,
    };
  } catch (err: unknown) {
    // Formatear error estándar ISA-API
    const isSecurityError = err instanceof SecurityError;
    const errorCode = isSecurityError ? err.code : "SYSTEM_INTERNAL_ERROR";
    const errorMessage =
      err instanceof Error ? err.message : "Error fatal de procesamiento cognitivo.";

    console.error(`[Pipeline Error] [${traceId}]`, err);

    return {
      meta: {
        request_id: requestId,
        trace_id: traceId,
        decision_id: decisionId,
        api_version: apiVersion,
        tenant_id: tenantId,
        timestamp,
      },
      data: null,
      error: {
        code: errorCode,
        message: errorMessage,
        correlation_id: requestId,
        retryable: !isSecurityError, // Errores de seguridad NUNCA son retryables por el cliente
      },
    };
  }
}

/**
 * Excepción interna para control de flujo de seguridad
 */
class SecurityError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "SecurityError";
  }
}
