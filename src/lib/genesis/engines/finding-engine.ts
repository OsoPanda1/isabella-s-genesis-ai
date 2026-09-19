import { createHash } from "node:crypto";
import {
  Finding,
  FindingSeverity,
  FindingCategory,
  validateFinding,
  calculateCVSS,
  calculatePriority,
} from "../schemas/finding.schema";
import { ClaimEngine } from "./claim-engine";

export interface FindingEngineConfig {
  claimEngine: ClaimEngine;
}

export class FindingEngine {
  private findings: Map<string, Finding> = new Map();
  private claimEngine: ClaimEngine;

  constructor(config: FindingEngineConfig) {
    this.claimEngine = config.claimEngine;
  }

  createFinding(
    finding: Omit<Finding, "id" | "createdAt" | "updatedAt" | "cvss" | "priority">,
  ): Finding {
    const id = `GEN-${finding.category}-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date().toISOString();

    const baseFinding: Finding = {
      ...finding,
      id,
      createdAt: now,
      updatedAt: now,
    };

    const cvss = calculateCVSS(baseFinding);
    const priority = calculatePriority(baseFinding);

    const completeFinding: Finding = {
      ...baseFinding,
      cvss: {
        ...cvss,
        temporalScore: cvss.baseScore,
        environmentalScore: cvss.baseScore,
      },
      priority,
    };

    const validated = validateFinding(completeFinding);
    this.findings.set(validated.id, validated);

    if (validated.claimId) {
      this.claimEngine.addFinding(validated.claimId, validated);
    }

    return validated;
  }

  getAllFindings(): Finding[] {
    return Array.from(this.findings.values());
  }

  getFinding(id: string): Finding | undefined {
    return this.findings.get(id);
  }

  updateFinding(id: string, updates: Partial<Finding>): Finding | undefined {
    const existing = this.findings.get(id);
    if (!existing) return undefined;

    const updated: Finding = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const cvss = calculateCVSS(updated);
    const priority = calculatePriority(updated);

    const complete: Finding = {
      ...updated,
      cvss: {
        ...cvss,
        temporalScore: cvss.baseScore,
        environmentalScore: cvss.baseScore,
      },
      priority,
    };

    const validated = validateFinding(complete);
    this.findings.set(validated.id, validated);
    return validated;
  }

  resolveFinding(id: string, resolution: string): Finding | undefined {
    const current = this.findings.get(id);
    return this.updateFinding(id, {
      status: "RESOLVED",
      remediation: {
        description: resolution,
        effort: current?.remediation?.effort ?? "MEDIUM",
        verificationSteps: current?.remediation?.verificationSteps ?? [],
        owner: current?.remediation?.owner,
        dueDate: current?.remediation?.dueDate,
        compensatingControl: current?.remediation?.compensatingControl,
      },
    });
  }

  getFindingsBySeverity(severity: FindingSeverity): Finding[] {
    return this.getAllFindings().filter((f) => f.severity === severity);
  }

  getFindingsByCategory(category: FindingCategory): Finding[] {
    return this.getAllFindings().filter((f) => f.category === category);
  }

  getBlockingFindings(): Finding[] {
    return this.getAllFindings().filter((f) => f.priority?.shouldBlockRelease === true);
  }

  getFindingsHash(): string {
    const sorted = Array.from(this.findings.values()).sort((a, b) => a.id.localeCompare(b.id));
    const content = JSON.stringify(
      sorted.map((f) => ({
        id: f.id,
        severity: f.severity,
        category: f.category,
      })),
    );
    return createHash("sha3-512").update(content).digest("hex");
  }
}

export function createFindingEngine(config: FindingEngineConfig): FindingEngine {
  return new FindingEngine(config);
}
