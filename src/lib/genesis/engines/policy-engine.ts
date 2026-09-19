import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import { Policy, validatePolicy } from "../schemas/policy.schema";
import { ClaimStatus, Claim } from "../schemas/claim.schema";
import { Finding } from "../schemas/finding.schema";
import { Evidence } from "../schemas/evidence.schema";

export interface PolicyEngineConfig {
  policyPath?: string;
  customPolicy?: Policy;
}

export class PolicyEngine {
  private policy: Policy;
  private policyPath: string;

  constructor(config: PolicyEngineConfig = {}) {
    this.policyPath =
      config.policyPath ?? path.join(process.cwd(), "src/lib/genesis/policy/genesis-2.0.yaml");
    this.policy = config.customPolicy ?? this.loadPolicy();
  }

  private loadPolicy(): Policy {
    try {
      const content = fs.readFileSync(this.policyPath, "utf8");
      const parsed = yaml.load(content);
      return validatePolicy(parsed);
    } catch (error) {
      console.error(`Failed to load policy from ${this.policyPath}:`, error);
      return this.getDefaultPolicy();
    }
  }

  private getDefaultPolicy(): Policy {
    return {
      version: "2.0.1",
      name: "Genesis 2.0 Core Policy (Default)",
      description: "Default fallback policy",
      globals: {
        failClosed: true,
        trustLevel: "zero",
        evidenceTtlDays: 90,
        reauditFrequencyDays: 30,
      },
      claimRequirements: {
        PLANNED: { minEvidence: 0, requiredEvidenceTypes: [] },
        DESIGNED: {
          minEvidence: 1,
          requiredEvidenceTypes: ["ARCHITECTURE_DOCUMENT", "ADR"],
        },
        IMPLEMENTED: {
          minEvidence: 2,
          requiredEvidenceTypes: ["SOURCE_CODE", "UNIT_TEST"],
          minCodeCoverage: 0.8,
        },
        TESTED: {
          minEvidence: 4,
          requiredEvidenceTypes: ["SOURCE_CODE", "UNIT_TEST", "INTEGRATION_TEST", "SECURITY_TEST"],
          minCodeCoverage: 0.9,
          stabilityDays: 30,
        },
        VERIFIED: {
          minEvidence: 6,
          requiredEvidenceTypes: [
            "SOURCE_CODE",
            "UNIT_TEST",
            "INTEGRATION_TEST",
            "SECURITY_TEST",
            "CONCURRENCY_TEST",
            "EXTERNAL_AUDIT",
          ],
          minCodeCoverage: 0.95,
          stabilityDays: 90,
          externalReviewRequired: true,
        },
        "PRODUCTION-VERIFIED": {
          minEvidence: 10,
          requiredEvidenceTypes: [
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
          ],
          minCodeCoverage: 0.95,
          stabilityDays: 90,
          productionDays: 90,
          incidentFree: true,
          slaMet: true,
        },
      },
      releaseThresholds: {
        critical: { maxOpen: 0, maxAccepted: 0 },
        high: {
          maxOpen: 0,
          maxAccepted: 3,
          acceptanceRequires: ["risk_assessment", "mitigation_plan", "owner_approval"],
        },
        medium: { maxOpen: 5, maxAccepted: 10 },
        low: { maxOpen: 20, maxAccepted: 50 },
      },
      requiredGates: {
        preCommit: ["secret_scan", "lint", "typecheck"],
        preMerge: ["build", "unit_test", "integration_test", "security_scan"],
        preRelease: [
          "build",
          "unit_test",
          "integration_test",
          "security_test",
          "concurrency_test",
          "e2e_test",
          "performance_test",
          "security_audit",
          "dependency_scan",
          "sbom_generation",
        ],
        postRelease: ["health_check", "smoke_test", "monitoring_verification"],
      },
      claims: {},
      exceptions: {
        allowException: {
          requires: [
            "justification",
            "risk_assessment",
            "compensating_control",
            "owner_approval",
            "expiration_date",
            "review_date",
          ],
        },
        maxExceptionAgeDays: 90,
        autoExpire: true,
      },
    };
  }

  getPolicy(): Policy {
    return this.policy;
  }

  getClaimRequirements(status: ClaimStatus) {
    return (
      this.policy.claimRequirements[status] ?? {
        minEvidence: 0,
        requiredEvidenceTypes: [],
      }
    );
  }

  getReleaseThresholds() {
    return this.policy.releaseThresholds;
  }

  getRequiredGates() {
    return this.policy.requiredGates;
  }

  getClaimPolicy(claimId: string) {
    return this.policy.claims[claimId];
  }

  evaluateClaim(
    claim: Claim,
    evidences: Evidence[],
    findings: Finding[],
  ): {
    status: ClaimStatus;
    meetsRequirements: boolean;
    gaps: string[];
    blockingFindings: Finding[];
  } {
    const requirements = this.getClaimRequirements(claim.requiredStatus);
    const gaps: string[] = [];

    if (evidences.length < requirements.minEvidence) {
      gaps.push(`Insufficient evidence: ${evidences.length}/${requirements.minEvidence}`);
    }

    const coveredTypes = new Set<string>(evidences.map((e) => e.type));
    for (const requiredType of requirements.requiredEvidenceTypes) {
      if (!coveredTypes.has(requiredType)) {
        gaps.push(`Missing evidence type: ${requiredType}`);
      }
    }

    if (requirements.minCodeCoverage !== undefined) {
      const coverageEvidence = evidences.find((e) => e.metadata.testResult?.coverage !== undefined);
      if (
        coverageEvidence &&
        coverageEvidence.metadata.testResult!.coverage! < requirements.minCodeCoverage
      ) {
        gaps.push(
          `Code coverage below threshold: ${coverageEvidence.metadata.testResult!.coverage} < ${requirements.minCodeCoverage}`,
        );
      }
    }

    const blockingFindings = findings.filter((f) => f.priority?.shouldBlockRelease === true);

    return {
      status: claim.requiredStatus,
      meetsRequirements: gaps.length === 0 && blockingFindings.length === 0,
      gaps,
      blockingFindings,
    };
  }

  evaluateRelease(findings: Finding[]): {
    decision: "GO" | "CONDITIONAL" | "NO-GO";
    blockingFindings: Finding[];
    acceptedFindings: Finding[];
    justification: string;
  } {
    const thresholds = this.policy.releaseThresholds;

    const criticalOpen = findings.filter((f) => f.severity === "CRITICAL" && f.status === "OPEN");
    const highOpen = findings.filter((f) => f.severity === "HIGH" && f.status === "OPEN");
    const highAccepted = findings.filter((f) => f.severity === "HIGH" && f.status === "ACCEPTED");
    const mediumOpen = findings.filter((f) => f.severity === "MEDIUM" && f.status === "OPEN");
    const mediumAccepted = findings.filter(
      (f) => f.severity === "MEDIUM" && f.status === "ACCEPTED",
    );
    const lowOpen = findings.filter((f) => f.severity === "LOW" && f.status === "OPEN");

    const blockingFindings: Finding[] = [];

    if (criticalOpen.length > thresholds.critical.maxOpen) {
      blockingFindings.push(...criticalOpen);
    }
    if (highOpen.length > thresholds.high.maxOpen) {
      blockingFindings.push(...highOpen);
    }
    if (highAccepted.length > thresholds.high.maxAccepted) {
      blockingFindings.push(...highAccepted.slice(thresholds.high.maxAccepted));
    }
    if (mediumOpen.length > thresholds.medium.maxOpen) {
      blockingFindings.push(...mediumOpen);
    }
    if (mediumAccepted.length > thresholds.medium.maxAccepted) {
      blockingFindings.push(...mediumAccepted.slice(thresholds.medium.maxAccepted));
    }
    if (lowOpen.length > thresholds.low.maxOpen) {
      blockingFindings.push(...lowOpen);
    }

    let decision: "GO" | "CONDITIONAL" | "NO-GO";
    let justification = "";

    if (blockingFindings.length > 0) {
      decision = "NO-GO";
      justification = `Se detectaron ${blockingFindings.length} findings que bloquean el release según la política.`;
    } else if (highAccepted.length > 0) {
      decision = "CONDITIONAL";
      justification = `Release condicional: ${highAccepted.length} findings HIGH aceptados con plan de mitigación.`;
    } else {
      decision = "GO";
      justification = "Todos los criterios de release cumplidos.";
    }

    return {
      decision,
      blockingFindings,
      acceptedFindings: [...highAccepted, ...mediumAccepted],
      justification,
    };
  }

  validateException(exception: Record<string, unknown>): {
    valid: boolean;
    missing: string[];
  } {
    const required = this.policy.exceptions.allowException.requires;
    const missing = required.filter((r) => !exception[r]);
    return { valid: missing.length === 0, missing };
  }
}

export function createPolicyEngine(config?: PolicyEngineConfig): PolicyEngine {
  return new PolicyEngine(config);
}
