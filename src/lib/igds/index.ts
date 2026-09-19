/**
 * IGDS — Isabella Genesis Document Seal (src/lib/igds/index.ts)
 * -----------------------------------------------------------------
 * Sello documental verificable: canonicalización JCS, digests SHA-256/SHA3-256,
 * firmas Ed25519 (+ ML-DSA-65 enchufable), manifiesto conceptual C2PA, registro
 * Genesis append-only con árbol Merkle, checkpoints firmados, revocación y
 * verificación offline.
 *
 * Nota de honestidad técnica: el manifiesto JSON es el modelo conceptual de
 * Isabella, no un contenedor C2PA/CBOR interoperable. `ML-DSA-65` solo existe
 * si se registra un `PqcProvider` real.
 */
export * from "./canonical";
export * from "./digests";
export * from "./keys";
export * from "./profiles";
export * from "./manifest";
export * from "./merkle";
export * from "./registry";
export * from "./revocation";
export * from "./tsa";
export * from "./rfc3161";
export * from "./seal";
export * from "./verify";
export * from "./configured";
export * from "./types";
