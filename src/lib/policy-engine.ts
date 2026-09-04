/**
 * MOTOR DE POLÍTICA — ARGUS (src/lib/policy-engine.ts)
 * -----------------------------------------------------------------
 * Evalúa riesgo, reglas y restricciones sobre una acción (fail-closed).
 * Real, sin mockdata:
 *  - Toda acción NO explícitamente permitida por política se niega.
 *  - Combina riesgo de herramienta, frontera territorial, y umbral de
 *    aprobación humana (Human in the Loop).
 *  - Produce una decisión canónica: `allowed | requires_approval | denied`.
 *  - NUNCA decide autorización de identidad: eso pertenece a
 *    `authorization.ts`. Este motor supone que el principal ya pasó
 *    autorización y evalúa la política de ejecución externa.
 */

import type { RegisteredTool, ToolRisk } from "./tool-registry";

export type PolicyDecision = "allowed" | "requires_approval" | "denied";

export interface PolicyEvaluationRequest {
  tool: RegisteredTool;
  /** Frontera territorial activa (datos que NO pueden salir). */
  territorialBoundaryEnforced: boolean;
  /** ¿El actor es un ser humano soberano? */
  humanInTheLoop: boolean;
  /** Límite de riesgo aprobado sin escalación (default: solo low/medium). */
  approvalThreshold: ToolRisk;
  /** ¿Requiere consentimiento explícito? */
  consentRequired: boolean;
  /** ¿Consentimiento otorgado? */
  consentGranted: boolean;
}

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  reason: string;
  riskAssessed: ToolRisk;
  escalationRequired: boolean;
  territorialBoundaryViolation: boolean;
}

const RISK_ORDER: readonly ToolRisk[] = ["low", "medium", "high", "critical"];

function riskExceeds(tool: ToolRisk, threshold: ToolRisk): boolean {
  const t = RISK_ORDER.indexOf(tool);
  const th = RISK_ORDER.indexOf(threshold);
  return t > th;
}

/**
 * Evalúa una acción contra la política ARGUS y devuelve la decisión.
 * Fail-closed: cualquier condición no satisfecha lleva a denied.
 */
export function evaluatePolicy(request: PolicyEvaluationRequest): PolicyEvaluationResult {
  const { tool, territorialBoundaryEnforced } = request;

  // Deny-by-default: herramienta sin metadatos de política completos.
  if (!tool.name || !tool.risk) {
    return {
      decision: "denied",
      reason: "Herramienta sin política evaluable.",
      riskAssessed: tool.risk ?? "critical",
      escalationRequired: false,
      territorialBoundaryViolation: false,
    };
  }

  // Frontera territorial: herramientas enlazadas al territorio no pueden salir.
  if (territorialBoundaryEnforced && tool.territorialBoundary) {
    return {
      decision: "denied",
      reason: `Frontera territorial violada: la herramienta '${tool.name}' no puede ejecutarse en este contexto.`,
      riskAssessed: tool.risk,
      escalationRequired: false,
      territorialBoundaryViolation: true,
    };
  }

  // Consentimiento requerido no otorgado => denegado (nunca aprobación delegada).
  if (request.consentRequired && !request.consentGranted) {
    return {
      decision: "denied",
      reason: "Consentimiento requerido no otorgado.",
      riskAssessed: tool.risk,
      escalationRequired: false,
      territorialBoundaryViolation: false,
    };
  }

  // Riesgo por encima del umbral => requiere aprobación humana.
  if (riskExceeds(tool.risk, request.approvalThreshold)) {
    if (!request.humanInTheLoop) {
      return {
        decision: "denied",
        reason: `Riesgo ${tool.risk} excede el umbral sin humano en el bucle para aprobar.`,
        riskAssessed: tool.risk,
        escalationRequired: false,
        territorialBoundaryViolation: false,
      };
    }
    return {
      decision: "requires_approval",
      reason: `Riesgo ${tool.risk} excede el umbral. Requiere aprobación humana.`,
      riskAssessed: tool.risk,
      escalationRequired: true,
      territorialBoundaryViolation: false,
    };
  }

  return {
    decision: "allowed",
    reason: `Acción '${tool.name}' permitida bajo política (riesgo ${tool.risk}).`,
    riskAssessed: tool.risk,
    escalationRequired: false,
    territorialBoundaryViolation: false,
  };
}

export const POLICY_ENGINE = {
  evaluate: evaluatePolicy,
};