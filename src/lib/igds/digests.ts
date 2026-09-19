/**
 * IGDS — Motor de digests (src/lib/igds/digests.ts)
 * -----------------------------------------------------------------
 * SHA-256 para interoperabilidad/C2PA y SHA3-256 para el perfil `long-term`.
 * Los digests se codifican siempre en hex minúscula para el registro Genesis y
 * en base64url cuando el protocolo externo lo exige (RFC 3161 / COSE).
 */
import { createHash } from "node:crypto";
import { canonicalizeBytes } from "./canonical";

export const DIGEST_ALGORITHMS = ["sha256", "sha3-256"] as const;
export type DigestAlgorithm = (typeof DIGEST_ALGORITHMS)[number];

export interface ContentDigest {
  algorithm: DigestAlgorithm;
  /** Hex minúscula. */
  value: string;
}

export function isDigestAlgorithm(value: string): value is DigestAlgorithm {
  return (DIGEST_ALGORITHMS as readonly string[]).includes(value);
}

export function digestBytes(algorithm: DigestAlgorithm, data: Buffer | string): Buffer {
  return createHash(algorithm).update(data).digest();
}

export function digestHex(algorithm: DigestAlgorithm, data: Buffer | string): string {
  return digestBytes(algorithm, data).toString("hex");
}

export function digestBase64Url(algorithm: DigestAlgorithm, data: Buffer | string): string {
  return digestBytes(algorithm, data).toString("base64url");
}

/** Digest canónico de una estructura JSON arbitraria (RFC 8785 + algoritmo). */
export function digestCanonical(algorithm: DigestAlgorithm, value: unknown): ContentDigest {
  return { algorithm, value: digestHex(algorithm, canonicalizeBytes(value)) };
}

/** Digest canónico de una estructura JSON arbitraria (RFC 8785 + algoritmo). */
export function digestCanonicalBytes(algorithm: DigestAlgorithm, value: unknown): Buffer {
  return digestBytes(algorithm, canonicalizeBytes(value));
}

/** Etiqueta estable para wiring entre manifiestos y bundles (`sha256:abc...`). */
export function formatDigest(digest: ContentDigest): string {
  return `${digest.algorithm}:${digest.value}`;
}

export function parseDigest(encoded: string): ContentDigest | null {
  const separator = encoded.indexOf(":");
  if (separator <= 0) return null;
  const algorithm = encoded.slice(0, separator);
  const value = encoded.slice(separator + 1);
  if (!isDigestAlgorithm(algorithm) || !/^[0-9a-f]+$/i.test(value)) return null;
  return { algorithm, value: value.toLowerCase() };
}
