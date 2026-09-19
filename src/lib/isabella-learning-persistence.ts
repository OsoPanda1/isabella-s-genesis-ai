import { createHash } from "node:crypto";
import { Pool } from "pg";
import { config } from "@/lib/config";
import {
  createIsabellaLearningEngine,
  type IsabellaLearningEngine,
  type LearningSnapshot,
} from "@/lib/isabella-learning";

let pool: Pool | null = null;
let tableReady: Promise<void> | null = null;

function getPool(): Pool {
  const databaseUrl = config().DATABASE_URL;
  if (!databaseUrl) throw new Error("LEARNING_DATABASE_UNAVAILABLE");
  if (!pool) pool = new Pool({ connectionString: databaseUrl, max: 4 });
  return pool;
}

async function ensureTable(): Promise<void> {
  if (tableReady) return tableReady;
  tableReady = getPool()
    .query(
      `
    CREATE TABLE IF NOT EXISTS public.isabella_learning_state (
      tenant_id VARCHAR(255) PRIMARY KEY,
      version INTEGER NOT NULL DEFAULT 1,
      snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      snapshot_hash VARCHAR(128) NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `,
    )
    .then(() => undefined)
    .catch((error) => {
      tableReady = null;
      throw error;
    });
  return tableReady;
}

export interface PersistedLearningRuntime {
  engine: IsabellaLearningEngine;
  durable: boolean;
}

export async function loadLearningRuntime(tenantId: string): Promise<PersistedLearningRuntime> {
  if (!tenantId) throw new Error("TENANT_REQUIRED");
  const databaseUrl = config().DATABASE_URL;
  if (!databaseUrl) return { engine: createIsabellaLearningEngine(), durable: false };

  await ensureTable();
  const result = await getPool().query<{
    version: number;
    snapshot: LearningSnapshot;
    snapshot_hash: string;
  }>(
    `SELECT version, snapshot, snapshot_hash FROM public.isabella_learning_state WHERE tenant_id = $1`,
    [tenantId],
  );
  const engine = createIsabellaLearningEngine();
  const row = result.rows[0];
  if (row?.snapshot) {
    if (row.version !== 1 || row.snapshot.version !== 1)
      throw new Error("LEARNING_SNAPSHOT_VERSION_UNSUPPORTED");
    const canonical = stableStringify(row.snapshot);
    const expected = createHash("sha3-512").update(canonical).digest("hex");
    if (expected !== row.snapshot_hash) throw new Error("LEARNING_SNAPSHOT_INTEGRITY_FAILURE");
    engine.restore(row.snapshot);
  }
  return { engine, durable: true };
}

export async function persistLearningRuntime(
  tenantId: string,
  engine: IsabellaLearningEngine,
): Promise<void> {
  if (!tenantId) throw new Error("TENANT_REQUIRED");
  if (!config().DATABASE_URL) return;
  await ensureTable();
  const snapshot = engine.snapshot();
  const canonical = stableStringify(snapshot);
  const snapshotHash = createHash("sha3-512").update(canonical).digest("hex");
  await getPool().query(
    `
      INSERT INTO public.isabella_learning_state (tenant_id, version, snapshot, snapshot_hash, updated_at)
      VALUES ($1, $2, $3::jsonb, $4, now())
      ON CONFLICT (tenant_id)
      DO UPDATE SET
        version = EXCLUDED.version,
        snapshot = EXCLUDED.snapshot,
        snapshot_hash = EXCLUDED.snapshot_hash,
        updated_at = now()
    `,
    [tenantId, snapshot.version, canonical, snapshotHash],
  );
}

export async function verifyLearningPersistence(): Promise<{
  ok: boolean;
  durable: boolean;
  latencyMs: number;
}> {
  const start = performance.now();
  if (!config().DATABASE_URL)
    return { ok: false, durable: false, latencyMs: performance.now() - start };
  try {
    await ensureTable();
    await getPool().query("SELECT 1 FROM public.isabella_learning_state LIMIT 1");
    return { ok: true, durable: true, latencyMs: performance.now() - start };
  } catch {
    return { ok: false, durable: true, latencyMs: performance.now() - start };
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
}
