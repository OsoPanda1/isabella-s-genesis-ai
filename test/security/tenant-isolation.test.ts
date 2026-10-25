import { describe, it, expect } from "vitest";
import {
  resolveTenantContext,
  guardTenantBoundary,
  TenantBoundaryError,
} from "../../src/lib/tenant-guard";

describe("Tenant Isolation (P0 - Multi-Tenancy)", () => {
  it("authenticated identity without a canonical tenant is denied, even if it requests system", () => {
    const result = resolveTenantContext({
      authenticated: true,
      subject: "user_without_tenant",
      requestedTenantId: "system",
    });
    expect(result.boundaryOk).toBe(false);
    expect(() => guardTenantBoundary(result)).toThrow(TenantBoundaryError);
  });

  it("USER_A -> datos A = ALLOW", () => {
    const input = {
      authenticated: true,
      subject: "user_a",
      tenantId: "tenant_a",
      requestedTenantId: "tenant_a",
    };
    const result = resolveTenantContext(input);
    expect(result.boundaryOk).toBe(true);
    expect(() => guardTenantBoundary(result)).not.toThrow();
  });

  it("USER_A -> datos B = DENY", () => {
    const input = {
      authenticated: true,
      subject: "user_a",
      tenantId: "tenant_a",
      requestedTenantId: "tenant_b",
    };
    const result = resolveTenantContext(input);
    expect(result.boundaryOk).toBe(false);
    expect(() => guardTenantBoundary(result)).toThrow(TenantBoundaryError);
  });

  it("USER_B -> datos A = DENY", () => {
    const input = {
      authenticated: true,
      subject: "user_b",
      tenantId: "tenant_b",
      requestedTenantId: "tenant_a",
    };
    const result = resolveTenantContext(input);
    expect(result.boundaryOk).toBe(false);
    expect(() => guardTenantBoundary(result)).toThrow(TenantBoundaryError);
  });

  it("USER_B -> datos B = ALLOW", () => {
    const input = {
      authenticated: true,
      subject: "user_b",
      tenantId: "tenant_b",
      requestedTenantId: "tenant_b",
    };
    const result = resolveTenantContext(input);
    expect(result.boundaryOk).toBe(true);
    expect(() => guardTenantBoundary(result)).not.toThrow();
  });
});
