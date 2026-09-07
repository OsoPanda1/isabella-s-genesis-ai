import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { PostgresAccountingRepository } from "../../src/lib/accounting/accounting-postgres-repository";
import { createDoubleEntryService } from "../../src/lib/accounting/double-entry-service";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("Integración PostgreSQL - Sistema Contable", () => {
  let repository: PostgresAccountingRepository;
  let service: ReturnType<typeof createDoubleEntryService>;
  const tenantId = "tenant-integ-999";

  beforeAll(() => {
    repository = new PostgresAccountingRepository();
    service = createDoubleEntryService(repository);
  });

  it("debe crear cuentas y asentar una transacción real", async () => {
    const assetAcc = await repository.createAccount({
      tenantId,
      code: "1000",
      name: "Caja Fuerte",
      type: "asset",
    });

    const equityAcc = await repository.createAccount({
      tenantId,
      code: "3000",
      name: "Capital",
      type: "equity",
    });

    const result = await service.createDoubleEntryTransaction({
      tenantId,
      description: "Aporte inicial",
      createdBy: "admin",
      lines: [
        { accountId: assetAcc.id, debitCents: 100000 },
        { accountId: equityAcc.id, creditCents: 100000 },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.entry).toBeDefined();

    const postResult = await service.postJournalEntry(result.entry!.id);
    expect(postResult.success).toBe(true);

    const balance = await service.getBalanceSheet(tenantId, new Date());
    expect(balance.isBalanced).toBe(true);
    expect(balance.totalAssetsCents).toBeGreaterThanOrEqual(100000);
  });
});
