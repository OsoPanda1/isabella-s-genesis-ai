/**
 * IGDS — Contratos canónicos (src/lib/igds/types.ts)
 * -----------------------------------------------------------------
 * El manifiesto es el modelo conceptual C2PA de Isabella (JSON), NO un
 * contenedor C2PA/CBOR interoperable. El manifiesto se firma; el bundle de
 * verificación permite validarlo offline.
 */
import type { ContentDigest, DigestAlgorithm } from "./digests";
import type { SealProfile } from "./profiles";
import type { SignatureEnvelope } from "./keys";

export const IGDS_MANIFEST_FORMAT = "c2pa" as const;
export const IGDS_MANIFEST_ID_PREFIX = "urn:isabella:manifest:" as const;
export const IGDS_SEAL_LABEL = "ISABELLA-GENESIS-SEAL" as const;

export type IgdsActionName =
  | "created"
  | "generated"
  | "edited"
  | "translated"
  | "upscaled"
  | "inpainted"
  | "dubbed"
  | "captioned"
  | "rendered"
  | "reviewed"
  | "approved"
  | "published"
  | "sealed";

export const IGDS_ACTION_NAMES = [
  "created",
  "generated",
  "edited",
  "translated",
  "upscaled",
  "inpainted",
  "dubbed",
  "captioned",
  "rendered",
  "reviewed",
  "approved",
  "published",
  "sealed",
] as const satisfies readonly IgdsActionName[];

export interface IgdsAction {
  action: IgdsActionName;
  when: string;
}

export interface IgdsSource {
  id: string;
  type: "web" | "document" | "model" | "human" | "dataset";
  locator?: string;
  retrieved_at?: string;
  digest?: string;
}

export interface IgdsAiDeclaration {
  ai_generated: boolean;
  ai_assisted: boolean;
  human_modified: boolean;
  human_reviewed: boolean;
}

export interface IgdsDocumentAssertion {
  title: string;
  mime_type: string;
  language: string;
  page_count?: number;
  byte_size?: number;
}

export interface IgdsGenerationAssertion {
  system: string;
  skill: string;
  model_family?: string;
  declaration: IgdsAiDeclaration;
}

export interface IgdsSoftBindingAssertion {
  algorithm: string;
  identifier: string;
  watermark_version: string;
}

export interface IgdsClaim {
  claim_generator: string;
  instance_id: string;
  created: string;
  assertion_references: string[];
  content_binding: {
    algorithm: DigestAlgorithm;
    asset_hash: string;
  };
}

export interface IgdsManifest {
  manifest_id: string;
  format: typeof IGDS_MANIFEST_FORMAT;
  profile: SealProfile;
  claim: IgdsClaim;
  assertions: Array<{ label: string; data: unknown }>;
  previous_manifests?: string[];
  signatures?: SignatureEnvelope[];
  timestamp?: TimestampToken | null;
}

export interface TimestampToken {
  protocol: "RFC3161";
  status: "granted";
  policy: string;
  gen_time: string;
  serial_number: string;
  message_imprint: ContentDigest;
  tsa_certificate_chain: string[];
  encoded_timestamp_token: string;
}

export type GenesisEntryType = "seal" | "revocation";
export type RevocationScope =
  "all_signatures_after_effective_at" | "target_only" | "all_target_versions";

export interface GenesisRevocationPayload {
  revocation_id: string;
  target_type: RevocationTargetType;
  target_id: string;
  effective_at: string;
  reason: RevocationReason;
  scope: RevocationScope;
  issued_by: string;
}

export interface GenesisEntry {
  sequence: number;
  entry_id: string;
  type: GenesisEntryType;
  document_id: string;
  document_digest: string;
  manifest_digest: string;
  previous_entry_hash: string;
  created_at: string;
  entry_hash: string;
  signature: SignatureEnvelope;
  revocation?: GenesisRevocationPayload;
}

export interface GenesisCheckpoint {
  tree_size: number;
  root_hash: string;
  first_sequence: number;
  last_sequence: number;
  generated_at: string;
  signature: SignatureEnvelope;
  timestamp_token: TimestampToken | null;
}

export type RevocationTargetType =
  | "signing_key"
  | "manifest"
  | "document"
  | "genesis_entry"
  | "watermark_profile"
  | "trust_source"
  | "certificate"
  | "tsa_certificate";

export type RevocationReason =
  | "key_compromise"
  | "key_loss"
  | "unauthorized_use"
  | "operator_request"
  | "algorithm_deprecation"
  | "certificate_misissuance"
  | "tsa_compromise"
  | "document_withdrawn"
  | "policy_violation";

export interface RevocationRecord {
  type: "revocation";
  revocation_id: string;
  target_type: RevocationTargetType;
  target_id: string;
  effective_at: string;
  reason: RevocationReason;
  scope: "all_signatures_after_effective_at" | "target_only" | "all_target_versions";
  issued_by: string;
  previous_entry_hash: string;
  entry_hash: string;
  signature: SignatureEnvelope;
}

export type TrustStatus =
  | "valid"
  | "valid_at_signing_time"
  | "revoked_before_signing"
  | "revoked_after_signing"
  | "unknown_revocation_status"
  | "invalid_signature"
  | "timestamp_untrusted";

export interface IgdsSeal {
  seal_label: typeof IGDS_SEAL_LABEL;
  seal_id: string;
  profile: SealProfile;
  issued: string;
  hash_algorithms: DigestAlgorithm[];
  signature_algorithms: string[];
  registry: "Isabella Genesis";
  instruction: string;
}

export interface IgdsSealPackage {
  seal: IgdsSeal;
  manifest: IgdsManifest;
  entry: GenesisEntry;
}

export interface IgdsVerificationReport {
  document_status: TrustStatus;
  current_key_status: "valid" | "revoked" | "unknown";
  profile: SealProfile;
  content_digest: ContentDigest;
  signatures: Array<{
    algorithm: string;
    key_id: string;
    valid: boolean;
    signed_digest_matches: boolean;
  }>;
  timestamp: {
    protocol: "RFC3161";
    message_imprint_matches: boolean;
    tsa_signature_valid: boolean;
    generation_time: string;
    tsa_certificate_status: "valid_at_timestamp" | "untrusted" | "missing";
  } | null;
  genesis: {
    included: boolean;
    inclusion_proof_valid: boolean;
    checkpoint_signature_valid: boolean;
  };
  interpretation: string;
}
