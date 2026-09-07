/**
 * MOTOR DE MEMORIA (src/lib/memory-engine.ts)
 * -----------------------------------------------------------------
 * Orquesta la recuperación de memoria jerárquica con control de acceso
 * real (fail-closed):
 *  - Verifica la frontera de tenant antes de cualquier lectura.
 *  - Comprueba el scope requerido contra el actor.
 *  - Aplica sensibilidad: datos personales/restringidos solo para el
 *    propietario (o roles de alcance global explícito).
 *  - Retención mínima: purga registros caducados.
 *
 * La decisión de autorización NUNCA se delega al cliente; este motor es
 * la autoridad de memoria real (no mockdata). La persistencia/integridad
 * la delega al `MemoryRepository` inyectado.
 */

import {
  createMemoryRepository,
  type MemoryRepository,
  type MemoryRecord,
  type MemoryScope,
} from "./repositories/memory-repository";

export type MemoryActorRole = "SovereignOwner" | "Operator" | "Auditor" | "Guest" | "System";

export interface MemoryAccessRequest {
  tenantId: string;
  actorId: string;
  role: MemoryActorRole;
  scope: MemoryScope;
  authenticated: boolean;
  /** Scopes concedidos al actor (desde identidad). */
  grantedScopes: readonly MemoryScope[];
}

export interface MemoryDecision {
  allowed: boolean;
  reason: string;
}

/** Comprueba si el actor posee el scope requerido (mínimo privilegio). */
export function canAccessScope(request: MemoryAccessRequest): MemoryDecision {
  if (!request.authenticated) {
    return { allowed: false, reason: "Actor no autenticado: memoria denegada." };
  }
  if (!request.grantedScopes.includes(request.scope)) {
    return { allowed: false, reason: `Falta el scope de memoria '${request.scope}'.` };
  }
  return { allowed: true, reason: `Scope '${request.scope}' concedido.` };
}

/** Comprueba si el actor puede leer un registro según sensibilidad y tenant. */
export function canReadRecord(request: MemoryAccessRequest, record: MemoryRecord): MemoryDecision {
  if (record.tenantId !== request.tenantId) {
    return { allowed: false, reason: "Frontera de tenant violada al leer memoria." };
  }

  if (record.sensitivity === "personal" || record.sensitivity === "restricted") {
    const isOwner = record.ownerId === request.actorId;
    if (record.sensitivity === "restricted") {
      if (request.role === "SovereignOwner")
        return { allowed: true, reason: "Propietario soberano." };
      if (request.role === "Auditor") return { allowed: true, reason: "Auditoría autorizada." };
      return isOwner
        ? { allowed: true, reason: "Propietario del registro restringido." }
        : { allowed: false, reason: "Registro restringido ajeno." };
    }
    // personal
    if (!isOwner) {
      if (request.role === "SovereignOwner" || request.role === "Auditor") {
        return { allowed: true, reason: "Acceso autorizado por rol de alto nivel." };
      }
      return { allowed: false, reason: "Dato personal ajeno." };
    }
  }
  return { allowed: true, reason: "Acceso a memoria permitido." };
}

/**
 * Crea un motor de memoria con un repositorio inyectable (para test/aislamiento).
 */
export function createMemoryEngine(repository: MemoryRepository = createMemoryRepository()) {
  return {
    /** Recupera memoria de un scope, aplicando autorización real por registro. */
    retrieve(request: MemoryAccessRequest): { records: MemoryRecord[]; denied: number } {
      const scopeDecision = canAccessScope(request);
      if (!scopeDecision.allowed) {
        return { records: [], denied: 0 };
      }
      const candidates = repository.list(request.tenantId, request.scope);
      const allowed: MemoryRecord[] = [];
      let denied = 0;
      for (const record of candidates) {
        const access = canReadRecord(request, record);
        if (access.allowed) allowed.push(record);
        else denied++;
      }
      return { records: allowed, denied };
    },

    /** Purga registros caducados (retención mínima necesaria). */
    pruneExpired(): { removed: number } {
      return repository.prune();
    },

    /** Verifica la integridad de la cadena de memoria. */
    verifyIntegrity(): { success: boolean; error?: string; corruptedId?: string } {
      return repository.verifyIntegrity();
    },
  };
}

export type MemoryEngine = ReturnType<typeof createMemoryEngine>;

export const MEMORY_ENGINE = {
  create: createMemoryEngine,
  canAccessScope,
  canReadRecord,
};
