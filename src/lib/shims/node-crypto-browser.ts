/**
 * Shim de `node:crypto` para el navegador.
 * ---------------------------------------------------------------------------
 * Varios módulos soberanos (config, aegis, security) importan `node:crypto` y
 * son alcanzados por el grafo del cliente a través de tipos y utilidades
 * compartidas. En el navegador, Vite externaliza `node:crypto` y cualquier
 * acceso a sus exportaciones lanza y deja la pantalla en blanco.
 *
 * Este shim implementa, con JavaScript puro y WebCrypto, el subconjunto que el
 * código del cliente puede llegar a evaluar: hashing SHA-256 síncrono, HMAC,
 * bytes aleatorios y UUID. No sustituye la criptografía del servidor: en el
 * runtime de servidor se sigue usando `node:crypto` real.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256(bytes: Uint8Array): Uint8Array {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const bitLen = bytes.length * 8;
  const padded = new Uint8Array((((bytes.length + 9) >> 6) + 1) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  new DataView(padded.buffer).setUint32(padded.length - 4, bitLen >>> 0, false);
  new DataView(padded.buffer).setUint32(padded.length - 8, Math.floor(bitLen / 2 ** 32), false);

  const w = new Uint32Array(64);
  const view = new DataView(padded.buffer);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i], false);
  return out;
}

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

function toBytes(input: string | Uint8Array | ArrayBuffer): Uint8Array {
  if (typeof input === "string") return new TextEncoder().encode(input);
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

class Hash {
  private chunks: Uint8Array[] = [];
  update(data: string | Uint8Array | ArrayBuffer): Hash {
    this.chunks.push(toBytes(data));
    return this;
  }
  digest(encoding?: "hex" | "base64"): string | Uint8Array {
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      joined.set(chunk, offset);
      offset += chunk.length;
    }
    const digest = sha256(joined);
    if (encoding === "hex") return toHex(digest);
    if (encoding === "base64") return toBase64(digest);
    return digest;
  }
}

export function createHash(_algorithm: string): Hash {
  return new Hash();
}

export function createHmac(_algorithm: string, key: string | Uint8Array): Hash {
  const hash = new Hash();
  hash.update(toBytes(key));
  return hash;
}

export function randomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function randomUUID(): string {
  return globalThis.crypto.randomUUID();
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export const webcrypto = globalThis.crypto;
export const subtle = globalThis.crypto.subtle;

export default {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
  webcrypto,
  subtle,
};

/**
 * Operaciones asimétricas y de cifrado simétrico: existen únicamente para que
 * el grafo del cliente pueda evaluarse. Cualquier invocación real pertenece al
 * servidor y falla de forma explícita (fail-closed), nunca en silencio.
 */
function serverOnly(name: string): never {
  throw new Error(
    `[crypto-shim] "${name}" es una operación exclusiva del servidor y no puede ejecutarse en el navegador.`,
  );
}

export function createPublicKey(..._args: unknown[]): never {
  return serverOnly("createPublicKey");
}
export function createPrivateKey(..._args: unknown[]): never {
  return serverOnly("createPrivateKey");
}
export function createSign(..._args: unknown[]): never {
  return serverOnly("createSign");
}
export function createVerify(..._args: unknown[]): never {
  return serverOnly("createVerify");
}
export function generateKeyPairSync(..._args: unknown[]): never {
  return serverOnly("generateKeyPairSync");
}
export function createCipheriv(..._args: unknown[]): never {
  return serverOnly("createCipheriv");
}
export function createDecipheriv(..._args: unknown[]): never {
  return serverOnly("createDecipheriv");
}
export function hkdfSync(..._args: unknown[]): never {
  return serverOnly("hkdfSync");
}
export function scryptSync(..._args: unknown[]): never {
  return serverOnly("scryptSync");
}
export function sign(..._args: unknown[]): never {
  return serverOnly("sign");
}
export function verify(..._args: unknown[]): never {
  return serverOnly("verify");
}
export function randomInt(min: number, max?: number): number {
  const lo = max === undefined ? 0 : min;
  const hi = max === undefined ? min : max;
  return lo + Math.floor((randomBytes(4)[0] / 256) * (hi - lo));
}
export class KeyObject {}
export const constants = {};
