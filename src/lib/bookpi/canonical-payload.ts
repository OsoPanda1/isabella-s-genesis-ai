/**
 * BOOKPI CANONICAL PAYLOAD (src/lib/bookpi/canonical-payload.ts)
 * -----------------------------------------------------------------
 * Única función de serialización canónica de un bloque BookPI (§6.1).
 * Debe usarla TODA operación que calcule el hash: append(), verifyIntegrity(),
 * audit(), export(), reconciliation(), billing(), refund().
 *
 * Reglas §6.2/§6.3:
 *  - NO se hashcan campos mutables post-hash: `pqcSignature` y
 *    `signatureAlgorithm` JAMÁS entran al payload canónico. La firma se
 *    calcula SOBRE el hash (flujo: payload → SHA-256 → blockHash → firma).
 *  - El `timestamp` incluido es EXACTAMENTE el que se persiste en la fila.
 */
import type { BlockPIBlock } from "../repositories/bookpi-repository";

const canonicalFieldOrder = [
  "index",
  "timestamp",
  "tenantId",
  "userId",
  "operation",
  "category",
  "costDecimal",
  "tokensConsumed",
  "previousHash",
  "status",
  "nonce",
] as const;

/** Campos que NUNCA entran al hash (mutables/derivados tras el hash). */
const EXCLUDED_FIELDS = new Set(["blockHash", "pqcSignature", "signatureAlgorithm"]);

/**
 * Serializa un bloque al payload canónico determinista. Acepta el bloque
 * completo o el `Omit<BlockPIBlock, "blockHash">` usado antes de calcular el
 * hash, garantizando que append() y verifyIntegrity() producen el MISMO string.
 */
export function canonicalBookPiPayload(block: Partial<BlockPIBlock>): string {
  const parts: string[] = [];
  for (const field of canonicalFieldOrder) {
    if (EXCLUDED_FIELDS.has(field)) continue;
    const value = block[field];
    parts.push(value === undefined || value === null ? "" : String(value));
  }
  return parts.join("|");
}