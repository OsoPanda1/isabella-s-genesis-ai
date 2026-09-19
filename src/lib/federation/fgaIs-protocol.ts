/** Federated protocol: signed updates, replay resistance, differential privacy and Byzantine-aware aggregation. */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
  verify,
} from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { config } from "@/lib/config";
import { robustMedianAggregate, weightedAverage } from "@/lib/cognitive/native-engine";

export interface FederatedNode {
  nodeId: string;
  territoryId: string;
  publicKey: string;
  status: "ACTIVE" | "SUSPENDED" | "REVOKED";
  capabilities: string[];
}
export interface LocalUpdate {
  updateId: string;
  nodeId: string;
  territoryId: string;
  modelId: string;
  baseVersion: string;
  delta: number[];
  sampleCount: number;
  metrics: { loss: number; accuracy?: number; fairness?: number };
  createdAt: string;
  nonce: string;
  signature: string;
  hash: string;
}
export interface ReplayStore {
  seen(key: string): Promise<boolean> | boolean;
  remember(key: string): Promise<void> | void;
  claim?(key: string): Promise<boolean> | boolean;
}
export class MemoryReplayStore implements ReplayStore {
  private readonly ids = new Set<string>();
  seen(k: string) {
    return this.ids.has(k);
  }
  remember(k: string) {
    this.ids.add(k);
  }
  claim(k: string) {
    if (this.ids.has(k)) return false;
    this.ids.add(k);
    return true;
  }
}

/** PostgreSQL-backed replay store. claim() is the atomic production primitive. */
export class PostgresReplayStore implements ReplayStore {
  private readonly db;
  constructor(databaseUrl = config().DATABASE_URL) {
    if (!databaseUrl)
      throw new Error("federation_replay_store_unavailable: DATABASE_URL is required");
    this.db = neon(databaseUrl);
  }
  async seen(key: string): Promise<boolean> {
    const rows = await this.db`SELECT 1 FROM fgais_federation_replay WHERE nonce=${key} LIMIT 1`;
    return rows.length > 0;
  }
  async remember(key: string): Promise<void> {
    await this
      .db`INSERT INTO fgais_federation_replay (nonce) VALUES (${key}) ON CONFLICT (nonce) DO NOTHING`;
  }
  async claim(key: string): Promise<boolean> {
    const rows = await this
      .db`INSERT INTO fgais_federation_replay (nonce) VALUES (${key}) ON CONFLICT (nonce) DO NOTHING RETURNING nonce`;
    return rows.length === 1;
  }
}

export function createIdentity() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { privateKey, publicKey };
}
function canonical(u: Omit<LocalUpdate, "signature" | "hash">) {
  return JSON.stringify({
    updateId: u.updateId,
    nodeId: u.nodeId,
    territoryId: u.territoryId,
    modelId: u.modelId,
    baseVersion: u.baseVersion,
    delta: u.delta,
    sampleCount: u.sampleCount,
    metrics: u.metrics,
    createdAt: u.createdAt,
    nonce: u.nonce,
  });
}
export function signUpdate(
  input: Omit<LocalUpdate, "signature" | "hash">,
  privateKey: ReturnType<typeof createPrivateKey>,
): LocalUpdate {
  const payload = canonical(input);
  const signature = sign(null, Buffer.from(payload), privateKey).toString("base64url");
  const hash = createHash("sha256").update(payload).digest("hex");
  return { ...input, signature, hash };
}
export async function validateUpdate(
  update: LocalUpdate,
  node: FederatedNode,
  store: ReplayStore,
  expectedModel: string,
  expectedVersion: string,
  now = Date.now(),
  maxAgeMs = 15 * 60_000,
  maxMagnitude = 100,
): Promise<void> {
  if (node.status !== "ACTIVE") throw new Error("Federated node not active");
  if (update.nodeId !== node.nodeId || update.territoryId !== node.territoryId)
    throw new Error("Node/territory mismatch");
  if (update.modelId !== expectedModel || update.baseVersion !== expectedVersion)
    throw new Error("Incompatible model version");
  if (!update.delta.length || update.delta.length > 1_000_000) throw new Error("Invalid delta");
  if (update.sampleCount < 1 || !Number.isSafeInteger(update.sampleCount))
    throw new Error("Invalid sample count");
  const createdAt = new Date(update.createdAt).getTime();
  if (!Number.isFinite(createdAt) || now - createdAt > maxAgeMs || createdAt - now > 60_000)
    throw new Error("Stale/future update");
  const magnitude = Math.sqrt(update.delta.reduce((s, x) => s + x * x, 0));
  if (!Number.isFinite(magnitude) || magnitude > maxMagnitude)
    throw new Error("Update magnitude rejected");
  const publicKey = createPublicKey(node.publicKey);
  if (
    !verify(
      null,
      Buffer.from(canonical(update)),
      publicKey,
      Buffer.from(update.signature, "base64url"),
    )
  )
    throw new Error("Invalid update signature");
  const expectedHash = createHash("sha256").update(canonical(update)).digest("hex");
  if (expectedHash !== update.hash) throw new Error("Update hash mismatch");
  const accepted = store.claim
    ? await store.claim(update.nonce)
    : !(await store.seen(update.nonce)) && (await store.remember(update.nonce), true);
  if (!accepted) throw new Error("Replay detected");
}
export function addDifferentialPrivacy(
  delta: number[],
  epsilon: number,
  clipNorm = 1,
  random = () => Math.random(),
): number[] {
  if (!(epsilon > 0)) throw new Error("epsilon must be positive");
  const norm = Math.sqrt(delta.reduce((s, x) => s + x * x, 0)) || 1;
  const scale = Math.min(1, clipNorm / norm);
  const b = clipNorm / epsilon;
  return delta.map((x) => x * scale + (random() - 0.5 + random() - 0.5) * b);
}
export function aggregateFedAvg(updates: LocalUpdate[]): number[] {
  if (!updates.length) throw new Error("No updates");
  return weightedAverage(
    updates.map((u) => u.delta),
    updates.map((u) => u.sampleCount),
  );
}
export function aggregateByzantineResistant(updates: LocalUpdate[], trimFraction = 0.1): number[] {
  if (!updates.length) throw new Error("No updates");
  if (updates.length < 3) return aggregateFedAvg(updates);
  const n = updates.length,
    k = Math.floor(n * trimFraction);
  return updates[0].delta.map((_, j) => {
    const sorted = updates.map((u) => u.delta[j]).sort((a, b) => a - b);
    const core = sorted.slice(k, n - k || n);
    return core.reduce((s, x) => s + x, 0) / core.length;
  });
}
export function aggregateRobustMedian(updates: LocalUpdate[]): number[] {
  if (!updates.length) throw new Error("No updates");
  return robustMedianAggregate(updates.map((u) => u.delta));
}
export function newUpdate(
  input: Omit<LocalUpdate, "updateId" | "nonce" | "createdAt">,
  privateKey: ReturnType<typeof createPrivateKey>,
): LocalUpdate {
  return signUpdate(
    {
      ...input,
      updateId: randomUUID(),
      nonce: randomUUID(),
      createdAt: new Date().toISOString(),
    },
    privateKey,
  );
}
