/**
 * IGDS — Motor de sellado (src/lib/igds/seal.ts)
 * -----------------------------------------------------------------
 * Orquesta el flujo canónico:
 *   contenido → digest → manifiesto base → (RFC 3161) → manifiesto final
 *   → firma(s) → entrada Genesis → sello
 *
 * Fail-closed: si el perfil exige PQC o timestamp y no están disponibles, el
 * sellado aborta. Nunca se emite un sello degradado en silencio.
 */
import { canonicalize } from "./canonical";
import { digestHex } from "./digests";
import type { DigestAlgorithm } from "./digests";
import {
  attachSignatures,
  buildManifest,
  manifestClaimDigest,
  manifestFinalDigest,
  withTimestamp,
} from "./manifest";
import { getSealProfileSpec, type SealProfile } from "./profiles";
import { getPqcProvider, signDigest, type SealSigner } from "./keys";
import type { SignatureEnvelope } from "./keys";
import type { GenesisRegistry } from "./registry";
import type { TsaClient } from "./tsa";
import {
  IGDS_SEAL_LABEL,
  type GenesisEntry,
  type IgdsAction,
  type IgdsDocumentAssertion,
  type IgdsGenerationAssertion,
  type IgdsManifest,
  type IgdsSeal,
  type IgdsSealPackage,
  type IgdsSource,
  type IgdsSoftBindingAssertion,
} from "./types";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Identificador corto visible (12 caracteres, sin el digest completo). */
export function shortSealId(digestValue: string): string {
  const bytes = Buffer.from(digestValue, "hex").subarray(0, 8);
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let output = "";
  for (let index = 0; index < 12; index += 1) {
    output = CROCKFORD[Number(value & 31n)] + output;
    value >>= 5n;
  }
  return output;
}

export function normalizeContent(content: string | Buffer | unknown): Buffer {
  if (typeof content === "string") return Buffer.from(content, "utf8");
  if (Buffer.isBuffer(content)) return content;
  return Buffer.from(canonicalize(content), "utf8");
}

export interface SealDocumentInput {
  documentId: string;
  content: string | Buffer | unknown;
  profile: SealProfile;
  document: IgdsDocumentAssertion;
  generation: IgdsGenerationAssertion;
  actions: IgdsAction[];
  sources?: IgdsSource[];
  softBinding?: IgdsSoftBindingAssertion;
  previousManifests?: string[];
  createdAt?: string;
  instanceId?: string;
  claimGenerator?: string;
}

export interface SealDependencies {
  signer: SealSigner;
  registry: GenesisRegistry;
  tsa?: TsaClient;
  now?: () => Date;
  idGenerator?: () => string;
}

export async function sealDocument(
  input: SealDocumentInput,
  dependencies: SealDependencies,
): Promise<IgdsSealPackage> {
  const spec = getSealProfileSpec(input.profile);
  const now = dependencies.now ?? (() => new Date());
  const createdAt = input.createdAt ?? now().toISOString();

  const primaryAlgorithm: DigestAlgorithm = spec.hashAlgorithms.includes("sha256")
    ? "sha256"
    : spec.hashAlgorithms[0]!;
  const contentBytes = normalizeContent(input.content);
  const contentDigest = digestHex(primaryAlgorithm, contentBytes);

  const baseManifest = buildManifest({
    documentId: input.documentId,
    profile: input.profile,
    contentDigest: { algorithm: primaryAlgorithm, value: contentDigest },
    document: input.document,
    generation: input.generation,
    actions: input.actions,
    sources: input.sources,
    softBinding: input.softBinding,
    previousManifests: input.previousManifests,
    createdAt,
    instanceId: input.instanceId,
    claimGenerator: input.claimGenerator,
  });

  const claimDigest = manifestClaimDigest(baseManifest, primaryAlgorithm);

  let timestamp = null;
  if (spec.requireTimestamp) {
    if (!dependencies.tsa) {
      throw new Error(
        `IGDS seal: el perfil "${input.profile}" exige timestamp RFC 3161 y no hay TSA configurada.`,
      );
    }
    timestamp = await dependencies.tsa.timestamp(claimDigest);
    if (
      timestamp.message_imprint.algorithm !== primaryAlgorithm ||
      timestamp.message_imprint.value !== claimDigest
    ) {
      throw new Error("IGDS seal: el token RFC 3161 no cubre el digest del manifiesto base.");
    }
  }

  const finalManifest = withTimestamp(baseManifest, timestamp);
  const finalDigest = manifestFinalDigest(finalManifest, primaryAlgorithm);

  const signatures: SignatureEnvelope[] = [signDigest(dependencies.signer, finalDigest)];

  const pqcRequested = spec.signatureAlgorithms.includes("ML-DSA-65");
  if (pqcRequested) {
    const provider = getPqcProvider();
    if (!provider) {
      if (spec.requirePqc) {
        throw new Error(
          `IGDS seal: el perfil "${input.profile}" exige ML-DSA-65 y no hay proveedor PQC registrado.`,
        );
      }
    } else {
      signatures.push({
        algorithm: "ML-DSA-65",
        key_id: provider.keyId,
        public_key: provider.publicKey,
        value: provider.sign(Buffer.from(finalDigest, "utf8")).toString("base64"),
        signed_digest: finalDigest,
      });
    }
  }

  const sealedManifest = attachSignatures(finalManifest, signatures);

  const entry: GenesisEntry = await dependencies.registry.appendSeal({
    entryId: dependencies.idGenerator?.(),
    documentId: input.documentId,
    documentDigest: `sha256:${contentDigest}`,
    manifestDigest: `sha256:${finalDigest}`,
    signature: signatures[0]!,
    createdAt,
  });

  const seal: IgdsSeal = {
    seal_label: IGDS_SEAL_LABEL,
    seal_id: shortSealId(finalDigest),
    profile: input.profile,
    issued: createdAt,
    hash_algorithms: [...spec.hashAlgorithms],
    signature_algorithms: signatures.map((signature) => signature.algorithm),
    registry: "Isabella Genesis",
    instruction: `Verifica en Isabella Genesis con la entrada #${entry.sequence}.`,
  };

  return { seal, manifest: sealedManifest, entry };
}

export function sealDisplayName(manifest: IgdsManifest): string {
  return `${IGDS_SEAL_LABEL} · ${manifest.profile}`;
}
