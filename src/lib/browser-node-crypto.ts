type HashLike = {
  update: (value: string | Uint8Array) => HashLike;
  digest: (encoding?: string) => string | Uint8Array;
};
const unsupported = (name: string): never => {
  throw new Error(`${name} is server-only and cannot run in the browser.`);
};

export const randomUUID = (): string => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues)
    throw new Error("Secure browser randomness unavailable.");
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const randomBytes = (size: number): Uint8Array => {
  if (!Number.isInteger(size) || size < 0) throw new Error("Invalid random byte size.");
  const bytes = new Uint8Array(size);
  if (!globalThis.crypto?.getRandomValues)
    throw new Error("Secure browser randomness unavailable.");
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
};

export const createHash = (): HashLike => unsupported("createHash");
export const createHmac = (): HashLike => unsupported("createHmac");
export const createSign = (): never => unsupported("createSign");
export const createVerify = (): never => unsupported("createVerify");
export const createPublicKey = (): never => unsupported("createPublicKey");
export const generateKeyPairSync = (): never => unsupported("generateKeyPairSync");
export const createCipheriv = (): never => unsupported("createCipheriv");
export const createDecipheriv = (): never => unsupported("createDecipheriv");
export const hkdfSync = (): never => unsupported("hkdfSync");
export const sign = (): never => unsupported("sign");
export const verify = (): never => unsupported("verify");
export const timingSafeEqual = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
};
export class KeyObject {}
