import { describe, it, expect } from "vitest";
import {
  ROLES,
  resolveRoleChain,
  identityHasPermission,
  checkPermission,
  grantedPermissions,
  type PrincipalIdentity,
} from "../../src/lib/rbac";
import {
  permissionFor,
  validatePermissionMatrix,
  type Resource,
  type Action,
} from "../../src/lib/permission-matrix";
import { evaluateAbac, type AttributeContext } from "../../src/lib/abac";
import { assertTenantBoundary, type TenantContext } from "../../src/lib/tenant-context";
import {
  resolveTenantContext,
  guardTenantBoundary,
  TenantBoundaryError,
  type TenantGuardResult,
} from "../../src/lib/tenant-guard";
import { authorize, requirePermission, AuthorizationError } from "../../src/lib/authorization";

function identity(
  role: PrincipalIdentity["role"],
  subject = "u1",
  tenantId = "t1",
): PrincipalIdentity {
  return {
    subject,
    username: subject,
    tenantId,
    role,
    scopes: [],
    authenticated: role !== "Guest",
  };
}

function tenantOk(subject: string, tenantId: string): TenantGuardResult {
  return {
    context: {
      subject,
      username: subject,
      tenantId,
      resolvedBy: "bearer",
      authenticated: true,
      resolvedAt: new Date().toISOString(),
    },
    boundaryOk: true,
    reason: "ok",
  };
}

describe("RBAC — control de acceso basado en roles", () => {
  it("resuelve la cadena de herencia de mayor a menor privilegio", () => {
    const chain = resolveRoleChain("SovereignOwner");
    for (const role of ROLES) expect(chain).toContain(role);
    expect(chain[0]).toBe("SovereignOwner");
  });

  it("el rol Guest solo posee permisos mínimos (fail-closed)", () => {
    expect(identityHasPermission(identity("Guest"), "system:admin")).toBe(false);
    expect(identityHasPermission(identity("Guest"), "ledger:write")).toBe(false);
    expect(identityHasPermission(identity("Guest"), "governance:read")).toBe(true);
  });

  it("SovereignOwner hereda permisos de todos los roles", () => {
    expect(grantedPermissions("SovereignOwner").has("system:admin")).toBe(true);
    expect(grantedPermissions("SovereignOwner").has("ledger:refund")).toBe(true);
  });

  it("un permiso inexistente o un rol desconocido resuelve denied", () => {
    const unknown = { role: "Desconocido" } as unknown as PrincipalIdentity;
    expect(identityHasPermission(unknown, "tool:list")).toBe(false);
    const check = checkPermission(unknown, "tool:list");
    expect(check.allowed).toBe(false);
  });

  it("la matriz de permisos es íntegra (todo permiso referido existe)", () => {
    expect(validatePermissionMatrix()).toEqual([]);
  });

  it("una operación prohibida para toda identidad se deriva como null", () => {
    expect(permissionFor("ledger", "admin").permission).toBe("ledger:refund");
    const banned = permissionFor("data:personal", "write");
    expect(banned.permission).toBeNull();
  });
});

describe("ABAC — atributos y aislamiento territorial", () => {
  const baseContext = (partial: Partial<AttributeContext>): AttributeContext => ({
    role: "Operator",
    subjectTenant: "t1",
    resource: "memory",
    action: "read",
    resourceTenant: "t1",
    resourceOwner: "",
    subject: "u1",
    risk: 0,
    authenticated: true,
    timezone: "UTC",
    ...partial,
  });

  it("niega acceso a recurso de otro tenant para un rol local", () => {
    const result = evaluateAbac(baseContext({ resourceTenant: "t2" }));
    expect(result.decision).toBe("deny");
    expect(result.policy).toBe("isolation:territorial");
  });

  it("permite un dossier no sensible (notApplied)", () => {
    const result = evaluateAbac(baseContext({ resourceTenant: "t1" }));
    expect(result.decision).toBe("allow");
  });

  it("niega request de alto riesgo (fail-closed)", () => {
    const result = evaluateAbac(baseContext({ risk: 0.95 }));
    expect(result.decision).toBe("deny");
  });

  it("niega acceso a datos personales ajenos", () => {
    const result = evaluateAbac(baseContext({ resource: "data:personal", resourceOwner: "otro" }));
    expect(result.decision).toBe("deny");
  });
});

describe("Tenant — frontera y guard de aislamiento", () => {
  it("rechaza cruzar la frontera de tenant a través de cabeceras", () => {
    const ctx: TenantContext = {
      subject: "u1",
      username: "u1",
      tenantId: "t1",
      resolvedBy: "bearer",
      authenticated: true,
      resolvedAt: new Date().toISOString(),
    };
    expect(assertTenantBoundary(ctx, "t2").allowed).toBe(false);
    expect(assertTenantBoundary(ctx, "t1").allowed).toBe(true);
  });

  it("el guard degrada a mínimo privilegio y marca frontera inválida", () => {
    const result = resolveTenantContext({
      authenticated: true,
      subject: "u1",
      tenantId: "t1",
      resolvedBy: "bearer",
      requestedTenantId: "t2",
    });
    expect(result.boundaryOk).toBe(false);
    expect(result.context.authenticated).toBe(false);
    expect(() => guardTenantBoundary(result)).toThrow(TenantBoundaryError);
  });

  it("un request no autenticado recibe contexto huésped", () => {
    const result = resolveTenantContext({ authenticated: false });
    expect(result.context.authenticated).toBe(false);
    expect(result.boundaryOk).toBe(true);
  });
});

describe("Authorization — punto único de decisión (deny paths)", () => {
  it("niega cuando la frontera de tenant no es válida", () => {
    const owner = identity("SovereignOwner");
    const result = authorize({
      identity: owner,
      resource: "ledger",
      action: "read",
      tenant: {
        context: {
          subject: owner.subject,
          username: owner.username,
          tenantId: owner.tenantId,
          resolvedBy: "bearer",
          authenticated: true,
          resolvedAt: new Date().toISOString(),
        },
        boundaryOk: false,
        reason: "Frontera violada.",
      },
    });
    expect(result.decision).toBe("denied");
  });

  it("niega cuando el rol no posee el permiso de la matriz", () => {
    const guest = identity("Guest");
    const result = authorize({
      identity: guest,
      resource: "tool",
      action: "execute",
      tenant: tenantOk(guest.subject, guest.tenantId),
    });
    expect(result.decision).toBe("denied");
  });

  it("niega por política ABAC incluso con rol habilitado", () => {
    const op = identity("Operator");
    const result = authorize({
      identity: op,
      resource: "memory",
      action: "read",
      risk: 0.95,
      tenant: tenantOk(op.subject, op.tenantId),
    });
    expect(result.decision).toBe("denied");
  });

  it("permite a un Operator leer memoria con riesgo bajo y misma tenant", () => {
    const op = identity("Operator");
    const result = authorize({
      identity: op,
      resource: "memory",
      action: "read",
      risk: 0.1,
      tenant: tenantOk(op.subject, op.tenantId),
    });
    expect(result.decision).toBe("allowed");
    expect(result.permission).toBe("memory:read:own");
  });

  it("requirePermission lanza AuthorizationError en deny paths", () => {
    const guest = identity("Guest");
    expect(() =>
      requirePermission({
        identity: guest,
        resource: "system",
        action: "admin",
        tenant: tenantOk(guest.subject, guest.tenantId),
      }),
    ).toThrow(AuthorizationError);
  });
});
