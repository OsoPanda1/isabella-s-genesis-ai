/**
 * ABAC — CONTROL DE ACCESO BASADO EN ATRIBUTOS (src/lib/abac.ts)
 * -----------------------------------------------------------------
 * Políticas evaluadas sobre atributos del sujeto, del recurso, de la
 * acción y del contexto. Complementa al RBAC (`rbac.ts`): mientras el
 * RBAC decide "qué puede hacer un rol", el ABAC matiza "en qué
 * condiciones" (tenant, territorialidad, riesgo, momento, oficina).
 *
 * Toda política evalúa a uno de tres estados: `allow`, `deny` o
 * `notApplied` (la política no aplica a este request). El evaluador
 * combina políticas con semántica deny-overrides: si alguna política
 * aplicable deniega, el resultado es deny (fail-closed).
 */

import type { Role } from "./rbac";

/** Contexto de atributos disponible para la evaluación. */
export interface AttributeContext {
  /** Rol resuelto de la identidad. */
  role: Role;
  /** Tenant del actor. */
  subjectTenant: string;
  /** Recurso objetivo. */
  resource: string;
  /** Acción solicitada. */
  action: string;
  /** Tenant al que pertenece el recurso (para aislamiento territorial). */
  resourceTenant: string;
  /** Propietario del recurso (identidad); vacío si no aplica. */
  resourceOwner: string;
  /** Identidad del actor. */
  subject: string;
  /** Nivel de riesgo contextual del request (0..1). */
  risk: number;
  /** Es un request autenticado. */
  authenticated: boolean;
  /** Zona horaria / oficina del request (p. ej. "America/Mexico_City"). */
  timezone: string;
}

export type AbacDecision = "allow" | "deny" | "notApplied";

export interface AbacEvaluation {
  decision: AbacDecision;
  policy: string | null;
  reason: string;
}

/** Firma de una política ABAC evaluable. */
export interface AbacPolicy {
  name: string;
  evaluate: (context: AttributeContext) => AbacDecision;
}

/**
 * Política de aislamiento territorial. Un recurso con tenant propio no
 * debe ser accesible por identidades de otro tenant, salvo roles con
 * alcance global explícito.
 */
function territorialPolicy(context: AttributeContext): AbacDecision {
  if (!context.resourceTenant) return "notApplied";
  if (context.subjectTenant === context.resourceTenant) return "notApplied";
  if (context.role === "SovereignOwner" || context.role === "Auditor") return "notApplied";
  return "deny";
}

/**
 * Política de data residency / personas. El recurso `data:personal` de
 * un propietario distinto nunca es accesible sin autorización global.
 */
function personalDataPolicy(context: AttributeContext): AbacDecision {
  if (!context.resource.startsWith("data:personal")) return "notApplied";
  if (context.resourceOwner && context.resourceOwner !== context.subject) {
    if (context.role === "SovereignOwner" || context.role === "governance_admin") {
      return "notApplied";
    }
    return "deny";
  }
  return "notApplied";
}

/**
 * Política de riesgo alto: cualquier acción sobre recursos sensibles
 * con riesgo elevado es denegada por defecto (fail-closed).
 */
function highRiskPolicy(context: AttributeContext): AbacDecision {
  if (!context.authenticated) return "deny";
  if (context.risk >= 0.9) return "deny";
  return "notApplied";
}

/** Políticas de fábrica, evaluadas en orden. La primera en decidir manda. */
export const DEFAULT_ABAC_POLICIES: readonly AbacPolicy[] = [
  { name: "risk:deny-high", evaluate: highRiskPolicy },
  { name: "residency:personal-data", evaluate: personalDataPolicy },
  { name: "isolation:territorial", evaluate: territorialPolicy },
];

/**
 * Evalúa las políticas ABAC sobre un contexto. Deny-overrides:
 * si alguna política aplicable deniega, el resultado final es deny.
 */
export function evaluateAbac(
  context: AttributeContext,
  policies: readonly AbacPolicy[] = DEFAULT_ABAC_POLICIES,
): AbacEvaluation {
  for (const policy of policies) {
    const decision = policy.evaluate(context);
    if (decision === "deny") {
      return {
        decision: "deny",
        policy: policy.name,
        reason: `ABAC denegó por política '${policy.name}'.`,
      };
    }
  }
  return { decision: "allow", policy: null, reason: "Ninguna política ABAC lo deniega." };
}

export const ABAC = {
  policies: DEFAULT_ABAC_POLICIES,
  evaluate: evaluateAbac,
};
