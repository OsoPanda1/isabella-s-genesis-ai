/**
 * IGDS — Árbol Merkle (src/lib/igds/merkle.ts)
 * -----------------------------------------------------------------
 * Construcción RFC 6962 (Certificate Transparency) sobre digests hex:
 *   leaf  = SHA-256(0x00 || valor)
 *   nodo  = SHA-256(0x01 || izquierda || derecha)
 *
 * Ofrece prueba de inclusión y prueba de consistencia, necesarias para
 * demostrar que el registro Genesis solo creció (anti-rollback) sin blockchain.
 */
import { createHash } from "node:crypto";

function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function bytesFromHex(hex: string): Buffer {
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error(`IGDS Merkle: hex inválido (${hex.slice(0, 16)}…)`);
  }
  return Buffer.from(hex, "hex");
}

export function hashLeaf(value: string): string {
  return sha256Hex(Buffer.concat([Buffer.from([0x00]), Buffer.from(value, "utf8")]));
}

export function hashNode(leftHex: string, rightHex: string): string {
  return sha256Hex(
    Buffer.concat([Buffer.from([0x01]), bytesFromHex(leftHex), bytesFromHex(rightHex)]),
  );
}

function largestPowerOfTwoLessThan(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

/** Merkle Tree Hash RFC 6962 sobre hojas ya hasheadas (`hashLeaf`). */
export function merkleRoot(leafHashes: readonly string[]): string {
  const n = leafHashes.length;
  if (n === 0) return sha256Hex(Buffer.alloc(0));
  if (n === 1) return leafHashes[0]!;
  const k = largestPowerOfTwoLessThan(n);
  return hashNode(merkleRoot(leafHashes.slice(0, k)), merkleRoot(leafHashes.slice(k)));
}

export interface InclusionStep {
  side: "left" | "right";
  hash: string;
}

export interface InclusionProof {
  leaf_hash: string;
  index: number;
  tree_size: number;
  root_hash: string;
  path: InclusionStep[];
}

function inclusionPath(leafHashes: readonly string[], index: number): InclusionStep[] {
  const n = leafHashes.length;
  if (n <= 1) return [];
  const k = largestPowerOfTwoLessThan(n);
  if (index < k) {
    const path = inclusionPath(leafHashes.slice(0, k), index);
    path.push({ side: "right", hash: merkleRoot(leafHashes.slice(k)) });
    return path;
  }
  const path = inclusionPath(leafHashes.slice(k), index - k);
  path.push({ side: "left", hash: merkleRoot(leafHashes.slice(0, k)) });
  return path;
}

export function buildInclusionProof(leafHashes: readonly string[], index: number): InclusionProof {
  if (index < 0 || index >= leafHashes.length) {
    throw new Error("IGDS Merkle: índice de inclusión fuera de rango.");
  }
  return {
    leaf_hash: leafHashes[index]!,
    index,
    tree_size: leafHashes.length,
    root_hash: merkleRoot(leafHashes),
    path: inclusionPath(leafHashes, index),
  };
}

export function verifyInclusionProof(proof: InclusionProof): boolean {
  if (proof.tree_size === 0) return false;
  let current = proof.leaf_hash;
  for (const step of proof.path) {
    current = step.side === "right" ? hashNode(current, step.hash) : hashNode(step.hash, current);
  }
  return current === proof.root_hash;
}

export interface ConsistencyProof {
  old_size: number;
  new_size: number;
  old_root: string;
  new_root: string;
  path: string[];
}

function subproof(m: number, leafHashes: readonly string[], complete: boolean): string[] {
  const n = leafHashes.length;
  if (m === n) return complete ? [] : [merkleRoot(leafHashes)];
  const k = largestPowerOfTwoLessThan(n);
  if (m <= k) {
    return [...subproof(m, leafHashes.slice(0, k), complete), merkleRoot(leafHashes.slice(k))];
  }
  return [...subproof(m - k, leafHashes.slice(k), false), merkleRoot(leafHashes.slice(0, k))];
}

export function buildConsistencyProof(
  previousLeafHashes: readonly string[],
  currentLeafHashes: readonly string[],
): ConsistencyProof {
  const oldSize = previousLeafHashes.length;
  const newSize = currentLeafHashes.length;
  if (oldSize > newSize) {
    throw new Error("IGDS Merkle: el árbol anterior es mayor que el actual.");
  }
  const prefixMatches = previousLeafHashes.every(
    (hash, index) => hash === currentLeafHashes[index],
  );
  if (!prefixMatches) {
    throw new Error("IGDS Merkle: el árbol actual no extiende al anterior (rollback detectado).");
  }
  return {
    old_size: oldSize,
    new_size: newSize,
    old_root: merkleRoot(previousLeafHashes),
    new_root: merkleRoot(currentLeafHashes),
    path: oldSize === 0 ? [] : subproof(oldSize, currentLeafHashes, true),
  };
}

/** Verificador de consistencia (algoritmo Trillian / RFC 6962-bis). */
export function verifyConsistencyProof(proof: ConsistencyProof): boolean {
  const { old_size: m, new_size: n } = proof;
  if (m > n) return false;
  if (m === n) return proof.path.length === 0 && proof.old_root === proof.new_root;
  if (m === 0) return proof.path.length === 0;

  let fn = m - 1;
  let sn = n - 1;
  while (fn % 2 === 1 && fn !== 0) {
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }

  let index = 0;
  let first: string;
  if (fn === 0) {
    first = proof.old_root;
  } else {
    if (proof.path.length === 0) return false;
    first = proof.path[0]!;
    index = 1;
  }

  let fr = first;
  let sr = first;
  for (; index < proof.path.length; index += 1) {
    const hash = proof.path[index]!;
    if (sn === 0) return false;
    if (fn % 2 === 1 || fn === sn) {
      fr = hashNode(hash, fr);
      sr = hashNode(hash, sr);
      while (fn !== 0 && fn % 2 === 0) {
        fn = Math.floor(fn / 2);
        sn = Math.floor(sn / 2);
      }
    } else {
      sr = hashNode(sr, hash);
    }
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }

  return fr === proof.old_root && sr === proof.new_root && sn === 0;
}
