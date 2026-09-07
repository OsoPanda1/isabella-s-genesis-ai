/**
 * TENANT GUARD (src/lib/tenant-guard.ts)
 * -----------------------------------------------------------------
 * Guardia de aislamiento de tenant. Garantiza en el borde de cada
 * handler que:
 *   1. El contexto del request es consistente (subject/tenant).
 *   2. Ningún request puede cruzar la frontera de tenant.
 *   3. Los requests no autenticados obtienen contexto `guest`/`anon`
 *      de privilegio mínimo.
 *
 * Este guard ES el límite de confianza: managen los payloads y
 * cabeceras antes de alcanzar cualquier lógica de dominio.
 */

import {
  type TenantContext,
  ANONYMOUS_TENANT_CONTEXT,
  assertTenantBoundary,
  guestTenantContext,
} from "./tenant-context";

/** Contexto de entrada de un request antes de resolver límite de confianza. */
export interface TenantGuardInput {
  authenticated: boolean;
  subject?: string;
  username?: string;
  tenantId?: string;
  /** Origen de confianza declarado por el middleware de auth. */
  resolvedBy?: TenantContext["resolvedBy"];
  /** Tenant solicitado por el cliente (cabecera x-tenant-id). */
  requestedTenantId?: string;
}

export interface TenantGuardResult {
  context: TenantContext;
  boundaryOk: boolean;
  reason: string;
}

/**
 * Resuelve el `TenantContext` definitivo a partir de un request.
 * Nunca lanza: en caso de conflicto de frontera devuelve contexto
 * de menor privilegio y `boundaryOk = false` para que el handler
 * rechace con 403/401.
 */
export function resolveTenantContext(input: TenantGuardInput): TenantGuardResult {
  if (!input.authenticated) {
    const subject = input.subject || "anon";
    return {
      context: guestTenantContext(subject),
      boundaryOk: true,
      reason: "Request no autenticado: contexto de huésped de privilegio mínimo.",
    };
  }

  // P1: tenantId DEBE provenir exclusivamente de la identidad canónica.
  // Nunca usar requestedTenantId como fallback si la identidad carece de tenant.
  const canonicalTenantId = input.tenantId || "system";

  const context: TenantContext = {
    subject: input.subject || "unknown",
    username: input.username || input.subject || "unknown",
    tenantId: canonicalTenantId,
    resolvedBy: input.resolvedBy ?? "bearer",
    authenticated: true,
    resolvedAt: new Date().toISOString(),
  };

  if (input.requestedTenantId !== undefined) {
    if (input.requestedTenantId !== canonicalTenantId) {
      return {
        context: ANONYMOUS_TENANT_CONTEXT,
        boundaryOk: false,
        reason: `Violación de frontera de tenant: requestedTenantId (${input.requestedTenantId}) difiere del tenant canónico (${canonicalTenantId}).`,
      };
    }
    const boundary = assertTenantBoundary(context, input.requestedTenantId);
    if (!boundary.allowed) {
      return {
        context: ANONYMOUS_TENANT_CONTEXT,
        boundaryOk: false,
        reason: boundary.reason,
      };
    }
  }

  return { context, boundaryOk: true, reason: "Frontera de tenant confirmada." };
}

/**
 * Rechaza explícitamente con un error de autorización si la frontera
 * no es válida. Conveniente para handlers.
 */
export class TenantBoundaryError extends Error {
  readonly code = "TENANT_BOUNDARY_VIOLATION";
  readonly status = 403;
  constructor(reason: string) {
    super(reason);
    this.name = "TenantBoundaryError";
  }
}

/** Lanza `TenantBoundaryError` si la frontera no es válida. */
export function guardTenantBoundary(result: TenantGuardResult): TenantContext {
  if (!result.boundaryOk) {
    throw new TenantBoundaryError(result.reason);
  }
  return result.context;
}

export const TENANT_GUARD = {
  resolve: resolveTenantContext,
  boundary: TenantBoundaryError,
  guard: guardTenantBoundary,
};
