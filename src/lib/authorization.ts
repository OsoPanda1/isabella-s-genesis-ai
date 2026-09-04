/**
 * AUTORIZACIÓN — PUNTO ÚNICO DE DECISIÓN (src/lib/authorization.ts)
 * -----------------------------------------------------------------
 * Orquesta la evaluación de autorización completa en un solo lugar,
 * combinando (en orden, fail-closed):
 *   1. Tenant guard: la frontera de tenant debe ser válida.
 *   2. Permission matrix (~recurso, acción) → permiso concreto.
 *   3. RBAC: la identidad debe poseer el permiso (rol + herencia).
 *   4. ABAC: las políticas de atributos deben permitir.
 *
 * Ningún handler de ruta decide autorización por sí mismo: invoca
 * `authorize(...)`. El resultado es estructurado y auditable.
 */

import { type Resource, type Action, permissionFor } from "./permission-matrix";
import { type PrincipalIdentity, identityHasPermission } from "./rbac";
import { type AttributeContext, evaluateAbac, type AbacEvaluation } from "./abac";
import { type TenantGuardResult } from "./tenant-guard";

export type AuthorizationDecision = "allowed" | "denied";

export interface AuthorizationRequest {
  identity: PrincipalIdentity;
  /** Identidad (no autenticada) o contexto de confianza. */
  resource: Resource;
  action: Action;
  /** Tenant al que pertenece el recurso (para aislamiento). */
  resourceTenant?: string;
  /** Propietario del recurso (identidad). */
  resourceOwner?: string;
  /** Nivel de riesgo contextual (0..1, default 0). */
  risk?: number;
  /** Zona horaria del request. */
  timezone?: string;
  /** Resultado previo del tenant guard (opcional). */
  tenant: TenantGuardResult;
}

export interface AuthorizationResult {
  decision: AuthorizationDecision;
  resource: Resource;
  action: Action;
  permission: string | null;
  reasons: string[];
}

function fail(resource: Resource, action: Action, reasons: string[]): AuthorizationResult {
  return { decision: "denied", resource, action, permission: null, reasons };
}

/**
 * Evalúa una solicitud de autorización. Nunca lanza por permisos:
 * resuelve `denied` de forma segura.
 */
export function authorize(request: AuthorizationRequest): AuthorizationResult {
  const { identity, resource, action, tenant } = request;
  const reasons: string[] = [];

  // 1. Frontera de tenant.
  if (!tenant.boundaryOk) {
    return fail(resource, action, [tenant.reason, "Rechazado por frontera de tenant."]);
  }

  // 2. Matriz de permisos.
  const derived = permissionFor(resource, action);
  if (!derived.permission) {
    return fail(resource, action, [derived.reason, "No existe permiso para la operación."]);
  }

  // 3. RBAC.
  if (!identityHasPermission(identity, derived.permission)) {
    return fail(resource, action, [
      `El rol '${identity.role}' no posee el permiso '${derived.permission}'.`,
      "Rechazado por RBAC (fail-closed).",
    ]);
  }
  reasons.push(`Rol '${identity.role}' habilitado para '${derived.permission}'.`);

  // 4. ABAC.
  const context: AttributeContext = {
    role: identity.role,
    subjectTenant: identity.tenantId,
    resource,
    action,
    resourceTenant: request.resourceTenant ?? identity.tenantId,
    resourceOwner: request.resourceOwner ?? "",
    subject: identity.subject,
    risk: request.risk ?? 0,
    authenticated: identity.authenticated,
    timezone: request.timezone ?? "UTC",
  };
  const abac: AbacEvaluation = evaluateAbac(context);
  if (abac.decision === "deny") {
    return fail(resource, action, [abac.reason, "Rechazado por política ABAC."]);
  }

  return {
    decision: "allowed",
    resource,
    action,
    permission: derived.permission,
    reasons: [...reasons, derived.reason],
  };
}

/**
 * Conveniencia para handlers: lanza un `AuthorizationError` si la
 * decisión es denegada. Devuelve el permiso concedido.
 */
export function requirePermission(request: AuthorizationRequest): string {
  const result = authorize(request);
  if (result.decision === "denied") {
    throw new AuthorizationError(result.resource, result.action, result.reasons);
  }
  return result.permission ?? "";
}

export class AuthorizationError extends Error {
  readonly code = "AUTHORIZATION_DENIED";
  readonly status = 403;
  readonly resource: Resource;
  readonly action: Action;
  readonly detail: readonly string[];

  constructor(resource: Resource, action: Action, detail: readonly string[]) {
    super(`Denegado: ${action} sobre ${resource}.`);
    this.name = "AuthorizationError";
    this.resource = resource;
    this.action = action;
    this.detail = detail;
  }
}

export const AUTHORIZATION = {
  authorize,
  requirePermission,
  AuthorizationError,
};
