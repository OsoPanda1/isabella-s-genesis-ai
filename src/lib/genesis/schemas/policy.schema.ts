import { z } from "zod";

export const PolicySchema = z.object({
  version: z.string(),
  name: z.string(),
  description: z.string(),
  globals: z.object({
    failClosed: z.boolean().default(true),
    trustLevel: z.enum(["zero", "minimal", "standard"]).default("zero"),
    evidenceTtlDays: z.number().int().positive().default(90),
    reauditFrequencyDays: z.number().int().positive().default(30),
  }),
  claimRequirements: z.record(
    z.object({
      minEvidence: z.number().int().nonnegative(),
      requiredEvidenceTypes: z.array(z.string()),
      minCodeCoverage: z.number().min(0).max(1).optional(),
      stabilityDays: z.number().int().positive().optional(),
      externalReviewRequired: z.boolean().optional(),
      productionDays: z.number().int().positive().optional(),
      incidentFree: z.boolean().optional(),
      slaMet: z.boolean().optional(),
    }),
  ),
  releaseThresholds: z.object({
    critical: z.object({
      maxOpen: z.number().int().nonnegative(),
      maxAccepted: z.number().int().nonnegative(),
    }),
    high: z.object({
      maxOpen: z.number().int().nonnegative(),
      maxAccepted: z.number().int().nonnegative(),
      acceptanceRequires: z.array(z.string()).optional(),
    }),
    medium: z.object({
      maxOpen: z.number().int().nonnegative(),
      maxAccepted: z.number().int().nonnegative(),
    }),
    low: z.object({
      maxOpen: z.number().int().nonnegative(),
      maxAccepted: z.number().int().nonnegative(),
    }),
  }),
  requiredGates: z.object({
    preCommit: z.array(z.string()),
    preMerge: z.array(z.string()),
    preRelease: z.array(z.string()),
    postRelease: z.array(z.string()),
  }),
  claims: z.record(
    z.object({
      id: z.string(),
      title: z.string(),
      requiredStatus: z.string(),
      evidenceRequired: z.array(z.string()),
    }),
  ),
  exceptions: z.object({
    allowException: z.object({
      requires: z.array(z.string()),
    }),
    maxExceptionAgeDays: z.number().int().positive(),
    autoExpire: z.boolean(),
  }),
});

export type Policy = z.infer<typeof PolicySchema>;

export function validatePolicy(policy: unknown): Policy {
  return PolicySchema.parse(policy);
}
