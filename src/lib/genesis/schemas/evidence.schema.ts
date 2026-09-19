import { z } from "zod";

export const EvidenceSchema = z.object({
  id: z.string().min(1).max(64),
  claimId: z.string().min(1).max(64),
  controlId: z.string().optional(),
  type: z.enum([
    "SOURCE_CODE",
    "UNIT_TEST",
    "INTEGRATION_TEST",
    "SECURITY_TEST",
    "CONCURRENCY_TEST",
    "EXTERNAL_AUDIT",
    "DEPLOYMENT_RECORD",
    "HEALTH_CHECK",
    "MONITORING_DATA",
    "INCIDENT_REPORT",
    "ARCHITECTURE_DOCUMENT",
    "ADR",
    "DPIA",
    "DPA",
    "PRIVACY_POLICY",
    "TEST_HITL",
    "POLICY_DOCUMENT",
    "TEST_AUDIT_CHAIN",
    "TEST_CONCURRENCY",
    "WORM_CONFIG",
    "TEST_DATA_HANDLING",
    "GIT_HISTORY",
    "DESIGN_RECORDS",
    "DATED_ARTIFACTS",
  ]),
  source: z.enum(["repository", "test-execution", "external", "infrastructure"]),
  provenance: z.enum(["STATIC", "RUNTIME", "CI", "PRODUCTION", "EXTERNAL"]).default("STATIC"),
  location: z
    .object({
      file: z.string().optional(),
      line: z.number().int().positive().optional(),
      column: z.number().int().positive().optional(),
      commit: z.string().optional(),
      url: z.string().url().optional(),
    })
    .optional(),
  content: z.object({
    hash: z.string().length(128), // SHA3-512 hex
    size: z.number().int().positive(),
    preview: z.string().max(500).optional(),
  }),
  metadata: z.object({
    collectedAt: z.string().datetime(),
    collectedBy: z.string(),
    environment: z.object({
      runner: z.string(),
      runnerId: z.string(),
      os: z.string(),
      nodeVersion: z.string(),
      pnpmVersion: z.string(),
      dependencyLockHash: z.string().length(128),
    }),
    testResult: z
      .object({
        passed: z.boolean(),
        durationMs: z.number().int().positive(),
        output: z.string().optional(),
        coverage: z.number().min(0).max(1).optional(),
      })
      .optional(),
    ttlDays: z.number().int().positive().default(90),
    expiresAt: z.string().datetime().optional(),
    reproducible: z.boolean().default(true),
    independentlyVerifiable: z.boolean().default(true),
    tamperEvident: z.boolean().default(true),
    cryptographicallySigned: z.boolean().default(false),
  }),
  signature: z
    .object({
      algorithm: z.enum(["Ed25519", "ECDSA-P384"]).optional(),
      publicKey: z.string().optional(),
      signature: z.string().optional(),
      certificate: z.string().optional(),
      timestamp: z.string().datetime().optional(),
    })
    .optional(),
});

export type Evidence = z.infer<typeof EvidenceSchema>;

export const EvidenceReferenceSchema = z.object({
  id: z.string(),
  claimId: z.string(),
  type: z.string(),
  hash: z.string().length(128),
  collectedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  valid: z.boolean(),
});

export type EvidenceReference = z.infer<typeof EvidenceReferenceSchema>;

export function validateEvidence(evidence: unknown): Evidence {
  return EvidenceSchema.parse(evidence);
}

export function validateEvidenceReference(ref: unknown): EvidenceReference {
  return EvidenceReferenceSchema.parse(ref);
}
