/**
 * MATRIZ DE PERMISOS (src/lib/permission-matrix.ts)
 * -----------------------------------------------------------------
 * Fuente declarativa que conecta recursos y acciones del sistema con
 * permisos concretos del catálogo RBAC (`rbac.ts`).
 *
 * Permite derivar el permiso necesario para operar sobre un recurso
 * con una acción determinada, y validar que todo permiso referido
 * existe en el catálogo. Es la capa de traducción entre el dominio
 * (recurso + acción) y la autorización (permiso).
 */

import { PERMISSIONS } from "./rbac";

/** Recursos del sistema susceptibles de autorización. */
export type Resource =
  | "memory"
  | "ledger"
  | "audit"
  | "data:personal"
  | "governance"
  | "permission"
  | "tool"
  | "sandbox"
  | "monetization"
  | "system";

export const RESOURCES: readonly Resource[] = [
  "memory",
  "ledger",
  "audit",
  "data:personal",
  "governance",
  "permission",
  "tool",
  "sandbox",
  "monetization",
  "system",
];

/** Acciones estandarizadas sobre un recurso. */
export type Action =
  "read" | "write" | "delete" | "execute" | "verify" | "admin" | "configure" | "list";

export const ACTIONS: readonly Action[] = [
  "read",
  "write",
  "delete",
  "execute",
  "verify",
  "admin",
  "configure",
  "list",
];

/** Resultado de la consulta de un permiso derivado. */
export interface DerivedPermission {
  permission: Permission | null;
  reason: string;
}

type Permission = keyof typeof PERMISSIONS;

/**
 * Permiso mínimo requerido por (recurso, acción).
 * `null` = operación no autorizada para nadie (no existe permiso).
 */
const MATRIX: Record<Resource, Partial<Record<Action, Permission | null>>> = {
  memory: {
    read: "memory:read:own",
    write: "memory:write:own",
    delete: "memory:delete:own",
    admin: "memory:admin",
  },
  ledger: {
    read: "ledger:read:own",
    write: "ledger:write",
    verify: "ledger:verify",
    admin: "ledger:refund",
    execute: null,
  },
  audit: {
    read: "audit:read",
    write: "audit:write",
    verify: "audit:verify",
  },
  "data:personal": {
    read: "data:personal:export",
    write: null,
    execute: null,
  },
  governance: {
    read: "governance:read",
    write: "governance:write",
    admin: "governance:write",
  },
  permission: {
    write: "permission:grant",
    delete: "permission:revoke",
    admin: "governance:write",
    read: "governance:read",
  },
  tool: {
    list: "tool:list",
    read: "tool:list",
    execute: "tool:execute",
  },
  sandbox: {
    execute: "sandbox:run",
    read: "audit:read",
  },
  monetization: {
    read: "monetization:read",
    configure: "monetization:configure",
    write: "monetization:configure",
    execute: "monetization:withdraw",
  },
  system: {
    read: "system:state",
    write: "system:admin",
    delete: "system:admin",
    execute: "system:telemetry",
    admin: "system:admin",
  },
};

const FALLBACK: Partial<Record<Action, Permission | null>> = {};

/**
 * Deriva el permiso necesario para (recurso, acción). Resuelve
 * fail-closed: devuelve `null` si la combinación no está definida.
 */
export function permissionFor(resource: Resource, action: Action): DerivedPermission {
  const row = MATRIX[resource] ?? FALLBACK;
  const permission = row[action];
  if (permission === undefined) {
    return {
      permission: null,
      reason: `No existe permiso definido para (${resource}, ${action}).`,
    };
  }
  if (permission === null) {
    return {
      permission: null,
      reason: `La operación (${resource}, ${action}) está prohibida para toda identidad.`,
    };
  }
  return { permission, reason: `Permiso requerido para (${resource}, ${action}).` };
}

/**
 * Valida la integridad declarativa de la matriz. Devuelve las
 * incoherencias encontradas (uso en tests e integrity-check).
 */
export function validatePermissionMatrix(): string[] {
  const issues: string[] = [];
  const allowed = new Set<string>(Object.keys(PERMISSIONS));
  for (const resource of RESOURCES) {
    const row = MATRIX[resource] ?? {};
    for (const action of ACTIONS) {
      const permission = row[action];
      if (permission === undefined) continue;
      if (permission !== null && !allowed.has(permission)) {
        issues.push(`${resource}:${action} -> permiso inválido '${permission}'`);
      }
    }
  }
  return issues;
}

export const PERMISSION_MATRIX = {
  resources: RESOURCES,
  actions: ACTIONS,
  permissionFor,
  validate: validatePermissionMatrix,
};
