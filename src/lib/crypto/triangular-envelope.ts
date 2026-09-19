import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

export interface KmsEnvelope {
  version: "tri-envelope-v1";
  keyId: string;
  tenantBinding: string;
  nonce: string;
  ciphertext: string;
  tag: string;
  wrappedDek: string;
  checksum: string;
}

export interface EnvelopeKms {
  wrapKey(keyId: string, dek: Buffer): Promise<string>;
  unwrapKey(keyId: string, wrappedDek: string): Promise<Buffer>;
}

function b64(value: Buffer): string {
  return value.toString("base64url");
}
function fromB64(value: string): Buffer {
  return Buffer.from(value, "base64url");
}
function binding(tenantId: string, purpose: string): string {
  if (!tenantId || !purpose || tenantId.length > 160 || purpose.length > 120)
    throw new Error("invalid_crypto_binding");
  return createHash("sha256").update(`isabella|${tenantId}|${purpose}`).digest("hex");
}

export async function encryptTriangularEnvelope(
  plaintext: string,
  input: { tenantId: string; purpose: string; keyId: string },
  kms: EnvelopeKms,
): Promise<KmsEnvelope> {
  if (typeof plaintext !== "string" || plaintext.length > 2_000_000)
    throw new Error("invalid_plaintext");
  const tenantBinding = binding(input.tenantId, input.purpose);
  const dek = randomBytes(32);
  const nonce = randomBytes(12);
  const aad = Buffer.from(`tri-envelope-v1|${input.keyId}|${tenantBinding}`);
  const cipher = createCipheriv("aes-256-gcm", dek, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const wrappedDek = await kms.wrapKey(input.keyId, dek);
  const checksum = createHash("sha256")
    .update(Buffer.concat([aad, nonce, ciphertext, tag, Buffer.from(wrappedDek)]))
    .digest("hex");
  return {
    version: "tri-envelope-v1",
    keyId: input.keyId,
    tenantBinding,
    nonce: b64(nonce),
    ciphertext: b64(ciphertext),
    tag: b64(tag),
    wrappedDek,
    checksum,
  };
}

export async function decryptTriangularEnvelope(
  envelope: KmsEnvelope,
  input: { tenantId: string; purpose: string },
  kms: EnvelopeKms,
): Promise<string> {
  if (envelope.version !== "tri-envelope-v1") throw new Error("unsupported_envelope_version");
  const expectedBinding = binding(input.tenantId, input.purpose);
  if (envelope.tenantBinding !== expectedBinding) throw new Error("tenant_binding_mismatch");
  const aad = Buffer.from(`tri-envelope-v1|${envelope.keyId}|${expectedBinding}`);
  const nonce = fromB64(envelope.nonce);
  const ciphertext = fromB64(envelope.ciphertext);
  const tag = fromB64(envelope.tag);
  const expectedChecksum = createHash("sha256")
    .update(Buffer.concat([aad, nonce, ciphertext, tag, Buffer.from(envelope.wrappedDek)]))
    .digest("hex");
  if (expectedChecksum !== envelope.checksum) throw new Error("envelope_checksum_failed");
  const dek = await kms.unwrapKey(envelope.keyId, envelope.wrappedDek);
  if (dek.length !== 32 || nonce.length !== 12 || tag.length !== 16)
    throw new Error("invalid_envelope_shape");
  const decipher = createDecipheriv("aes-256-gcm", dek, nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function deriveLocalKmsKey(master: Buffer, keyId: string): Buffer {
  if (master.length < 32) throw new Error("kms_master_too_short");
  return Buffer.from(hkdfSync("sha256", master, "", `isabella-triangular-kms-v1|${keyId}`, 32));
}
