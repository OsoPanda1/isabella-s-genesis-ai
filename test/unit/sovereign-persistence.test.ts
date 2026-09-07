import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock `pg` BEFORE importing sovereign-engine so hydrate()/save() never hit a
// real database. The mock Pool records queries the way pg's Pool API does.
const queryLog: { text: string; params: unknown[] }[] = [];

vi.mock("pg", () => {
  class MockPool {
    public max = 5;
    public on() {
      return this;
    }
    public async query(text: string, params: unknown[] = []) {
      queryLog.push({ text, params });
      // SELECT over sovereign_state → no existing row
      if (text.startsWith("SELECT") && text.includes("sovereign_state")) {
        return { rows: [] };
      }
      // CREATE TABLE / INSERT / upsert → ok
      return { rows: [], rowCount: 1 };
    }
  }
  return {
    Pool: MockPool,
  };
});

import { SovereignDB } from "../../src/lib/sovereign-engine";

describe("SovereignDB Production Persistence Adapter (P0 deployment blocker)", () => {
  beforeEach(() => {
    queryLog.length = 0;
    SovereignDB.resetMemoryCache();
  });

  it("load() no debe lanzar en modo no-producción (compat retenida)", () => {
    const db = SovereignDB.load();
    expect(db).toBeDefined();
    expect(Array.isArray(db.tenants)).toBe(true);
    expect(Array.isArray(db.ledger)).toBe(true);
  });

  it("save()/load() round-trip mantiene el estado en caché", () => {
    const db = SovereignDB.load();
    db.tenants.push({
      id: "tenant_test_save",
      name: "Tenant Test",
      region: "Mexico-Hidalgo-01",
      quotaBalance: 25,
      tier: "Enterprise",
    });
    SovereignDB.upsertTenant(db.tenants[db.tenants.length - 1]!);
    const reloaded = SovereignDB.load();
    expect(reloaded.tenants.some((t) => t.id === "tenant_test_save")).toBe(true);
  });

  it("appendLedgerBlock no rompe la cadena (integridad)", () => {
    SovereignDB.appendLedgerBlock(
      "t_prod_persist",
      "u_test",
      "VERIFICATION: test block",
      "other",
      0.05,
      10,
    );
    const integrity = SovereignDB.verifyLedgerIntegrity();
    expect(integrity.success).toBe(true);
  });

  it("hydrate() es idempotente y no requiere base real (mock pg)", async () => {
    // La caché se reseteó; hydrate en modo no-prod devuelve estado vacío sin fallar.
    const result = await SovereignDB.hydrate();
    expect(result).toBeDefined();
    if (!process.env.NODE_ENV || process.env.NODE_ENV === "test") {
      // No-production: no debe intentar consultas a pg
      expect(queryLog.some((q) => q.text.includes("sovereign_state"))).toBe(false);
    }
  });

  it("reutiliza la caché durante la ventana de refresco", async () => {
    const first = await SovereignDB.hydrate({ maxAgeMs: 5_000 });
    const second = await SovereignDB.hydrate({ maxAgeMs: 5_000 });

    expect(second).toBe(first);
    if (!process.env.NODE_ENV || process.env.NODE_ENV === "test") {
      expect(queryLog.some((q) => q.text.includes("sovereign_state"))).toBe(false);
    }
  });
});
