/**
 * NCUA — codificación nativa a nivel de bytes UTF-8.
 * Sin tokenizador: el alfabeto es B = {0..255}.
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: false });

export function encodeUtf8(input: string): Uint8Array {
  return textEncoder.encode(input);
}

export function decodeUtf8(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

export function isValidUtf8Roundtrip(input: string): boolean {
  const encoded = encodeUtf8(input);
  return decodeUtf8(encoded) === input;
}

export function byteLengthOf(input: string): number {
  return encodeUtf8(input).byteLength;
}

export function fnv1a(bytes: Uint8Array, seed = 2166136261): number {
  let hash = seed >>> 0;
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[index] as number;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

export function fnv1aString(input: string, seed = 2166136261): number {
  return fnv1a(encodeUtf8(input), seed);
}

const SENTINEL = 0x00;

export interface ByteNgramOptions {
  minN?: number;
  maxN?: number;
}

export function forEachByteNgram(
  bytes: Uint8Array,
  callback: (gram: Uint8Array, start: number) => void,
  options: ByteNgramOptions = {},
): number {
  const minN = options.minN ?? 2;
  const maxN = options.maxN ?? 4;
  const padded = new Uint8Array(bytes.length + 2);
  padded[0] = SENTINEL;
  padded.set(bytes, 1);
  padded[padded.length - 1] = SENTINEL;
  let count = 0;
  for (let n = minN; n <= maxN; n += 1) {
    for (let start = 0; start + n <= padded.length; start += 1) {
      const gram = padded.subarray(start, start + n);
      callback(gram, start);
      count += 1;
    }
  }
  return count;
}

export function ngramsOf(text: string, options: ByteNgramOptions = {}): number[] {
  const bytes = encodeUtf8(text);
  const hashes: number[] = [];
  forEachByteNgram(bytes, (gram) => hashes.push(fnv1a(gram)), options);
  return hashes;
}

export function chunkBytes(bytes: Uint8Array, chunkSize: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return chunks;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}
