import { z } from "zod";

export const ManifestIntegritySchema = z.object({
  claimsHash: z.string().length(128),
  controlsHash: z.string().length(128),
  findingsHash: z.string().length(128),
  evidenceHash: z.string().length(128),
  manifestHash: z.string().length(128),
  previousManifestHash: z.string().length(128).optional(),
});

export type ManifestIntegrity = z.infer<typeof ManifestIntegritySchema>;

export const ManifestSignatureSchema = z.object({
  algorithm: z.enum(["Ed25519", "ECDSA-P384"]),
  publicKey: z.string(),
  signature: z.string(),
  certificate: z.string().optional(),
  timestamp: z.string().datetime(),
});

export type ManifestSignature = z.infer<typeof ManifestSignatureSchema>;

export const ManifestContextSchema = z.object({
  repository: z.object({
    name: z.string(),
    url: z.string().url(),
    commit: z.string().length(40),
    branch: z.string(),
    snapshotHash: z.string().length(128),
    snapshotTimestamp: z.string().datetime(),
  }),
  environment: z.object({
    runner: z.string(),
    runnerId: z.string(),
    os: z.string(),
    nodeVersion: z.string(),
    pnpmVersion: z.string(),
    dependencyLockHash: z.string().length(128),
  }),
});

export type ManifestContext = z.infer<typeof ManifestContextSchema>;

export const ManifestSummarySchema = z.object({
  totalClaims: z.number().int().nonnegative(),
  totalControls: z.number().int().nonnegative(),
  totalTests: z.number().int().nonnegative(),
  totalEvidence: z.number().int().nonnegative(),
  totalFindings: z.number().int().nonnegative(),
  bySeverity: z.object({
    critical: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    low: z.number().int().nonnegative(),
    informational: z.number().int().nonnegative(),
  }),
  byStatus: z.object({
    planned: z.number().int().nonnegative(),
    designed: z.number().int().nonnegative(),
    partial: z.number().int().nonnegative(),
    implemented: z.number().int().nonnegative(),
    tested: z.number().int().nonnegative(),
    verified: z.number().int().nonnegative(),
    productionVerified: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
    notApplicable: z.number().int().nonnegative(),
  }),
  scores: z.object({
    engineeringMaturity: z.number().min(0).max(100),
    evidenceMaturity: z.number().min(0).max(100),
    productionReadiness: z.number().min(0).max(100),
  }),
  releaseDecision: z.object({
    decision: z.enum(["GO", "CONDITIONAL", "NO-GO"]),
    blockingFindings: z.number().int().nonnegative(),
    justification: z.string(),
  }),
});

export type ManifestSummary = z.infer<typeof ManifestSummarySchema>;

export const ManifestSchema = z.object({
  manifest: z.object({
    version: z.string().default("2.0.1"),
    generatedAt: z.string().datetime(),
    generator: z.string().default("genesis-audit-engine"),
    generatorVersion: z.string().default("2.0.1"),
    generatorHash: z.string().length(128),
  }),
  context: ManifestContextSchema,
  summary: ManifestSummarySchema,
  claims: z.array(z.any()),
  controls: z.array(z.any()),
  findings: z.array(z.any()),
  evidenceReferences: z.array(z.any()),
  integrity: ManifestIntegritySchema,
  signature: ManifestSignatureSchema.optional(),
});

export type Manifest = z.infer<typeof ManifestSchema>;

export function validateManifest(manifest: unknown): Manifest {
  return ManifestSchema.parse(manifest);
}

export function createEmptyManifest(generatorHash: string, context: ManifestContext): Manifest {
  return {
    manifest: {
      version: "2.0.1",
      generatedAt: new Date().toISOString(),
      generator: "genesis-audit-engine",
      generatorVersion: "2.0.1",
      generatorHash,
    },
    context,
    summary: {
      totalClaims: 0,
      totalControls: 0,
      totalTests: 0,
      totalEvidence: 0,
      totalFindings: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0, informational: 0 },
      byStatus: {
        planned: 0,
        designed: 0,
        partial: 0,
        implemented: 0,
        tested: 0,
        verified: 0,
        productionVerified: 0,
        failed: 0,
        unknown: 0,
        notApplicable: 0,
      },
      scores: {
        engineeringMaturity: 0,
        evidenceMaturity: 0,
        productionReadiness: 0,
      },
      releaseDecision: {
        decision: "NO-GO",
        blockingFindings: 0,
        justification: "Audit not executed",
      },
    },
    claims: [],
    controls: [],
    findings: [],
    evidenceReferences: [],
    integrity: {
      claimsHash: "0".repeat(128),
      controlsHash: "0".repeat(128),
      findingsHash: "0".repeat(128),
      evidenceHash: "0".repeat(128),
      manifestHash: "0".repeat(128),
    },
  };
}
