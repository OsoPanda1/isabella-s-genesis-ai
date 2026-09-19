/**
 * NCUA — representaciones continuas por hashing de n-gramas de bytes.
 * Embeddings densos sin tokens, basados en el truco de hashing (Vowpal
 * Wabbit / fastText): cada n-grama de bytes se proyecta a un índice del
 * espacio y un signo deterministas. O(gramas), sin vocabulario, sin OOV,
 * determinista entre máquinas.
 */

import { encodeUtf8, fnv1a, fnv1aString } from "./bytes";

export interface EmbedOptions {
  dim?: number;
  minN?: number;
  maxN?: number;
  normalize?: boolean;
}

export const DEFAULT_DIM = 192;

export interface SparseCount {
  index: number;
  weight: number;
}

export function embedBytes(bytes: Uint8Array, options: EmbedOptions = {}): Float64Array {
  const dim = options.dim ?? DEFAULT_DIM;
  const minN = options.minN ?? 2;
  const maxN = options.maxN ?? 4;
  const vector = new Float64Array(dim);
  const padded = new Uint8Array(bytes.length + 2);
  padded[0] = 0x00;
  padded.set(bytes, 1);
  padded[padded.length - 1] = 0x00;

  for (let n = minN; n <= maxN; n += 1) {
    for (let start = 0; start + n <= padded.length; start += 1) {
      const gram = padded.subarray(start, start + n);
      const hash = fnv1a(gram);
      const index = hash % dim;
      const sign = (hash >>> 8) & 1 ? 1 : -1;
      vector[index] += sign;
    }
  }

  if (options.normalize ?? true) {
    normalizeInPlace(vector);
  }
  return vector;
}

export function embed(text: string, options: EmbedOptions = {}): Float64Array {
  return embedBytes(encodeUtf8(text), options);
}

export function normalize(vector: Float64Array): Float64Array {
  const norm = magnitude(vector);
  if (norm === 0) return vector;
  const out = new Float64Array(vector.length);
  for (let index = 0; index < vector.length; index += 1) {
    out[index] = (vector[index] as number) / norm;
  }
  return out;
}

export function normalizeInPlace(vector: Float64Array): Float64Array {
  const norm = magnitude(vector);
  if (norm === 0) return vector;
  for (let index = 0; index < vector.length; index += 1) {
    vector[index] = (vector[index] as number) / norm;
  }
  return vector;
}

export function magnitude(vector: Float64Array): number {
  let sum = 0;
  for (let index = 0; index < vector.length; index += 1) {
    const value = vector[index] as number;
    sum += value * value;
  }
  return Math.sqrt(sum);
}

export function dot(a: Float64Array, b: Float64Array): number {
  const length = Math.min(a.length, b.length);
  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    sum += (a[index] as number) * (b[index] as number);
  }
  return sum;
}

export function cosine(a: Float64Array, b: Float64Array): number {
  const denominator = magnitude(a) * magnitude(b);
  if (denominator === 0) return 0;
  return dot(a, b) / denominator;
}

export interface SimHashSignature {
  bits: number;
  words: Uint32Array;
}

export function simHash(vector: Float64Array, bits = 64): SimHashSignature {
  const wordsCount = Math.ceil(bits / 32);
  const words = new Uint32Array(wordsCount);
  const signCache = new Map<string, number>();
  const signAt = (index: number, bit: number): number => {
    const key = `${index}|${bit}`;
    const cached = signCache.get(key);
    if (cached !== undefined) return cached;
    const value = (fnv1aString(key) & 1 ? 1 : -1) as number;
    signCache.set(key, value);
    return value;
  };

  for (let bit = 0; bit < bits; bit += 1) {
    let sum = 0;
    for (let index = 0; index < vector.length; index += 1) {
      sum += (vector[index] as number) * signAt(index, bit);
    }
    const wordIndex = Math.floor(bit / 32);
    const wordOffset = bit % 32;
    if (sum > 0) words[wordIndex] |= 1 << wordOffset;
  }
  return { bits, words };
}

export function hammingDistance(a: SimHashSignature, b: SimHashSignature): number {
  let distance = 0;
  const length = Math.min(a.words.length, b.words.length);
  for (let index = 0; index < length; index += 1) {
    let x = (a.words[index] as number) ^ (b.words[index] as number);
    while (x !== 0) {
      distance += 1;
      x &= x - 1;
    }
  }
  return distance;
}

export interface LatentChunk {
  chunkIndex: number;
  startByte: number;
  rawChunk: Uint8Array;
  vector: Float64Array;
}

export interface LatentEncodeResult {
  chunks: LatentChunk[];
  latentDim: number;
  chunkSize: number;
  numChunks: number;
  totalBytes: number;
  bytesPerChunk: number;
}

export function compressBytesToLatent(
  bytes: Uint8Array,
  options: { chunkSize?: number; dim?: number } = {},
): LatentEncodeResult {
  const chunkSize = options.chunkSize ?? 32;
  const dim = options.dim ?? DEFAULT_DIM;
  const totalBytes = bytes.length;
  const rawChunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    rawChunks.push(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  const chunks: LatentChunk[] = rawChunks.map((rawChunk, chunkIndex) => ({
    chunkIndex,
    startByte: chunkIndex * chunkSize,
    rawChunk,
    vector: embedBytes(rawChunk, { dim }),
  }));
  return {
    chunks,
    latentDim: dim,
    chunkSize,
    numChunks: chunks.length,
    totalBytes,
    bytesPerChunk: totalBytes / Math.max(1, chunks.length),
  };
}

export function compressToLatent(
  text: string,
  options: { chunkSize?: number; dim?: number } = {},
): LatentEncodeResult {
  return compressBytesToLatent(encodeUtf8(text), options);
}

export function sparseCountsOf(text: string, options: EmbedOptions = {}): SparseCount[] {
  const bytes = encodeUtf8(text);
  const dim = options.dim ?? DEFAULT_DIM;
  const counts = new Map<number, number>();
  for (let start = 0; start + 2 <= bytes.length; start += 1) {
    const gram = bytes.subarray(start, start + 2);
    const hash = fnv1a(gram);
    const index = hash % dim;
    const sign = (hash >>> 8) & 1 ? 1 : -1;
    counts.set(index, (counts.get(index) ?? 0) + sign);
  }
  return Array.from(counts.entries(), ([index, weight]) => ({ index, weight }));
}
