import { z } from "zod";

export const FindingSeveritySchema = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"]);

export type FindingSeverity = z.infer<typeof FindingSeveritySchema>;

export const FindingCategorySchema = z.enum([
  "FINANCIAL",
  "SECURITY",
  "DATABASE",
  "AUTH",
  "AUDIT",
  "CI_CD",
  "SUPPLY_CHAIN",
  "ENVIRONMENT",
  "GOVERNANCE",
  "PRIVACY",
  "COMPLIANCE",
  "PERFORMANCE",
  "RELIABILITY",
  "MAINTAINABILITY",
]);

export type FindingCategory = z.infer<typeof FindingCategorySchema>;

export const FindingSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(256),
  description: z.string().min(1),
  severity: FindingSeveritySchema,
  category: FindingCategorySchema,
  claimId: z.string().optional(),
  controlId: z.string().optional(),
  location: z
    .object({
      file: z.string(),
      line: z.number().int().positive().optional(),
      column: z.number().int().positive().optional(),
      function: z.string().optional(),
    })
    .optional(),
  evidence: z
    .array(
      z.object({
        type: z.string(),
        hash: z.string().length(128),
        description: z.string(),
      }),
    )
    .default([]),
  impact: z
    .object({
      confidentiality: z.number().min(0).max(1).default(0),
      integrity: z.number().min(0).max(1).default(0),
      availability: z.number().min(0).max(1).default(0),
      financial: z.number().min(0).max(1).default(0),
      reputational: z.number().min(0).max(1).default(0),
      compliance: z.number().min(0).max(1).default(0),
    })
    .default({}),
  exploitability: z
    .object({
      attackVector: z.enum(["NETWORK", "ADJACENT", "LOCAL", "PHYSICAL"]).default("NETWORK"),
      attackComplexity: z.enum(["LOW", "HIGH"]).default("LOW"),
      privilegesRequired: z.enum(["NONE", "LOW", "HIGH"]).default("NONE"),
      userInteraction: z.enum(["NONE", "REQUIRED"]).default("NONE"),
      scope: z.enum(["UNCHANGED", "CHANGED"]).default("UNCHANGED"),
    })
    .default({}),
  blastRadius: z.enum(["SYSTEM", "TENANT", "USER", "COMPONENT"]).default("COMPONENT"),
  cvss: z
    .object({
      baseScore: z.number().min(0).max(10),
      temporalScore: z.number().min(0).max(10).optional(),
      environmentalScore: z.number().min(0).max(10).optional(),
      vectorString: z.string(),
    })
    .optional(),
  priority: z
    .object({
      score: z.number().min(0).max(100),
      rank: z.number().int().positive(),
      shouldBlockRelease: z.boolean(),
      slaHours: z.number().int().positive(),
    })
    .optional(),
  remediation: z
    .object({
      description: z.string(),
      effort: z.enum(["LOW", "MEDIUM", "HIGH"]),
      owner: z.string().optional(),
      dueDate: z.string().datetime().optional(),
      compensatingControl: z.string().optional(),
      verificationSteps: z.array(z.string()).default([]),
    })
    .optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "ACCEPTED", "DEFERRED"]).default("OPEN"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Finding = z.infer<typeof FindingSchema>;

export function validateFinding(finding: unknown): Finding {
  return FindingSchema.parse(finding);
}

export function calculateCVSS(finding: Finding): {
  baseScore: number;
  vectorString: string;
} {
  const { exploitability, impact } = finding;

  // CVSS 3.1 Base Score Calculation
  const S = exploitability.scope === "CHANGED" ? 1 : 0;

  const C = impact.confidentiality;
  const I = impact.integrity;
  const A = impact.availability;

  const ISS = 1 - (1 - C) * (1 - I) * (1 - A);

  let baseScore: number;
  if (S === 0) {
    baseScore = Math.min(ISS * 10, 10);
  } else {
    baseScore = Math.min(1.08 * (ISS * 10) - 1.5, 10);
  }

  baseScore = Math.round(baseScore * 10) / 10;

  const vectorString = `CVSS:3.1/AV:${exploitability.attackVector}/AC:${exploitability.attackComplexity}/PR:${exploitability.privilegesRequired}/UI:${exploitability.userInteraction}/S:${exploitability.scope === "CHANGED" ? "C" : "U"}/C:${C > 0.5 ? "H" : C > 0 ? "L" : "N"}/I:${I > 0.5 ? "H" : I > 0 ? "L" : "N"}/A:${A > 0.5 ? "H" : A > 0 ? "L" : "N"}`;

  return { baseScore, vectorString };
}

export function calculatePriority(finding: Finding): {
  score: number;
  rank: number;
  shouldBlockRelease: boolean;
  slaHours: number;
} {
  const severityWeights = {
    CRITICAL: 100,
    HIGH: 70,
    MEDIUM: 40,
    LOW: 15,
    INFORMATIONAL: 5,
  };

  const categoryWeights = {
    FINANCIAL: 1.5,
    SECURITY: 1.3,
    DATABASE: 1.2,
    AUTH: 1.2,
    AUDIT: 1.2,
    CI_CD: 1.1,
    SUPPLY_CHAIN: 1.1,
    ENVIRONMENT: 1.0,
    GOVERNANCE: 1.0,
    PRIVACY: 1.2,
    COMPLIANCE: 1.2,
    PERFORMANCE: 0.8,
    RELIABILITY: 0.9,
    MAINTAINABILITY: 0.7,
  };

  const baseScore = severityWeights[finding.severity];
  const categoryMultiplier = categoryWeights[finding.category] || 1.0;
  const exploitabilityBonus = finding.exploitability.attackVector === "NETWORK" ? 10 : 0;
  const blastRadiusBonus =
    finding.blastRadius === "SYSTEM"
      ? 15
      : finding.blastRadius === "TENANT"
        ? 10
        : finding.blastRadius === "USER"
          ? 5
          : 0;

  const score = Math.min(
    Math.round(baseScore * categoryMultiplier + exploitabilityBonus + blastRadiusBonus),
    100,
  );
  const shouldBlockRelease =
    finding.severity === "CRITICAL" ||
    (finding.severity === "HIGH" && finding.category === "FINANCIAL");
  const slaHours =
    finding.severity === "CRITICAL"
      ? 4
      : finding.severity === "HIGH"
        ? 24
        : finding.severity === "MEDIUM"
          ? 72
          : 168;
  const rank = Math.max(1, Math.round(score / 10));

  return { score, rank, shouldBlockRelease, slaHours };
}
