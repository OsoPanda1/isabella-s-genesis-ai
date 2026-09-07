import { AsyncLocalStorage } from "node:async_hooks";

// ============================================================================
// IDENTITY CONTEXT (src/lib/identity-context.ts)
// ----------------------------------------------------------------------------
// Contexto de identidad autenticada por request con AsyncLocalStorage: expone
// la identidad del principal (userId, role, tenantId, scope) a lo largo del
// ciclo de vida de la request, sin tener que pasar el token por la firma de
// cada método.
//
// Es la base de la persistencia tenant-scoped (P0-13): los adaptadores leen la
// identidad actual para construir un cliente con RLS en lugar de usar
// service_role. Si no hay identidad, la operación debe fallar de forma segura
// (fail-closed) salvo que sea explícitamente de solo-diagnóstico.
// ============================================================================

export interface RequestIdentity {
  userId: string;
  role: string;
  tenantId: string;
  scope: string;
}

let als: AsyncLocalStorage<RequestIdentity | undefined> | null = null;

function storage(): AsyncLocalStorage<RequestIdentity | undefined> {
  if (!als) als = new AsyncLocalStorage<RequestIdentity | undefined>();
  return als;
}

/** Devuelve la identidad autenticada del request actual (o `undefined`). */
export function getRequestIdentity(): RequestIdentity | undefined {
  return storage().getStore();
}

/** Envuelve la ejecución dentro del contexto de identidad dado. */
export function runWithIdentity<T>(identity: RequestIdentity, fn: () => T): T {
  return storage().run(identity, fn);
}

/** Alias de concurrencia: devuelve la identidad actual del request. */
export function currentIdentity(): RequestIdentity | undefined {
  return getRequestIdentity();
}
