import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createBookpiRepository } from "../../src/lib/repositories/bookpi-repository";
import { canonicalBookPiPayload } from "../../src/lib/bookpi/canonical-payload";
import { resetConfigCache } from "../../src/lib/config";

let storePath: string;

beforeAll(() => {
  // RSA-2048 bajo carga paralela puede superar el hookTimeout de 10s.
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.BOOKPI_SIGNATURE_ALGORITHM = "RSA-SHA256";
  process.env.BOOKPI_SIGNING_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  process.env.ISABELLA_RUNTIME_MODE = "development";
  resetConfigCache();
}, 30000);

beforeEach(() => {
  storePath = path.join(
    os.tmpdir(),
    `bookpi-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`,
  );
});

function freshRepo() {
  return createBookpiRepository(storePath);
}

function appendThree(repo: ReturnType<typeof createBookpiRepository>) {
  repo.append({
    tenantId: "T_A",
    userId: "u1",
    operation: "OP1",
    category: "inference",
    cost: 1.5,
    tokens: 10,
  });
  repo.append({
    tenantId: "T_A",
    userId: "u1",
    operation: "OP2",
    category: "inference",
    cost: 2.25,
    tokens: 20,
  });
  repo.append({
    tenantId: "T_A",
    userId: "u2",
    operation: "OP3",
    category: "processing",
    cost: 0.5,
    tokens: 5,
  });
}

describe("BookPI invarianes (§7 manual)", () => {
  it("001: append → verifyIntegrity = true", () => {
    const repo = freshRepo();
    appendThree(repo);
    expect(repo.verifyIntegrity().success).toBe(true);
  });

  it("002: modificar cost → verificación FALLA", () => {
    const repo = freshRepo();
    appendThree(repo);
    const file = JSON.parse(fs.readFileSync(storePath, "utf8")) as {
      blocks: Array<{ costDecimal: string; blockHash: string }>;
    };
    file.blocks[1]!.costDecimal = "999.99";
    fs.writeFileSync(storePath, JSON.stringify(file, null, 2), "utf8");
    const result = repo.verifyIntegrity();
    expect(result.success).toBe(false);
    expect(result.corruptedIndex).toBe(1);
  });

  it("003: modificar previousHash → verificación FALLA", () => {
    const repo = freshRepo();
    appendThree(repo);
    const file = JSON.parse(fs.readFileSync(storePath, "utf8")) as {
      blocks: Array<{ previousHash: string }>;
    };
    file.blocks[2]!.previousHash = "0".repeat(64);
    fs.writeFileSync(storePath, JSON.stringify(file, null, 2), "utf8");
    expect(repo.verifyIntegrity().success).toBe(false);
  });

  it("004: modificar blockHash → verificación FALLA", () => {
    const repo = freshRepo();
    appendThree(repo);
    const file = JSON.parse(fs.readFileSync(storePath, "utf8")) as {
      blocks: Array<{ blockHash: string }>;
    };
    file.blocks[0]!.blockHash = "f".repeat(64);
    fs.writeFileSync(storePath, JSON.stringify(file, null, 2), "utf8");
    expect(repo.verifyIntegrity().success).toBe(false);
  });

  it("005: modificar firma → verificación FALLA (firma = autoridad)", () => {
    const repo = freshRepo();
    appendThree(repo);
    const file = JSON.parse(fs.readFileSync(storePath, "utf8")) as {
      blocks: Array<{ pqcSignature: string }>;
    };
    file.blocks[0]!.pqcSignature = "W10="; // base64 de []
    fs.writeFileSync(storePath, JSON.stringify(file, null, 2), "utf8");
    expect(repo.verifyIntegrity().success).toBe(false);
  });

  it("006: dos appends concurrentes → índices 0 y 1 (nunca duplicados)", async () => {
    const repo = freshRepo();
    await Promise.all([
      Promise.resolve().then(() =>
        repo.append({
          tenantId: "T_A",
          userId: "u1",
          operation: "A",
          category: "apis",
          cost: 1,
          tokens: 1,
        }),
      ),
      Promise.resolve().then(() =>
        repo.append({
          tenantId: "T_A",
          userId: "u1",
          operation: "B",
          category: "apis",
          cost: 2,
          tokens: 2,
        }),
      ),
    ]);
    const ledger = repo.list("T_A");
    const indexes = ledger.map((b) => b.index).sort((a, b) => a - b);
    expect(indexes).toEqual([0, 1]);
  });

  it("007: dos refunds sobre el mismo evento → 1 aceptado, 1 rechazado", () => {
    const repo = freshRepo();
    repo.append({
      tenantId: "T_A",
      userId: "u1",
      operation: "PAY",
      category: "skills",
      cost: 10,
      tokens: 0,
    });
    const first = repo.refund(0, "T_A");
    const second = repo.refund(0, "T_A");
    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
  });

  it("refund respeta la frontera de tenant (nunca otro tenant)", () => {
    const repo = freshRepo();
    repo.append({
      tenantId: "T_A",
      userId: "u1",
      operation: "PAY",
      category: "skills",
      cost: 10,
      tokens: 0,
    });
    const cross = repo.refund(0, "T_B");
    expect(cross.success).toBe(false);
  });
});

describe("canonicalBookPiPayload (§6.1 determinismo)", () => {
  it("append-time (sin blockHash) == verify-time (con blockHash)", () => {
    const repo = freshRepo();
    const res = repo.append({
      tenantId: "T_A",
      userId: "u1",
      operation: "OP",
      category: "other",
      cost: 1,
      tokens: 1,
    });
    if (!res.success) throw new Error(res.error);
    const block = res.block;
    const { blockHash, pqcSignature, signatureAlgorithm, ...forAppend } = block;
    void blockHash;
    expect(canonicalBookPiPayload(forAppend)).toBe(canonicalBookPiPayload(block));
  });

  it("excluye pqcSignature y signatureAlgorithm del payload canónico", () => {
    const repo = freshRepo();
    const res = repo.append({
      tenantId: "T_A",
      userId: "u1",
      operation: "OP",
      category: "other",
      cost: 1,
      tokens: 1,
    });
    if (!res.success) throw new Error(res.error);
    const base = {
      ...res.block,
      pqcSignature: null,
      signatureAlgorithm: "SHA-256",
    };
    expect(canonicalBookPiPayload(base)).toBe(canonicalBookPiPayload(res.block));
  });
});
