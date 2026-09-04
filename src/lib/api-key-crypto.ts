import * as crypto from "node:crypto";
import { secrets } from "./secrets";

/**
 * SERVICIO CRIPTOGRÁFICO DE API KEYS
 * Responsabilidad exclusiva: generación de entropía, hashing y verificación de firmas.
 */
export class ApiKeyCrypto {
  /**
   * Genera un prefijo corto de 8 caracteres para búsquedas e identificación de llave.
   */
  public static generatePrefix(): string {
    return crypto.randomBytes(4).toString("hex"); // 8 chars
  }

  /**
   * Genera un secreto aleatorio de alta entropía (32 bytes = 64 caracteres en hexadecimal)
   */
  public static generateSecret(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * Calcula un hash HMAC-SHA256 usando el secreto maestro centralizado.
   * Esto previene que una filtración de base de datos permita reconstruir las llaves.
   */
  public static hashSecret(secret: string): string {
    const masterKey = secrets.apiKeyHashSecret();
    return crypto.createHmac("sha256", masterKey).update(secret).digest("hex");
  }

  /**
   * Compara el secreto ingresado con el hash guardado de forma constante para evitar ataques de temporización (timing attacks).
   */
  public static verifySecret(secret: string, storedHash: string): boolean {
    const computedHash = this.hashSecret(secret);

    const computedBuf = Buffer.from(computedHash, "hex");
    const storedBuf = Buffer.from(storedHash, "hex");

    if (computedBuf.length !== storedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(computedBuf, storedBuf);
  }
}
