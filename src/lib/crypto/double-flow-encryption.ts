import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const VERSION = "isabella-double-flow-v1";
const PBKDF2_ITERATIONS = 120_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface EncryptedEnvelope {
  version: typeof VERSION;
  algorithm: "aes-256-gcm" | "chacha20-poly1305";
  salt: string;
  iv: string;
  ciphertext: string;
  tag: string;
  mac: string;
}

function deriveKeys(secret: string, salt: Buffer): { encryption: Buffer; mac: Buffer } {
  if (secret.length < 32) throw new Error("encryption_secret_too_short");
  const material = pbkdf2Sync(secret, salt, PBKDF2_ITERATIONS, 64, "sha512");
  return { encryption: material.subarray(0, 32), mac: material.subarray(32) };
}

function encrypt(
  plaintext: string,
  secret: string,
  algorithm: EncryptedEnvelope["algorithm"],
): EncryptedEnvelope {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const keys = deriveKeys(secret, salt);
  const cipher = createCipheriv(algorithm, keys.encryption, iv) as ReturnType<
    typeof createCipheriv
  > & {
    setAAD: (aad: Buffer) => void;
    getAuthTag: () => Buffer;
  };
  cipher.setAAD(Buffer.from(VERSION));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const macInput = Buffer.concat([Buffer.from(VERSION), salt, iv, ciphertext, tag]);
  const mac = createHmac("sha256", keys.mac).update(macInput).digest();
  return {
    version: VERSION,
    algorithm,
    salt: salt.toString("base64url"),
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: tag.toString("base64url"),
    mac: mac.toString("base64url"),
  };
}

function decrypt(envelope: EncryptedEnvelope, secret: string): string {
  if (envelope.version !== VERSION) throw new Error("unsupported_envelope_version");
  const salt = Buffer.from(envelope.salt, "base64url");
  const iv = Buffer.from(envelope.iv, "base64url");
  const ciphertext = Buffer.from(envelope.ciphertext, "base64url");
  const tag = Buffer.from(envelope.tag, "base64url");
  const suppliedMac = Buffer.from(envelope.mac, "base64url");
  const keys = deriveKeys(secret, salt);
  const expectedMac = createHmac("sha256", keys.mac)
    .update(Buffer.concat([Buffer.from(VERSION), salt, iv, ciphertext, tag]))
    .digest();
  if (suppliedMac.length !== expectedMac.length || !timingSafeEqual(suppliedMac, expectedMac)) {
    throw new Error("envelope_integrity_failed");
  }
  const decipher = createDecipheriv(envelope.algorithm, keys.encryption, iv) as ReturnType<
    typeof createDecipheriv
  > & {
    setAAD: (aad: Buffer) => void;
    setAuthTag: (authTag: Buffer) => void;
  };
  decipher.setAAD(Buffer.from(VERSION));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function encryptFlow1(plaintext: string, secret: string): EncryptedEnvelope {
  return encrypt(plaintext, secret, "aes-256-gcm");
}

export function decryptFlow1(envelope: EncryptedEnvelope, secret: string): string {
  if (envelope.algorithm !== "aes-256-gcm") throw new Error("wrong_flow_algorithm");
  return decrypt(envelope, secret);
}

export function encryptFlow2(plaintext: string, secret: string): EncryptedEnvelope {
  return encrypt(plaintext, secret, "chacha20-poly1305");
}

export function decryptFlow2(envelope: EncryptedEnvelope, secret: string): string {
  if (envelope.algorithm !== "chacha20-poly1305") throw new Error("wrong_flow_algorithm");
  return decrypt(envelope, secret);
}
