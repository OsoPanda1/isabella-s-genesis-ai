/** Tamper-evident decision/evidence ledger. Durable storage is injected by the deployment. */
import { createHash } from "node:crypto";
export type Risk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export interface DecisionRecord {
  id: string;
  tenantId: string;
  actorId: string;
  authority: string;
  capability: string;
  policy: string;
  risk: Risk;
  modelId?: string;
  inputHash: string;
  outputHash: string;
  result: "ALLOW" | "DENY" | "REVIEW";
  timestamp: string;
  previousHash: string;
  recordHash: string;
  evidenceIds: string[];
}
export interface LedgerStore {
  append(record: DecisionRecord): Promise<void> | void;
  latestHash(tenantId: string): Promise<string | undefined> | string | undefined;
}
export class MemoryLedger implements LedgerStore {
  private readonly records: DecisionRecord[] = [];
  append(r: DecisionRecord) {
    this.records.push({ ...r });
  }
  latestHash(tenantId: string) {
    return [...this.records].reverse().find((r) => r.tenantId === tenantId)?.recordHash;
  }
  list() {
    return this.records.map((r) => ({ ...r, evidenceIds: [...r.evidenceIds] }));
  }
}
export function hashRecord(record: Omit<DecisionRecord, "recordHash">): string {
  return createHash("sha3-512").update(JSON.stringify(record)).digest("hex");
}
export async function recordDecision(
  store: LedgerStore,
  input: Omit<DecisionRecord, "previousHash" | "recordHash">,
): Promise<DecisionRecord> {
  const previousHash = (await store.latestHash(input.tenantId)) ?? "GENESIS";
  const base = { ...input, previousHash };
  const record = { ...base, recordHash: hashRecord(base) };
  await store.append(record);
  return record;
}
export function verifyChain(records: DecisionRecord[]): boolean {
  let previous = "GENESIS";
  for (const r of records) {
    const { recordHash, ...base } = r;
    if (r.previousHash !== previous || hashRecord(base) !== recordHash) return false;
    previous = recordHash;
  }
  return true;
}
