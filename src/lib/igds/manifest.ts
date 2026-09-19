/**
 * IGDS — Manifiesto (src/lib/igds/manifest.ts)
 * -----------------------------------------------------------------
 * Construye y valida el manifiesto conceptual C2PA de Isabella. El orden de
 * sellado es estricto:
 *   1. manifiesto base (sin firma ni timestamp)
 *   2. digest base → token RFC 3161
 *   3. manifiesto final (con timestamp)
 *   4. digest final → firma
 * El digest final es el que se registra en Genesis.
 */
import { z } from "zod";
import { digestHex } from "./digests";
import type { ContentDigest, DigestAlgorithm } from "./digests";
import { canonicalize } from "./canonical";
import type { SealProfile } from "./profiles";
import {
  IGDS_MANIFEST_FORMAT,
  IGDS_MANIFEST_ID_PREFIX,
  type IgdsAction,
  type IgdsDocumentAssertion,
  type IgdsGenerationAssertion,
  type IgdsManifest,
  type IgdsSource,
  type IgdsSoftBindingAssertion,
  type TimestampToken,
} from "./types";

export const IGDS_CLAIM_GENERATOR = "Isabella Document Seal/1.0.0" as const;

export const IGDS_ASSERTION_LABELS = {
  document: "org.isabella.document",
  generation: "org.isabella.generation",
  actions: "org.isabella.actions",
  sources: "org.isabella.sources",
  softBinding: "org.isabella.soft_binding",
} as const;

const digestSchema = z.object({
  algorithm: z.enum(["sha256", "sha3-256"]),
  value: z.string().regex(/^[0-9a-f]+$/i),
});

const signatureSchema = z.object({
  algorithm: z.enum(["Ed25519", "ML-DSA-65"]),
  key_id: z.string().min(1),
  public_key: z.string().min(1),
  value: z.string().min(1),
  signed_digest: z.string().min(1),
});

const timestampSchema = z.object({
  protocol: z.literal("RFC3161"),
  status: z.literal("granted"),
  policy: z.string(),
  gen_time: z.string().datetime(),
  serial_number: z.string(),
  message_imprint: digestSchema,
  tsa_certificate_chain: z.array(z.string()),
  encoded_timestamp_token: z.string(),
});

export const IgdsManifestSchema = z.object({
  manifest_id: z.string().startsWith(IGDS_MANIFEST_ID_PREFIX),
  format: z.literal(IGDS_MANIFEST_FORMAT),
  profile: z.enum(["internal", "public-verifiable", "long-term", "restricted"]),
  claim: z.object({
    claim_generator: z.string().min(1),
    instance_id: z.string().min(1),
    created: z.string().datetime(),
    assertion_references: z.array(z.string()),
    content_binding: z.object({
      algorithm: z.enum(["sha256", "sha3-256"]),
      asset_hash: z.string().min(1),
    }),
  }),
  assertions: z.array(z.object({ label: z.string(), data: z.unknown() })),
  previous_manifests: z.array(z.string()).optional(),
  signatures: z.array(signatureSchema).optional(),
  timestamp: timestampSchema.nullable().optional(),
});

export interface BuildManifestInput {
  documentId: string;
  profile: SealProfile;
  contentDigest: ContentDigest;
  document: IgdsDocumentAssertion;
  generation: IgdsGenerationAssertion;
  actions: IgdsAction[];
  sources?: IgdsSource[];
  softBinding?: IgdsSoftBindingAssertion;
  previousManifests?: string[];
  claimGenerator?: string;
  instanceId?: string;
  createdAt?: string;
}

export function buildManifest(input: BuildManifestInput): IgdsManifest {
  if (!input.documentId.trim()) throw new Error("IGDS manifest: documentId es obligatorio.");
  if (input.actions.length === 0) {
    throw new Error("IGDS manifest: se requiere al menos una acción de procedencia.");
  }
  const createdAt = input.createdAt ?? new Date().toISOString();
  const assertions: IgdsManifest["assertions"] = [
    { label: IGDS_ASSERTION_LABELS.document, data: input.document },
    { label: IGDS_ASSERTION_LABELS.generation, data: input.generation },
    { label: IGDS_ASSERTION_LABELS.actions, data: input.actions },
  ];
  if (input.sources && input.sources.length > 0) {
    assertions.push({ label: IGDS_ASSERTION_LABELS.sources, data: input.sources });
  }
  if (input.softBinding) {
    assertions.push({ label: IGDS_ASSERTION_LABELS.softBinding, data: input.softBinding });
  }

  return {
    manifest_id: `${IGDS_MANIFEST_ID_PREFIX}${input.documentId}`,
    format: IGDS_MANIFEST_FORMAT,
    profile: input.profile,
    claim: {
      claim_generator: input.claimGenerator ?? IGDS_CLAIM_GENERATOR,
      instance_id: input.instanceId ?? `urn:uuid:${randomInstanceId()}`,
      created: createdAt,
      assertion_references: assertions.map((assertion) => assertion.label),
      content_binding: {
        algorithm: input.contentDigest.algorithm,
        asset_hash: input.contentDigest.value,
      },
    },
    assertions,
    ...(input.previousManifests ? { previous_manifests: input.previousManifests } : {}),
  };
}

function randomInstanceId(): string {
  return globalThis.crypto.randomUUID();
}

/** Manifiesto sin `signatures` ni `timestamp` (el que se envía a la TSA). */
export function manifestClaimView(manifest: IgdsManifest): Record<string, unknown> {
  const claim = { ...manifest } as Record<string, unknown>;
  delete claim.signatures;
  delete claim.timestamp;
  return claim;
}

/** Manifiesto sin `signatures` (base + timestamp ya incorporado). */
export function manifestFinalView(manifest: IgdsManifest): Record<string, unknown> {
  const final = { ...manifest } as Record<string, unknown>;
  delete final.signatures;
  return final;
}

export function manifestClaimDigest(
  manifest: IgdsManifest,
  algorithm: DigestAlgorithm = "sha256",
): string {
  return digestHex(algorithm, canonicalize(manifestClaimView(manifest)));
}

export function manifestFinalDigest(
  manifest: IgdsManifest,
  algorithm: DigestAlgorithm = "sha256",
): string {
  return digestHex(algorithm, canonicalize(manifestFinalView(manifest)));
}

export function withTimestamp(manifest: IgdsManifest, token: TimestampToken | null): IgdsManifest {
  return { ...manifest, timestamp: token };
}

export function attachSignatures(
  manifest: IgdsManifest,
  signatures: IgdsManifest["signatures"],
): IgdsManifest {
  return { ...manifest, signatures };
}

export function validateManifest(value: unknown): IgdsManifest {
  return IgdsManifestSchema.parse(value) as IgdsManifest;
}
