/**
 * IGDS — Verificación offline (src/lib/igds/verify.ts)
 * -----------------------------------------------------------------
 * Verifica un `IgdsSealPackage` sin acceso al escritor: firma(s), digest final,
 * inclusión Merkle, checkpoint y estado de revocación. Nunca confía en la clave
 * pública embebida si se aporta un registro de claves de confianza.
 */
import { digestHex } from "./digests";
import type { ContentDigest } from "./digests";
import { manifestClaimDigest, manifestFinalDigest } from "./manifest";
import { verifySignatureEnvelope, type SignatureEnvelope } from "./keys";
import { computeEntryHash, verifyCheckpoint, GENESIS_PREVIOUS_HASH } from "./registry";
import { verifyInclusionProof, type InclusionProof } from "./merkle";
import { evaluateTrust } from "./revocation";
import type { TsaVerifier } from "./tsa";
import { getSealProfileSpec, type SealProfile } from "./profiles";
import type {
  GenesisCheckpoint,
  IgdsSealPackage,
  IgdsVerificationReport,
  RevocationScope,
} from "./types";
import { normalizeContent } from "./seal";

export interface VerifyOptions {
  /** Contenido original para recomputar el digest (si se dispone de él). */
  content?: string | Buffer | unknown;
  /** Claves públicas de confianza por `key_id` (rotación/desconfianza). */
  trustedPublicKeys?: Record<string, string>;
  inclusionProof?: InclusionProof;
  checkpoint?: GenesisCheckpoint;
  revocation?: { effective_at: string; scope: RevocationScope } | null;
  tsaVerifier?: TsaVerifier;
  /** Instante de firma conocido; por defecto el `gen_time` del token. */
  signatureTime?: string;
}

function envelopeWithTrust(
  envelope: SignatureEnvelope,
  trusted?: Record<string, string>,
): SignatureEnvelope {
  if (!trusted) return envelope;
  const publicKey = trusted[envelope.key_id];
  if (!publicKey) return { ...envelope, public_key: "" };
  return { ...envelope, public_key: publicKey };
}

export async function verifySealPackage(
  pkg: IgdsSealPackage,
  options: VerifyOptions = {},
): Promise<IgdsVerificationReport> {
  const { manifest, entry, seal } = pkg;
  const profile = (manifest.profile ?? seal.profile) as SealProfile;
  const spec = getSealProfileSpec(profile);

  const hashAlgorithm = spec.hashAlgorithms.includes("sha256") ? "sha256" : spec.hashAlgorithms[0]!;
  const finalDigest = manifestFinalDigest(manifest, hashAlgorithm);

  const signatures = (manifest.signatures ?? []).map((envelope) => {
    const valid = verifySignatureEnvelope(
      envelopeWithTrust(envelope, options.trustedPublicKeys),
      finalDigest,
    );
    return {
      algorithm: envelope.algorithm,
      key_id: envelope.key_id,
      valid,
      signed_digest_matches: envelope.signed_digest === finalDigest,
    };
  });
  const signatureValid = signatures.length > 0 && signatures.every((item) => item.valid);

  const contentDigest: ContentDigest = {
    algorithm: manifest.claim.content_binding.algorithm,
    value: manifest.claim.content_binding.asset_hash,
  };
  if (options.content !== undefined) {
    const recomputed = digestHex(contentDigest.algorithm, normalizeContent(options.content));
    contentDigest.value = recomputed;
  }

  const timestamp = manifest.timestamp ?? null;
  const claimDigest = manifestClaimDigest(manifest, hashAlgorithm);
  let timestampTrusted = timestamp === null && !spec.requireTimestamp;
  let timestampReport: IgdsVerificationReport["timestamp"] = null;
  if (timestamp) {
    const imprintMatches =
      timestamp.message_imprint.algorithm === hashAlgorithm &&
      timestamp.message_imprint.value === claimDigest;
    const tsaSignatureValid = options.tsaVerifier
      ? await options.tsaVerifier.verify(timestamp, claimDigest)
      : false;
    timestampTrusted = imprintMatches && tsaSignatureValid;
    timestampReport = {
      protocol: "RFC3161",
      message_imprint_matches: imprintMatches,
      tsa_signature_valid: tsaSignatureValid,
      generation_time: timestamp.gen_time,
      tsa_certificate_status: tsaSignatureValid ? "valid_at_timestamp" : "untrusted",
    };
  } else if (spec.requireTimestamp) {
    timestampTrusted = false;
  }

  const entryHashValid = computeEntryHash(entry) === entry.entry_hash;
  const manifestDigestBound = entry.manifest_digest === `sha256:${finalDigest}`;
  const inclusionProofValid = options.inclusionProof
    ? verifyInclusionProof(options.inclusionProof) &&
      options.inclusionProof.leaf_hash === entry.entry_hash &&
      (!options.checkpoint || options.checkpoint.root_hash === options.inclusionProof.root_hash)
    : false;
  const checkpointValid = options.checkpoint ? verifyCheckpoint(options.checkpoint) : false;

  const trust = evaluateTrust({
    signatureTime: options.signatureTime ?? timestamp?.gen_time ?? null,
    revocationEffectiveAt: options.revocation?.effective_at ?? null,
    scope: options.revocation?.scope ?? null,
    signatureValid,
    timestampTrusted,
  });

  return {
    document_status: trust.status,
    current_key_status: trust.currentKeyStatus,
    profile,
    content_digest: contentDigest,
    signatures,
    timestamp: timestampReport,
    genesis: {
      included: entryHashValid && manifestDigestBound,
      inclusion_proof_valid: inclusionProofValid,
      checkpoint_signature_valid: checkpointValid,
    },
    interpretation: buildInterpretation(trust.interpretation, entryHashValid, manifestDigestBound),
  };
}

function buildInterpretation(base: string, entryHashValid: boolean, bound: boolean): string {
  if (entryHashValid && bound) return base;
  if (!entryHashValid) return "La entrada Genesis fue alterada: el sello no es íntegro.";
  return "La entrada Genesis no está vinculada al manifiesto final.";
}

/** Verifica la cadena completa entre la entrada y el checkpoint (si existe). */
export function verifyEntryInclusion(
  entryHash: string,
  proof: InclusionProof,
  checkpoint?: GenesisCheckpoint,
): boolean {
  if (!verifyInclusionProof(proof)) return false;
  if (proof.leaf_hash !== entryHash) return false;
  if (checkpoint && checkpoint.root_hash !== proof.root_hash) return false;
  return true;
}

export function isGenesisEntryBound(pkg: IgdsSealPackage): boolean {
  return computeEntryHash(pkg.entry) === pkg.entry.entry_hash;
}

export const GENESIS_GENESIS_HASH = GENESIS_PREVIOUS_HASH;
