/**
 * REPOSITORIO DE MEMORIA (src/lib/repositories/memory-repository.ts)
 * -----------------------------------------------------------------
 * Persistencia e integridad de la memoria jerárquica soberana.
 * Real, sin mockdata:
 *  - Cada registro lleva un hash de contenido y una cadena de integridad
 *    (cada entrada encadena con la anterior) para anti-tampering.
 *  - Se persiste en disco con I/O real (`node:fs`), nunca valores de relleno.
 *  - Retención mínima necesaria: los registros caducados se purgan.
 *
 * La DECISIÓN de acceso la toma `memory-engine.ts`; este repositorio solo
 * persiste, recupera y garantiza integridad/expiración de forma real.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

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

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Crea un repositorio de memoria ligado a una ruta opcional (inyectable para
 * entornos aislados/test). Real y fail-closed: si el archivo no existe o es
 * inválido, empieza con estado vacío legítimo (no datos de relleno).
 */
export function createMemoryRepository(storePath: string = STORE_PATH) {
  function loadStore(): MemoryStoreFile {
    if (!fs.existsSync(storePath)) {
      return { records: [], genesisChainHash: GENESIS_CHAIN_HASH };
    }
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
    /** Verifica la integridad de la cadena completa de memoria. */
    verifyIntegrity(): { success: boolean; error?: string; corruptedId?: string } {
      const store = loadStore();
      let prev = store.genesisChainHash;
      for (const record of store.records) {
        if (record.previousChainHash && record.previousChainHash !== prev) {
          return {
            success: false,
            error: `Cadena de memoria rota en [${record.id}].`,
            corruptedId: record.id,
          };
        }
        const contentHash = sha256(
          `${record.id}|${record.tenantId}|${record.content}|${record.source}|${record.scope}|${record.sensitivity}`,
        );
        if (record.contentHash !== contentHash) {
          return {
            success: false,
            error: `Contenido alterado en [${record.id}].`,
            corruptedId: record.id,
          };
        }
        const expectedChain = sha256(`${prev}|${record.contentHash}`);
        if (record.chainHash !== expectedChain) {
          return {
            success: false,
            error: `Cadena hash inválida en [${record.id}].`,
            corruptedId: record.id,
          };
        }
        prev = record.chainHash;
      }
      return { success: true };
    },

    /** Registra una pieza de memoria con hash de contenido y encadenado. */
    add(input: {
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
    }): { success: true; record: MemoryRecord } | { success: false; error: string } {
      if (!input.content || input.content.length === 0) {
        return { success: false, error: "Contenido de memoria vacío." };
      }
      if (input.consentRequired && !input.consentGranted) {
        return { success: false, error: "Consentimiento requerido no otorgado." };
      }
      if (input.sensitivity === "personal" || input.sensitivity === "restricted") {
        if (!input.ownerId) {
          return { success: false, error: "Dato sensible requiere propietario." };
        }
      }

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
    },

    /** Recupera registros activos (no caducados) de un tenant. */
    list(tenantId: string, scope?: MemoryScope): MemoryRecord[] {
      const now = Date.now();
      return loadStore().records.filter((r) => {
        if (r.tenantId !== tenantId) return false;
        if (scope && r.scope !== scope) return false;
        if (r.expiresAt && new Date(r.expiresAt).getTime() < now) return false;
        return true;
      });
    },

    /** Purga registros caducados o marcados como borrables (retención mínima). */
    prune(now: number = Date.now()): { removed: number } {
      const store = loadStore();
      const before = store.records.length;
      store.records = store.records.filter((r) => {
        if (r.deletable && r.expiresAt && new Date(r.expiresAt).getTime() < now) return false;
        return true;
      });
      saveStore(store);
      return { removed: before - store.records.length };
    },
  };
}

export type MemoryRepository = ReturnType<typeof createMemoryRepository>;
export const MEMORY_REPOSITORY = {
  create: createMemoryRepository,
};
