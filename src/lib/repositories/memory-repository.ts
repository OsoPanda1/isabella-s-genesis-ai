/**
 * REPOSITORIO DE MEMORIA (src/lib/repositories/memory-repository.ts)
 * -----------------------------------------------------------------
 * Persistencia e integridad de la memoria jerárquica soberana.
 * Real, sin mockdata:
 *  - Cada registro lleva un hash de contenido y una cadena de integridad.
 *  - Se persiste en disco solo en entornos explícitamente autorizados.
 *  - En producción/Vercel no se permite el fallback JSON no durable.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { config } from "@/lib/config";
import { isProductionLike, resolveRuntimeMode } from "@/lib/runtime-mode";

export type MemoryScope = "turn" | "session" | "project" | "territorial" | "historical";
export type MemorySource = "user" | "system" | "tool" | "document";
export type MemorySensitivity = "public" | "internal" | "personal" | "restricted";

export interface MemoryRecord {
  id: string;
  ownerId?: string;
  tenantId: string;
  content: string;
  source: MemorySource;
  scope: MemoryScope;
  sensitivity: MemorySensitivity;
  purpose: string;
  consentRequired: boolean;
  consentGranted: boolean;
  createdAt: string;
  expiresAt?: string;
  deletable: boolean;
  provenance: readonly string[];
  contentHash: string;
  chainHash: string;
  previousChainHash?: string;
}

export interface MemoryStoreFile {
  records: MemoryRecord[];
  genesisChainHash: string;
}

const GENESIS_CHAIN_HASH = "0000000000000000000000000000000000000000000000000000000000000000";
const STORE_PATH = path.join(process.cwd(), "isabella_memory_store.json");

const storeLocks = new Map<string, Promise<unknown>>();
function withStoreLock<T>(storePath: string, task: () => T | Promise<T>): Promise<T> {
  const previous = storeLocks.get(storePath) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  storeLocks.set(
    storePath,
    next.catch(() => undefined),
  );
  return next;
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function assertFilePersistenceAllowed(storePath: string): void {
  const runtime = resolveRuntimeMode(config().ISABELLA_RUNTIME_MODE);
  const production = isProductionLike(runtime);
  const vercel = config().VERCEL;
  const defaultStore = path.resolve(storePath) === path.resolve(STORE_PATH);
  if (defaultStore && (production || vercel) && !config().DURABLE_JSON_ALLOWED) {
    throw new Error(
      "memory_persistence_unavailable: durable PostgreSQL/Supabase memory repository required",
    );
  }
}

export function createMemoryRepository(storePath: string = STORE_PATH) {
  assertFilePersistenceAllowed(storePath);

  function loadStore(): MemoryStoreFile {
    if (!fs.existsSync(storePath)) return { records: [], genesisChainHash: GENESIS_CHAIN_HASH };
    try {
      const raw = fs.readFileSync(storePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<MemoryStoreFile>;
      const records = Array.isArray(parsed.records) ? (parsed.records as MemoryRecord[]) : [];
      const genesisChainHash =
        typeof parsed.genesisChainHash === "string" && parsed.genesisChainHash.length === 64
          ? parsed.genesisChainHash
          : GENESIS_CHAIN_HASH;
      return { records, genesisChainHash };
    } catch {
      return { records: [], genesisChainHash: GENESIS_CHAIN_HASH };
    }
  }

  function saveStore(store: MemoryStoreFile): void {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf-8");
  }

  function lastChainHash(records: readonly MemoryRecord[]): string {
    const last = records[records.length - 1];
    return last?.chainHash ?? GENESIS_CHAIN_HASH;
  }

  return {
    verifyIntegrity(): {
      success: boolean;
      error?: string;
      corruptedId?: string;
    } {
      const store = loadStore();
      let prev = store.genesisChainHash;
      for (const record of store.records) {
        if (record.previousChainHash && record.previousChainHash !== prev)
          return {
            success: false,
            error: `Cadena de memoria rota en [${record.id}].`,
            corruptedId: record.id,
          };
        const contentHash = sha256(
          `${record.id}|${record.tenantId}|${record.content}|${record.source}|${record.scope}|${record.sensitivity}`,
        );
        if (record.contentHash !== contentHash)
          return {
            success: false,
            error: `Contenido alterado en [${record.id}].`,
            corruptedId: record.id,
          };
        const expectedChain = sha256(`${prev}|${record.contentHash}`);
        if (record.chainHash !== expectedChain)
          return {
            success: false,
            error: `Cadena hash inválida en [${record.id}].`,
            corruptedId: record.id,
          };
        prev = record.chainHash;
      }
      return { success: true };
    },

    async add(input: {
      tenantId: string;
      content: string;
      source: MemorySource;
      scope: MemoryScope;
      sensitivity: MemorySensitivity;
      purpose: string;
      consentRequired: boolean;
      consentGranted: boolean;
      ownerId?: string;
      expiresAt?: string;
      provenance?: readonly string[];
    }): Promise<{ success: true; record: MemoryRecord } | { success: false; error: string }> {
      if (!input.content || input.content.length === 0)
        return { success: false, error: "Contenido de memoria vacío." };
      if (input.consentRequired && !input.consentGranted)
        return {
          success: false,
          error: "Consentimiento requerido no otorgado.",
        };
      if (
        (input.sensitivity === "personal" || input.sensitivity === "restricted") &&
        !input.ownerId
      )
        return { success: false, error: "Dato sensible requiere propietario." };

      return withStoreLock(storePath, () => {
        const store = loadStore();
        const id = `mem_${crypto.randomUUID()}`;
        const createdAt = new Date().toISOString();
        const contentHash = sha256(
          `${id}|${input.tenantId}|${input.content}|${input.source}|${input.scope}|${input.sensitivity}`,
        );
        const previousChainHash = lastChainHash(store.records);
        const chainHash = sha256(`${previousChainHash}|${contentHash}`);
        const record: MemoryRecord = {
          id,
          tenantId: input.tenantId,
          content: input.content,
          source: input.source,
          scope: input.scope,
          sensitivity: input.sensitivity,
          purpose: input.purpose,
          consentRequired: input.consentRequired,
          consentGranted: input.consentGranted,
          createdAt,
          deletable: true,
          provenance: input.provenance ?? [],
          contentHash,
          chainHash,
          previousChainHash,
          ...(input.ownerId ? { ownerId: input.ownerId } : {}),
          ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        };
        store.records.push(record);
        saveStore(store);
        return { success: true, record };
      });
    },

    list(tenantId: string, scope?: MemoryScope): MemoryRecord[] {
      const now = Date.now();
      return loadStore().records.filter((r) => {
        if (r.tenantId !== tenantId) return false;
        if (scope && r.scope !== scope) return false;
        if (r.expiresAt && new Date(r.expiresAt).getTime() < now) return false;
        return true;
      });
    },

    prune(now: number = Date.now()): { removed: number } {
      const store = loadStore();
      const before = store.records.length;
      store.records = store.records.filter(
        (r) => !(r.deletable && r.expiresAt && new Date(r.expiresAt).getTime() < now),
      );
      saveStore(store);
      return { removed: before - store.records.length };
    },
  };
}

export type MemoryRepository = ReturnType<typeof createMemoryRepository>;
export const MEMORY_REPOSITORY = { create: createMemoryRepository };
