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
 */
export class EnvKMSProvider implements KMSProvider {
  constructor(private readonly env: Record<string, string | undefined>) {}

  async getSecret(keyName: string): Promise<string | undefined> {
    // Intenta buscar versiones explícitas por rotación (v2, v1) si es necesario.
    // En Env, simplemente retorna el valor directo.
    return this.env[keyName];
  }

  async decrypt(keyName: string, ciphertext: string): Promise<string> {
    // Mock decrypt (En producción delegaría a AWS KMS o GCP KMS)
    // Para el entorno local, asumimos que el ciphertext es el secreto en claro, 
    // o usamos un cifrado AES simulado. 
    // El objetivo es obligar a usar el KMS.
    throw new Error("EnvKMSProvider no soporta descifrado asimétrico local. Use un KMS real en producción.");
  }

  async encrypt(keyName: string, plaintext: string): Promise<string> {
    throw new Error("EnvKMSProvider no soporta cifrado asimétrico local. Use un KMS real en producción.");
  }
}
