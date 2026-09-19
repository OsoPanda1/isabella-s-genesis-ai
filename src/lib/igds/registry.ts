/**
 * IGDS — Registro Genesis (src/lib/igds/registry.ts)
 * -----------------------------------------------------------------
 * Log append-only con hashes encadenados + árbol Merkle + checkpoints firmados.
 * No usa blockchain: la evidencia se sostiene en hash chaining, Merkle root,
 * firmas y (opcionalmente) timestamps externos RFC 3161.
 *
 * Implementación de referencia en memoria/JSON; la persistencia durable en
 * PostgreSQL vive en `src/lib/repositories/igds-genesis-repository.ts` y
 * respeta la MISMA fórmula de hash (`computeEntryHash`).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { canonicalize } from "./canonical";
import { digestHex } from "./digests";
import { merkleRoot } from "./merkle";
import { manifestFinalDigest } from "./manifest";
import type { SealSigner, SignatureEnvelope } from "./keys";
import { signDigest, verifySignatureEnvelope } from "./keys";
import type {
  GenesisCheckpoint,
  GenesisEntry,
  GenesisRevocationPayload,
  GenesisEntryType,
  IgdsManifest,
} from "./types";
import type { TsaClient } from "./tsa";

export const GENESIS_PREVIOUS_HASH = "0".repeat(64);

export type GenesisEntryPayload = Pick<
  GenesisEntry,
  | "sequence"
  | "entry_id"
  | "type"
  | "document_id"
  | "document_digest"
  | "manifest_digest"
  | "previous_entry_hash"
  | "created_at"
  | "revocation"
>;

export function canonicalEntryPayload(payload: GenesisEntryPayload): Record<string, unknown> {
  return {
    sequence: payload.sequence,
    entry_id: payload.entry_id,
    type: payload.type,
    document_id: payload.document_id,
    document_digest: payload.document_digest,
    manifest_digest: payload.manifest_digest,
    previous_entry_hash: payload.previous_entry_hash,
    created_at: payload.created_at,
    ...(payload.revocation ? { revocation: payload.revocation } : {}),
  };
}

export function computeEntryHash(payload: GenesisEntryPayload): string {
  return digestHex("sha256", canonicalize(canonicalEntryPayload(payload)));
}

export interface AppendSealInput {
  entryId?: string;
  documentId: string;
  documentDigest: string;
  manifestDigest: string;
  signature: SignatureEnvelope;
  createdAt?: string;
}

export interface AppendRevocationInput {
  entryId?: string;
  revocation: GenesisRevocationPayload;
  signature: SignatureEnvelope;
  createdAt?: string;
}

export interface GenesisRegistry {
  appendSeal(input: AppendSealInput): Promise<GenesisEntry>;
  appendRevocation(input: AppendRevocationInput): Promise<GenesisEntry>;
  size(): Promise<number>;
  get(sequence: number): Promise<GenesisEntry | null>;
  list(limit?: number): Promise<GenesisEntry[]>;
  head(): Promise<GenesisEntry | null>;
  leafHashes(): Promise<string[]>;
}

interface RegistryFile {
  entries: readonly GenesisEntry[];
}

export interface GenesisRegistryOptions {
  /** Si se define, persiste el log JSON en esa ruta (nunca en producción). */
  storePath?: string;
  persistent?: boolean;
}

function loadEntries(storePath: string): GenesisEntry[] {
  if (!fs.existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath, "utf8")) as Partial<RegistryFile>;
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

function saveEntries(storePath: string, entries: readonly GenesisEntry[]): void {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify({ entries } satisfies RegistryFile, null, 2), "utf8");
}

/** Implementación de referencia (memoria o JSON) del registro Genesis. */
export function createGenesisRegistry(options: GenesisRegistryOptions = {}): GenesisRegistry {
  const persistent = options.persistent ?? Boolean(options.storePath);
  const storePath = options.storePath ?? path.join(process.cwd(), "isabella_genesis_registry.json");
  let entries: GenesisEntry[] = persistent ? loadEntries(storePath) : [];
  let tail: Promise<unknown> = Promise.resolve();

  function locked<T>(task: () => T | Promise<T>): Promise<T> {
    const next = tail.catch(() => undefined).then(task);
    tail = next.catch(() => undefined);
    return next;
  }

  function persist(): void {
    if (persistent) saveEntries(storePath, entries);
  }

  function append(input: {
    entryId?: string;
    type: GenesisEntryType;
    documentId: string;
    documentDigest: string;
    manifestDigest: string;
    signature: SignatureEnvelope;
    revocation?: GenesisRevocationPayload;
    createdAt?: string;
  }): GenesisEntry {
    const previous = entries.length > 0 ? entries[entries.length - 1]! : null;
    const payload: GenesisEntryPayload = {
      sequence: previous ? previous.sequence + 1 : 0,
      entry_id: input.entryId ?? `gen_${randomUUID()}`,
      type: input.type,
      document_id: input.documentId,
      document_digest: input.documentDigest,
      manifest_digest: input.manifestDigest,
      previous_entry_hash: previous ? previous.entry_hash : GENESIS_PREVIOUS_HASH,
      created_at: input.createdAt ?? new Date().toISOString(),
      ...(input.revocation ? { revocation: input.revocation } : {}),
    };
    const entry: GenesisEntry = {
      ...payload,
      entry_hash: computeEntryHash(payload),
      signature: input.signature,
    };
    entries = [...entries, entry];
    persist();
    return entry;
  }

  return {
    appendSeal(input) {
      return locked(() =>
        append({
          entryId: input.entryId,
          type: "seal",
          documentId: input.documentId,
          documentDigest: input.documentDigest,
          manifestDigest: input.manifestDigest,
          signature: input.signature,
          createdAt: input.createdAt,
        }),
      );
    },
    appendRevocation(input) {
      return locked(() =>
        append({
          entryId: input.entryId,
          type: "revocation",
          documentId: input.revocation.target_id,
          documentDigest: "",
          manifestDigest: "",
          signature: input.signature,
          revocation: input.revocation,
          createdAt: input.createdAt,
        }),
      );
    },
    size() {
      return Promise.resolve(entries.length);
    },
    get(sequence) {
      return Promise.resolve(entries.find((entry) => entry.sequence === sequence) ?? null);
    },
    list(limit = 200) {
      return Promise.resolve(entries.slice(0, limit));
    },
    head() {
      return Promise.resolve(entries.length > 0 ? entries[entries.length - 1]! : null);
    },
    leafHashes() {
      return Promise.resolve(entries.map((entry) => entry.entry_hash));
    },
  };
}

export function verifyGenesisChain(entries: readonly GenesisEntry[]): {
  success: boolean;
  error?: string;
  corruptedSequence?: number;
} {
  let previousHash = GENESIS_PREVIOUS_HASH;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    if (entry.sequence !== index) {
      return {
        success: false,
        error: "Secuencia Genesis discontinua.",
        corruptedSequence: entry.sequence,
      };
    }
    if (entry.previous_entry_hash !== previousHash) {
      return { success: false, error: "Cadena Genesis rota.", corruptedSequence: entry.sequence };
    }
    const recomputed = computeEntryHash(entry);
    if (recomputed !== entry.entry_hash) {
      return {
        success: false,
        error: "Entrada Genesis alterada.",
        corruptedSequence: entry.sequence,
      };
    }
    previousHash = entry.entry_hash;
  }
  return { success: true };
}

export function manifestDigestOf(manifest: IgdsManifest): string {
  return manifestFinalDigest(manifest, "sha256");
}

export interface CheckpointInput {
  registry: GenesisRegistry;
  signer: SealSigner;
  tsa?: TsaClient;
  generatedAt?: string;
}

interface CheckpointBase {
  tree_size: number;
  root_hash: string;
  first_sequence: number;
  last_sequence: number;
  generated_at: string;
}

function checkpointBase(input: CheckpointBase): string {
  return canonicalize(input);
}

export async function buildGenesisCheckpoint(
  input: CheckpointInput,
): Promise<GenesisCheckpoint | null> {
  const entries = await input.registry.list(Number.MAX_SAFE_INTEGER);
  if (entries.length === 0) return null;
  const leaves = entries.map((entry) => entry.entry_hash);
  const base: CheckpointBase = {
    tree_size: leaves.length,
    root_hash: merkleRoot(leaves),
    first_sequence: entries[0]!.sequence,
    last_sequence: entries[entries.length - 1]!.sequence,
    generated_at: input.generatedAt ?? new Date().toISOString(),
  };
  const rootDigest = digestHex("sha256", checkpointBase(base));
  const timestamp = input.tsa ? await input.tsa.timestamp(rootDigest) : null;
  const finalDigest = digestHex("sha256", canonicalize({ ...base, timestamp_token: timestamp }));
  const signature = signDigest(input.signer, finalDigest);
  return { ...base, signature, timestamp_token: timestamp };
}

export function verifyCheckpoint(checkpoint: GenesisCheckpoint): boolean {
  const base: CheckpointBase = {
    tree_size: checkpoint.tree_size,
    root_hash: checkpoint.root_hash,
    first_sequence: checkpoint.first_sequence,
    last_sequence: checkpoint.last_sequence,
    generated_at: checkpoint.generated_at,
  };
  const finalDigest = digestHex(
    "sha256",
    canonicalize({ ...base, timestamp_token: checkpoint.timestamp_token }),
  );
  return verifySignatureEnvelope(checkpoint.signature, finalDigest);
}
