/**
 * IGDS — Firmas (src/lib/igds/keys.ts)
 * -----------------------------------------------------------------
 * Autoridad criptográfica del sello:
 *  - Ed25519 REAL (node:crypto) como firma primaria.
 *  - ML-DSA-65 tras una interfaz enchufable (`PqcProvider`). El runtime no
 *    incluye primitivas poscuánticas: se registra un proveedor externo
 *    (KMS/HSM/wasm) y, si no existe, el perfil decide si el sello es válido.
 *
 * Regla: nunca se declara una firma ML-DSA si no hubo un proveedor real.
 */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
  type KeyObject,
} from "node:crypto";
import { digestHex } from "./digests";

export const SEAL_SIGNATURE_ALGORITHMS = ["Ed25519", "ML-DSA-65"] as const;
export type SealSignatureAlgorithm = (typeof SEAL_SIGNATURE_ALGORITHMS)[number];

export interface SealSigner {
  readonly algorithm: SealSignatureAlgorithm;
  readonly keyId: string;
  /** Clave pública en PEM (SPKI). */
  readonly publicKey: string;
  sign(data: Buffer): Buffer;
}

export interface PqcProvider {
  readonly algorithm: "ML-DSA-65";
  readonly keyId: string;
  readonly publicKey: string;
  sign(data: Buffer): Buffer;
  verify(data: Buffer, signature: Buffer): boolean;
}

let registeredPqcProvider: PqcProvider | null = null;

/**
 * Registra el proveedor poscuántico real. Es el ÚNICO punto donde se habilita
 * ML-DSA-65; sin él, ningún sello puede afirmar firma poscuántica.
 */
export function registerPqcProvider(provider: PqcProvider | null): void {
  registeredPqcProvider = provider;
}

export function getPqcProvider(): PqcProvider | null {
  return registeredPqcProvider;
}

/** Exporta una clave pública a PEM SPKI (los tipos de Node restringen export()). */
export function exportPublicKeyPem(key: KeyObject): string {
  const exportable = key as unknown as {
    export(options: { format: "pem"; type: "spki" }): string | Buffer;
  };
  const exported = exportable.export({ format: "pem", type: "spki" });
  return Buffer.isBuffer(exported) ? exported.toString("utf8") : exported;
}

function toPrivateKey(source: KeyObject | string): KeyObject {
  return typeof source === "string" ? createPrivateKey(source) : source;
}

function toPublicKey(source: KeyObject | string): KeyObject {
  return typeof source === "string" ? createPublicKey(source) : source;
}

export function generateEd25519KeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const exportable = privateKey as unknown as {
    export(options: { format: "pem"; type: "pkcs8" }): string | Buffer;
  };
  const exported = exportable.export({ format: "pem", type: "pkcs8" });
  const privateKeyPem = Buffer.isBuffer(exported) ? exported.toString("utf8") : exported;
  return { privateKeyPem, publicKeyPem: exportPublicKeyPem(publicKey) };
}

/** Huella estable de una clave pública (útil como identificador corto). */
export function fingerprintPublicKey(publicKeyPem: string): string {
  const normalized = publicKeyPem.replace(/\r\n/g, "\n").trim();
  return digestHex("sha256", normalized);
}

export function createEd25519Signer(options: {
  privateKeyPem: KeyObject | string;
  keyId: string;
  publicKeyPem?: string;
}): SealSigner {
  const privateKey = toPrivateKey(options.privateKeyPem);
  const publicKey = options.publicKeyPem ?? exportPublicKeyPem(createPublicKey(privateKey));
  return {
    algorithm: "Ed25519",
    keyId: options.keyId,
    publicKey,
    sign(data: Buffer): Buffer {
      return nodeSign(null, data, privateKey);
    },
  };
}

/** Verificación Ed25519 real. Devuelve `false` ante cualquier discrepancia. */
export function verifyEd25519(publicKeyPem: string, data: Buffer, signature: Buffer): boolean {
  try {
    return nodeVerify(null, data, toPublicKey(publicKeyPem), signature);
  } catch {
    return false;
  }
}

export interface SignatureEnvelope {
  algorithm: SealSignatureAlgorithm;
  key_id: string;
  public_key: string;
  /** base64 (estándar, no url). */
  value: string;
  signed_digest: string;
}

/** Firma un digest canónico y devuelve el sobre listo para el manifiesto. */
export function signDigest(signer: SealSigner, digestValue: string): SignatureEnvelope {
  const data = Buffer.from(digestValue, "utf8");
  const signature = signer.sign(data);
  return {
    algorithm: signer.algorithm,
    key_id: signer.keyId,
    public_key: signer.publicKey,
    value: signature.toString("base64"),
    signed_digest: digestValue,
  };
}

/**
 * Verifica un sobre de firma contra el digest esperado. `signed_digest` debe
 * coincidir exactamente con el digest calculado; nunca se confía en el sobre.
 */
export function verifySignatureEnvelope(
  envelope: SignatureEnvelope,
  expectedDigest: string,
): boolean {
  if (envelope.signed_digest !== expectedDigest) return false;
  const data = Buffer.from(expectedDigest, "utf8");
  let signature: Buffer;
  try {
    signature = Buffer.from(envelope.value, "base64");
  } catch {
    return false;
  }
  if (signature.length === 0) return false;

  if (envelope.algorithm === "Ed25519") {
    return verifyEd25519(envelope.public_key, data, signature);
  }
  const provider = registeredPqcProvider;
  if (!provider || provider.keyId !== envelope.key_id) return false;
  return provider.verify(data, signature);
}

export function sha3Fingerprint(input: string): string {
  return createHash("sha3-256").update(input).digest("hex");
}
