/**
 * IGDS — Perfiles de sello (src/lib/igds/profiles.ts)
 * -----------------------------------------------------------------
 * Cada perfil fija algoritmos, obligatoriedad de timestamp, marca de agua y
 * política de retención. El motor de sellado NUNCA degrada un perfil en
 * silencio: si falta una capacidad requerida, el sello falla (fail-closed).
 */
import type { DigestAlgorithm } from "./digests";
import type { SealSignatureAlgorithm } from "./keys";

export const SEAL_PROFILES = ["internal", "public-verifiable", "long-term", "restricted"] as const;
export type SealProfile = (typeof SEAL_PROFILES)[number];

export interface SealProfileSpec {
  readonly id: SealProfile;
  readonly label: string;
  readonly hashAlgorithms: readonly DigestAlgorithm[];
  readonly signatureAlgorithms: readonly SealSignatureAlgorithm[];
  /** Exige firma ML-DSA-65 real (proveedor PQC registrado). */
  readonly requirePqc: boolean;
  /** Exige token RFC 3161 válido. */
  readonly requireTimestamp: boolean;
  /** Emite también un HMAC interno (AEGIS_AUDIT_SECRET). */
  readonly hmacRequired: boolean;
  /** Manifiesto compatible C2PA conceptual. */
  readonly c2pa: boolean;
  /** Checkpoint Merkle firmado. */
  readonly merkleCheckpoint: boolean;
  /** Bundle verificable sin acceso al escritor. */
  readonly offlineVerification: boolean;
  readonly watermark: "none" | "visible" | "per-recipient";
  readonly retentionYears: number | null;
}

export const SEAL_PROFILE_SPECS: Readonly<Record<SealProfile, SealProfileSpec>> = {
  internal: {
    id: "internal",
    label: "Interno",
    hashAlgorithms: ["sha256"],
    signatureAlgorithms: [],
    requirePqc: false,
    requireTimestamp: false,
    hmacRequired: true,
    c2pa: false,
    merkleCheckpoint: false,
    offlineVerification: false,
    watermark: "none",
    retentionYears: 1,
  },
  "public-verifiable": {
    id: "public-verifiable",
    label: "Público verificable",
    hashAlgorithms: ["sha256"],
    signatureAlgorithms: ["Ed25519"],
    requirePqc: false,
    requireTimestamp: true,
    hmacRequired: false,
    c2pa: true,
    merkleCheckpoint: true,
    offlineVerification: true,
    watermark: "visible",
    retentionYears: 7,
  },
  "long-term": {
    id: "long-term",
    label: "Largo plazo",
    hashAlgorithms: ["sha256", "sha3-256"],
    signatureAlgorithms: ["Ed25519", "ML-DSA-65"],
    requirePqc: true,
    requireTimestamp: true,
    hmacRequired: false,
    c2pa: true,
    merkleCheckpoint: true,
    offlineVerification: true,
    watermark: "visible",
    retentionYears: null,
  },
  restricted: {
    id: "restricted",
    label: "Restringido",
    hashAlgorithms: ["sha256"],
    signatureAlgorithms: ["Ed25519"],
    requirePqc: false,
    requireTimestamp: false,
    hmacRequired: false,
    c2pa: false,
    merkleCheckpoint: true,
    offlineVerification: true,
    watermark: "per-recipient",
    retentionYears: 5,
  },
};

export function isSealProfile(value: string): value is SealProfile {
  return (SEAL_PROFILES as readonly string[]).includes(value);
}

export function getSealProfileSpec(profile: SealProfile): SealProfileSpec {
  return SEAL_PROFILE_SPECS[profile];
}
