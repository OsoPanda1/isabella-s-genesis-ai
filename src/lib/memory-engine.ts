/**
 * MOTOR DE MEMORIA (src/lib/memory-engine.ts)
 * -----------------------------------------------------------------
 * Autoridad de memoria con selección explícita del adaptador por entorno.
 *
 * Producción/staging => PostgreSQL durable.
 * Desarrollo/test => repositorio JSON inyectable permitido.
 *
 * El motor mantiene la autorización por tenant, scope y sensibilidad en la
 * capa de dominio; la persistencia solo almacena/recupera el estado autorizado.
 */

import {
  createMemoryRepository,
  type MemoryRepository,
  type MemoryRecord,
  type MemoryScope,
} from "./repositories/memory-repository";
import { createMemoryPostgresRepository } from "./repositories/memory-postgres-repository";
import { config } from "./config";
import { isProductionLike, resolveRuntimeMode } from "./runtime-mode";

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

export interface MemoryRepositoryAsync {
  add: MemoryRepository["add"];
  list: (tenantId: string, scope?: MemoryScope) => MemoryRecord[] | Promise<MemoryRecord[]>;
  prune: (now?: number) => { removed: number } | Promise<{ removed: number }>;
  verifyIntegrity: () =>
    | { success: boolean; error?: string; corruptedId?: string }
    | Promise<{ success: boolean; error?: string; corruptedId?: string }>;
}

function createRuntimeMemoryRepository(): MemoryRepositoryAsync {
  const runtime = resolveRuntimeMode(config().ISABELLA_RUNTIME_MODE);
  if (isProductionLike(runtime)) return createMemoryPostgresRepository();
  return createMemoryRepository();
}

/** Comprueba si el actor posee el scope requerido (mínimo privilegio). */
export function canAccessScope(request: MemoryAccessRequest): MemoryDecision {
  if (!request.authenticated) {
    return {
      allowed: false,
      reason: "Actor no autenticado: memoria denegada.",
    };
  }
  if (!request.grantedScopes.includes(request.scope)) {
    return {
      allowed: false,
      reason: `Falta el scope de memoria '${request.scope}'.`,
    };
  }
  return { allowed: true, reason: `Scope '${request.scope}' concedido.` };
}

/** Comprueba si el actor puede leer un registro según sensibilidad y tenant. */
export function canReadRecord(request: MemoryAccessRequest, record: MemoryRecord): MemoryDecision {
  if (record.tenantId !== request.tenantId) {
    return {
      allowed: false,
      reason: "Frontera de tenant violada al leer memoria.",
    };
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
    if (!isOwner) {
      if (request.role === "SovereignOwner" || request.role === "Auditor") {
        return {
          allowed: true,
          reason: "Acceso autorizado por rol de alto nivel.",
        };
      }
      return { allowed: false, reason: "Dato personal ajeno." };
    }
  }
  return { allowed: true, reason: "Acceso a memoria permitido." };
}

/**
 * Crea un motor de memoria. En producción/staging, el repositorio por defecto
 * es PostgreSQL. En test/dev se conserva el adaptador JSON para fixtures aislados.
 */
export function createMemoryEngine(repository?: MemoryRepositoryAsync) {
  const activeRepository = repository ?? createRuntimeMemoryRepository();

  return {
    retrieve(
      request: MemoryAccessRequest,
    ):
      | { records: MemoryRecord[]; denied: number }
      | Promise<{ records: MemoryRecord[]; denied: number }> {
      const scopeDecision = canAccessScope(request);
      if (!scopeDecision.allowed) return { records: [], denied: 0 };

      const resolve = (candidates: MemoryRecord[]) => {
        const allowed: MemoryRecord[] = [];
        let denied = 0;
        for (const record of candidates) {
          const access = canReadRecord(request, record);
          if (access.allowed) allowed.push(record);
          else denied++;
        }
        return { records: allowed, denied };
      };

      const candidates = activeRepository.list(request.tenantId, request.scope);
      return candidates instanceof Promise ? candidates.then(resolve) : resolve(candidates);
    },

    pruneExpired(): { removed: number } | Promise<{ removed: number }> {
      return activeRepository.prune();
    },

    verifyIntegrity():
      | { success: boolean; error?: string; corruptedId?: string }
      | Promise<{ success: boolean; error?: string; corruptedId?: string }> {
      return activeRepository.verifyIntegrity();
    },
  };
}

export type MemoryEngine = ReturnType<typeof createMemoryEngine>;

export const MEMORY_ENGINE = {
  create: createMemoryEngine,
  canAccessScope,
  canReadRecord,
};
