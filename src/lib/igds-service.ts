/**
 * IGDS — Servicio de sellado (src/lib/igds-service.ts)
 * -----------------------------------------------------------------
 * Orquesta el ciclo completo delegando la criptografía y la persistencia en
 * dependencias inyectables. La versión configurada usa el firmante Ed25519 de
 * entorno y el registro Genesis en PostgreSQL; sin `IGDS_SIGNING_KEY` falla
 * cerrado y sin `IGDS_TSA_URL` no puede sellar perfiles que exigen timestamp.
 */
import {
  buildGenesisCheckpoint,
  createConfiguredSealSigner,
  createRevocationPayload,
  createRfc3161TsaClient,
  getConfiguredTsaUrl,
  revocationDigest,
  sealDocument,
  signDigest,
  verifySealPackage,
  type GenesisCheckpoint,
  type GenesisEntry,
  type GenesisRegistry,
  type IgdsSealPackage,
  type IgdsVerificationReport,
  type InclusionProof,
  type RevocationReason,
  type RevocationScope,
  type RevocationTargetType,
  type SealDocumentInput,
  type SealSigner,
  type TsaClient,
  type TsaVerifier,
} from "./igds";

export interface IgdsRevocationLookup {
  (keyId: string): Promise<{ effective_at: string; scope: RevocationScope } | null>;
}

export interface IgdsServiceDeps {
  signer: SealSigner;
  registry: GenesisRegistry;
  tsa?: TsaClient;
  /** Sin verificador, el timestamp NUNCA se considera confiable. */
  tsaVerifier?: TsaVerifier;
  now?: () => Date;
  revocationLookup?: IgdsRevocationLookup;
}

export function sealWithService(
  input: SealDocumentInput,
  deps: IgdsServiceDeps,
): Promise<IgdsSealPackage> {
  return sealDocument(input, {
    signer: deps.signer,
    registry: deps.registry,
    tsa: deps.tsa,
    now: deps.now,
  });
}

export interface ServiceVerifyOptions {
  content?: string | Buffer | unknown;
  trustedPublicKeys?: Record<string, string>;
  inclusionProof?: InclusionProof;
  checkpoint?: GenesisCheckpoint;
}

export async function verifyWithService(
  pkg: IgdsSealPackage,
  deps: IgdsServiceDeps,
  options: ServiceVerifyOptions = {},
): Promise<IgdsVerificationReport> {
  const keyId = pkg.manifest.signatures?.[0]?.key_id;
  const trustedPublicKeys =
    options.trustedPublicKeys ??
    (keyId === deps.signer.keyId ? { [deps.signer.keyId]: deps.signer.publicKey } : undefined);
  const revocation = deps.revocationLookup && keyId ? await deps.revocationLookup(keyId) : null;

  return verifySealPackage(pkg, {
    content: options.content,
    trustedPublicKeys,
    inclusionProof: options.inclusionProof,
    checkpoint: options.checkpoint,
    tsaVerifier: deps.tsaVerifier,
    revocation,
  });
}

export interface ServiceRevocationInput {
  revocationId: string;
  targetType: RevocationTargetType;
  targetId: string;
  reason: RevocationReason;
  scope?: RevocationScope;
  issuedBy: string;
  effectiveAt?: string;
}

export function revokeWithService(
  input: ServiceRevocationInput,
  deps: IgdsServiceDeps,
): Promise<GenesisEntry> {
  const payload = createRevocationPayload(input);
  const signature = signDigest(deps.signer, revocationDigest(payload));
  return deps.registry.appendRevocation({
    revocation: payload,
    signature,
    createdAt: input.effectiveAt,
  });
}

export function checkpointWithService(deps: IgdsServiceDeps): Promise<GenesisCheckpoint | null> {
  return buildGenesisCheckpoint({
    registry: deps.registry,
    signer: deps.signer,
    tsa: deps.tsa,
    generatedAt: deps.now?.().toISOString(),
  });
}

/**
 * Servicio configurado por entorno. `IGDS_SIGNING_KEY` es obligatoria; el TSA
 * solo se usa si `IGDS_TSA_URL` está definido. El verificador de timestamp debe
 * aportarse explícitamente cuando exista una raíz de confianza real.
 */
export async function createConfiguredIgdsService(
  overrides: Partial<
    Pick<IgdsServiceDeps, "tsa" | "tsaVerifier" | "now" | "revocationLookup">
  > = {},
): Promise<IgdsServiceDeps> {
  const signer = createConfiguredSealSigner();
  const { createPostgresGenesisRegistry } = await import("./repositories/igds-genesis-repository");
  const registry = createPostgresGenesisRegistry();
  const tsaUrl = getConfiguredTsaUrl();
  const tsa = overrides.tsa ?? (tsaUrl ? createRfc3161TsaClient({ url: tsaUrl }) : undefined);
  return {
    signer,
    registry,
    tsa,
    tsaVerifier: overrides.tsaVerifier,
    now: overrides.now,
    revocationLookup: overrides.revocationLookup,
  };
}
