/**
 * BOOKPI SIGNER (src/lib/crypto/bookpi-signer.ts)
 * -----------------------------------------------------------------
 * Autoridad criptográfica del ledger. Separa: hashing, firma, verificación
 * y gestión de claves (§6.5 del manual de reparación).
 *
 * Regla §6.4: el runtime SIEMPRE respeta `BOOKPI_SIGNATURE_ALGORITHM` de
 * `env-schema`. Nunca ejecuta un algoritmo distinto al configurado.
 *
 * Regla §17: `ML-DSA-87` en este runtime es SIMULATION-ONLY (telemetría/tests).
 * En producción/staging NUNCA es autoridad criptográfica: firmar o verificar
 * con ese algoritmo en modo no-local aborta (fail-closed).
 *
 * Regla §6.6: en producción NO se insertan bloques sin firma ni con firma
 * inválida.
 */
import { createSign, createVerify, createHash } from "node:crypto";
import { config } from "../config";

export type BookPiSignatureAlgorithm = "ML-DSA-87" | "ECDSA-P384" | "RSA-SHA256";

/** Algoritmo canónico declarado en la configuración. */
export function getSigningAlgorithm(): BookPiSignatureAlgorithm {
  const cfg = config();
  return cfg.BOOKPI_SIGNATURE_ALGORITHM as BookPiSignatureAlgorithm;
}

/** ML-DSA-87 es simulación (telemetría/test). Nunca autoridad en producción. */
export function isSimulatedAlgorithm(algorithm: BookPiSignatureAlgorithm = getSigningAlgorithm()): boolean {
  return algorithm === "ML-DSA-87";
}

function isProductionRuntime(): boolean {
  const cfg = config();
  return cfg.ISABELLA_RUNTIME_MODE === "production" || cfg.ISABELLA_RUNTIME_MODE === "staging";
}

function digestFor(algorithm: BookPiSignatureAlgorithm): string {
  switch (algorithm) {
    case "ECDSA-P384":
      return "sha384";
    case "RSA-SHA256":
      return "RSA-SHA256";
    case "ML-DSA-87":
      return "sha256";
  }
}

function resolveKey(algorithm: BookPiSignatureAlgorithm): string {
  const cfg = config();
  const key = cfg.BOOKPI_SIGNING_KEY;
  if (!key) {
    throw new Error(
      "CRITICAL_SECURITY_ERROR: BOOKPI_SIGNING_KEY is missing. The Sovereign BookPI Ledger requires a valid signing key.",
    );
  }
  if (isSimulatedAlgorithm(algorithm)) {
    // Simulación: se usa la clave solo de forma determinista para telemetría.
    return key;
  }
  return key;
}

/**
 * Firma el blockHash con el algoritmo configurado. Lanza si:
 *  - algoritmo simulado (ML-DSA-87) en producción/staging (§17),
 *  - la clave no es compatible con el algoritmo,
 *  - la operación criptográfica falla.
 * Nunca devuelve `null` silenciosamente (§6.6).
 */
export function signBlockHash(blockHash: string): string {
  const algorithm = getSigningAlgorithm();
  if (isSimulatedAlgorithm(algorithm) && isProductionRuntime()) {
    throw new Error(
      "CRITICAL_SECURITY_ERROR: ML-DSA-87 es simulación y no puede firmar en producción. Usa ECDSA-P384 o RSA-SHA256.",
    );
  }
  const key = resolveKey(algorithm);
  const signer = createSign(digestFor(algorithm));
  signer.update(blockHash);
  signer.end();
  // `sign(key, "base64")` acepta la clave privada PEM directamente.
  return signer.sign(key, "base64");
}

/**
 * Verifica una firma del blockHash. En producción/staging un bloque con
 * algoritmo simulado se rechaza siempre (§17). Devuelve false ante cualquier
 * discrepancia (algoritmo desconocido, clave inválida, firma corrupta).
 */
export function verifyBlockSignature(blockHash: string, signature: string | null | undefined): boolean {
  if (!signature) return false;
  const algorithm = getSigningAlgorithm();
  if (isSimulatedAlgorithm(algorithm) && isProductionRuntime()) {
    return false;
  }
  try {
    const key = resolveKey(algorithm);
    const verifier = createVerify(digestFor(algorithm));
    verifier.update(blockHash);
    verifier.end();
    return verifier.verify(key, signature, "base64");
  } catch {
    return false;
  }
}

/** SHA-256 hexadecimal (canonical hashing del payload). */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}