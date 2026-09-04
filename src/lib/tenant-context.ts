/**
 * CONTEXTO DE TENANT (src/lib/tenant-context.ts)
 * -----------------------------------------------------------------
 * Aislamiento multi-tenant determinista. Un `TenantContext` identifica
 * de forma inequívoca al actor y a su tenant en el stack de request.
 *
 * Toda operación sobre datos debe ejecutarse en el `TenantContext`
 * resuelto por el `tenant-guard` — nunca se aceptan identificadores de
 * tenant desde el payload sin validación de límite de confianza.
 */

export interface TenantContext {
  /** Identificador canónico del actor (sub). */
  subject: string;
  /** Nombre estable del actor (sin secretos). */
  username: string;
  /** Tenant autenticado del actor. */
  tenantId: string;
  /** Devuelto/confirmado por un orígen de confianza, no por el cliente. */
  resolvedBy: "bearer" | "cookie" | "system" | "api_key" | "unauthenticated";
  /** Presente si el actor está autenticado. */
  authenticated: boolean;
  /** Momento UTC de resolución. */
  resolvedAt: string;
}

/** Identidad anónima para requests no autenticados. */
export const ANONYMOUS_TENANT_CONTEXT: TenantContext = {
  subject: "anon",
  username: "anon",
  tenantId: "system",
  resolvedBy: "unauthenticated",
  authenticated: false,
  resolvedAt: new Date(0).toISOString(),
};

/**
 * Verifica que el contexto coincide con el tenant solicitado a través
 * de cabeceras de límite de confianza. `x-tenant-id` de un request solo
 * es admisible si coincide con el tenant ya autenticado del actor.
 */
export function assertTenantBoundary(
  authenticated: TenantContext,
  requestedTenantId: string | undefined,
): { allowed: boolean; reason: string } {
  if (!authenticated.authenticated || !requestedTenantId) {
    return { allowed: true, reason: "Sin tenant explícito: no hay frontera que validar." };
  }
  if (authenticated.tenantId === requestedTenantId) {
    return { allowed: true, reason: "Tenant coincide con identidad autenticada." };
  }
  return {
    allowed: false,
    reason: `Frontera violada: identidad en '${authenticated.tenantId}' no puede operar sobre '${requestedTenantId}'.`,
  };
}

/** Crea un contexto estable para request no autenticado con tenant genérico. */
export function guestTenantContext(subject: string): TenantContext {
  return {
    subject,
    username: subject,
    tenantId: "system",
    resolvedBy: "unauthenticated",
    authenticated: false,
    resolvedAt: new Date().toISOString(),
  };
}

export const TENANT_CONTEXT = {
  anon: ANONYMOUS_TENANT_CONTEXT,
  assertBoundary: assertTenantBoundary,
  guest: guestTenantContext,
};
