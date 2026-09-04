import { describe, it, expect } from "vitest";
import { identityHasPermission, type PrincipalIdentity } from "../../src/lib/rbac";
import { authorize, requirePermission, AuthorizationError } from "../../src/lib/authorization";
import { evaluateAbac, type AttributeContext } from "../../src/lib/abac";
import type { TenantGuardResult } from "../../src/lib/tenant-guard";
import { SovereignSandboxService } from "../../src/lib/sovereign-sandbox";

function identity(
  role: PrincipalIdentity["role"],
  subject = "s1",
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

describe("Security: deny paths y fail-closed", () => {
  it("un Guest jamás obtiene system:admin ni ledger:write", () => {
    expect(identityHasPermission(identity("Guest"), "system:admin")).toBe(false);
    expect(identityHasPermission(identity("Guest"), "ledger:write")).toBe(false);
  });

  it("un Auditor no puede escribir memoria ni ejecutar herramientas", () => {
    expect(identityHasPermission(identity("Auditor"), "memory:write:own")).toBe(false);
    expect(identityHasPermission(identity("Auditor"), "tool:execute")).toBe(false);
  });

  it("la autorización rechaza operaciones prohibidas por la matriz", () => {
    const owner = identity("SovereignOwner");
    // data:personal write está prohibido para TODA identidad
    const result = authorize({
      identity: owner,
      resource: "data:personal",
      action: "write",
      tenant: tenantOk(owner.subject, owner.tenantId),
    });
    expect(result.decision).toBe("denied");
  });

  it("requirePermission lanza en deny paths con metadatos", () => {
    const guest = identity("Guest");
    try {
      requirePermission({
        identity: guest,
        resource: "system",
        action: "admin",
        tenant: tenantOk(guest.subject, guest.tenantId),
      });
      throw new Error("Debió denegarse");
    } catch (e) {
      expect(e).toBeInstanceOf(AuthorizationError);
      if (e instanceof AuthorizationError) {
        expect(e.status).toBe(403);
        expect(e.code).toBe("AUTHORIZATION_DENIED");
      }
    }
  });

  it("ABAC niega request no autenticado con riesgo alto", () => {
    const ctx: AttributeContext = {
      role: "Guest",
      subjectTenant: "t1",
      resource: "ledger",
      action: "read",
      resourceTenant: "t1",
      resourceOwner: "",
      subject: "anon",
      risk: 0.95,
      authenticated: false,
      timezone: "UTC",
    };
    expect(evaluateAbac(ctx).decision).toBe("deny");
  });

  it("el sandbox sin ejecutor real devuelve unavailable (nunca un éxito fabricado)", async () => {
    const svc = new SovereignSandboxService("trc_test", undefined, undefined);
    const result = await svc.executeExport("add", [1, 2], 100);
    expect(result.success).toBe(false);
    expect(result.cryptographicVerificationHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.error).toMatch(/no cargado|unavailable|no hay ejecutor/i);
  });
});
