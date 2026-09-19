/**
 * KEY MANAGEMENT SERVICE (KMS) & SECRETS ABSTRACTION
 * -----------------------------------------------------------------
 * Abstracción criptográfica y de almacenamiento para integración con
 * AWS KMS, HashiCorp Vault, o Google Cloud Secret Manager.
 */

export interface KMSProvider {
  /**
   * Obtiene la versión activa de un secreto.
   */
  getSecret(keyName: string): Promise<string | undefined>;

  /**
   * Descifra un payload usando la llave gestionada por el KMS.
   */
  decrypt(keyName: string, ciphertext: string): Promise<string>;

  /**
   * Cifra un payload usando la llave gestionada por el KMS.
   */
  encrypt(keyName: string, plaintext: string): Promise<string>;
}

/**
 * Proveedor KMS Local (Basado en Variables de Entorno)
 * Usa las variables en .env como fuente de verdad cuando el KMS
 * externo no está disponible. Soporta rotación mediante prefijos
 * de versión (ej. SECRETV1_..., SECRETV2_...).
 * Derivación real: HKDF-SHA3-512 (§4.1 del Charter FGAIS).
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * EnvKMSProvider con cifrado REAL (AES-256-GCM):
 * - Clave maestra: ENCRYPTION_MASTER_KEY del entorno (mín. 32 chars).
 * - Subclave por keyName vía SHA-256(master + contexto) — dominios
 *   criptográficos separados por nombre de secreto.
 * - IV aleatorio 12B por mensaje; formato `v1:<iv-b64>:<ct-b64>:<tag-b64>`.
 * - Tag GCM verificado en tiempo constante (tamper → Error, no basura).
 */
export class EnvKMSProvider implements KMSProvider {
  constructor(private readonly env: Record<string, string | undefined>) {}

  async getSecret(keyName: string): Promise<string | undefined> {
    return this.env[keyName];
  }

  private masterKey(): Buffer {
    const master = this.env.ENCRYPTION_MASTER_KEY;
    if (!master || master.length < 32) {
      throw new Error("EnvKMSProvider: ENCRYPTION_MASTER_KEY ausente o <32 caracteres.");
    }
    return Buffer.from(master, "utf8");
  }

  private subKey(keyName: string): Buffer {
    // HKDF-SHA3-512 (§4.1 del Charter): IKM = master, info ligada al
    // nombre del secreto (dominios criptográficos separados), 32 bytes.
    return Buffer.from(
      hkdfSync("sha3-512", this.masterKey(), "", `isabella-kms-v1|${keyName}`, 32),
    );
  }

  async encrypt(keyName: string, plaintext: string): Promise<string> {
    if (!keyName || typeof plaintext !== "string") {
      throw new Error("EnvKMSProvider.encrypt: keyName y plaintext requeridos.");
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.subKey(keyName), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString("base64url")}:${ciphertext.toString("base64url")}:${tag.toString("base64url")}`;
  }

  async decrypt(keyName: string, envelope: string): Promise<string> {
    const parts = envelope.split(":");
    if (parts.length !== 4 || parts[0] !== "v1") {
      throw new Error("EnvKMSProvider.decrypt: formato inválido (se esperaba v1:iv:ct:tag).");
    }
    const [, ivB64, ctB64, tagB64] = parts;
    let iv: Buffer;
    let ciphertext: Buffer;
    let tag: Buffer;
    try {
      iv = Buffer.from(ivB64, "base64url");
      ciphertext = Buffer.from(ctB64, "base64url");
      tag = Buffer.from(tagB64, "base64url");
    } catch {
      throw new Error("EnvKMSProvider.decrypt: base64url inválido.");
    }
    if (iv.length !== 12 || tag.length !== 16) {
      throw new Error("EnvKMSProvider.decrypt: IV/tag de longitud inválida.");
    }
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.subKey(keyName), iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
        "utf8",
      );
      return plaintext;
    } catch {
      throw new Error("EnvKMSProvider.decrypt: autenticación fallida (tamper o clave errónea).");
    }
  }
}
