import { Claim, ClaimStatus, DEFAULT_CLAIMS, validateClaim } from "../schemas/claim.schema";
import { Evidence } from "../schemas/evidence.schema";
import { Finding } from "../schemas/finding.schema";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ScanResult } from "../scanners/source-scanner";
import { SecurityScanResult, VulnerabilityFinding } from "../scanners/security-scanner";
import { DatabaseScanResult, DetectedEngine } from "../scanners/database-scanner";
import { FinancialScanResult } from "../scanners/financial-scanner";
import { GovernanceScanResult } from "../scanners/governance-scanner";
import { TestDiscoveryResult, TestExecutionResult, TestFile } from "../runners/test-runner";
import { CodeArtifact } from "../graph/evidence-graph";
import { getCiRunId, isCiEnvironment } from "../../config";

export interface ClaimEngineConfig {
  claimsPath?: string;
  customClaims?: Claim[];
}

export class ClaimEngine {
  private claims: Map<string, Claim> = new Map();
  private claimEvidences: Map<string, Evidence[]> = new Map();
  private claimFindings: Map<string, Finding[]> = new Map();
  private scanResults: Record<string, unknown> = {};
  private testResults: TestDiscoveryResult | null = null;
  private testExecution: TestExecutionResult | null = null;

  constructor(config: ClaimEngineConfig = {}) {
    const claims = config.customClaims ?? DEFAULT_CLAIMS;
    for (const claim of claims) {
      this.claims.set(claim.id, claim);
      this.claimEvidences.set(claim.id, []);
      this.claimFindings.set(claim.id, []);
    }
  }

  getAllClaims(): Claim[] {
    return Array.from(this.claims.values());
  }

  getClaim(id: string): Claim | undefined {
    return this.claims.get(id);
  }

  registerClaim(claim: Claim): void {
    const validated = validateClaim(claim);
    this.claims.set(validated.id, validated);
    this.claimEvidences.set(validated.id, []);
    this.claimFindings.set(validated.id, []);
  }

  registerClaims(claims: Claim[]): void {
    for (const claim of claims) {
      this.registerClaim(claim);
    }
  }

  addEvidence(claimId: string, evidence: Evidence): void {
    const existing = this.claimEvidences.get(claimId) ?? [];
    existing.push(evidence);
    this.claimEvidences.set(claimId, existing);
  }

  getEvidences(claimId: string): Evidence[] {
    return this.claimEvidences.get(claimId) ?? [];
  }

  addFinding(claimId: string, finding: Finding): void {
    const existing = this.claimFindings.get(claimId) ?? [];
    existing.push(finding);
    this.claimFindings.set(claimId, existing);
  }

  getFindings(claimId: string): Finding[] {
    return this.claimFindings.get(claimId) ?? [];
  }

  setScanResults(results: Record<string, unknown>): void {
    this.scanResults = results;
    this.collectEvidenceFromScans();
  }

  setTestResults(results: TestDiscoveryResult, execution?: TestExecutionResult): void {
    this.testResults = results;
    this.testExecution = execution ?? null;
    this.collectEvidenceFromTests();
  }

  private getDependencyLockHash(): string {
    const lockfilePath = join(process.cwd(), "pnpm-lock.yaml");
    try {
      const content = readFileSync(lockfilePath, "utf8");
      return createHash("sha3-512").update(content).digest("hex");
    } catch (error) {
      throw new Error(
        `Cannot collect Genesis evidence without pnpm-lock.yaml: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private collectEvidenceFromScans(): void {
    const now = new Date().toISOString();
    const environment = {
      runner: isCiEnvironment() ? "GitHub Actions" : "local",
      runnerId: isCiEnvironment() ? getCiRunId() : "local",
      os: process.platform,
      nodeVersion: process.version,
      pnpmVersion: "10.15.0",
      dependencyLockHash: this.getDependencyLockHash(),
    };

    const sourceResult = this.scanResults.source as ScanResult | undefined;
    if (sourceResult?.artifacts?.length) {
      for (const artifact of sourceResult.artifacts) {
        const evidence: Evidence = {
          id: `ev-source-${artifact.id}`,
          claimId: this.mapArtifactToClaim(artifact),
          type: "SOURCE_CODE",
          source: "repository",
          provenance: "STATIC",
          location: { file: artifact.file, line: 1, column: 1 },
          content: {
            hash: artifact.hash,
            size: artifact.lines * 100,
            preview: `File: ${artifact.file}, Language: ${artifact.language}, Functions: ${artifact.functions.length}, Classes: ${artifact.classes.length}`,
          },
          metadata: {
            collectedAt: now,
            collectedBy: "source-scanner",
            environment,
            ttlDays: 90,
            reproducible: true,
            independentlyVerifiable: false,
            tamperEvident: false,
            cryptographicallySigned: false,
          },
        };
        this.addEvidence(evidence.claimId, evidence);
      }
    }

    const securityResult = this.scanResults.security as SecurityScanResult | undefined;
    if (securityResult?.vulnerabilities?.length) {
      for (const vuln of securityResult.vulnerabilities) {
        if (vuln.severity === "CRITICAL" || vuln.severity === "HIGH") {
          const evidence: Evidence = {
            id: `ev-sec-${vuln.id}`,
            claimId: this.mapVulnToClaim(vuln),
            type: "SECURITY_TEST",
            source: "test-execution",
            provenance: "STATIC",
            location: { file: vuln.file, line: vuln.line, column: vuln.column },
            content: {
              hash: createHash("sha3-512").update(JSON.stringify(vuln)).digest("hex"),
              size: 100,
              preview: `${vuln.type}: ${vuln.description} (${vuln.severity})`,
            },
            metadata: {
              collectedAt: now,
              collectedBy: "security-scanner",
              environment,
              testResult: {
                passed: false,
                durationMs: 0,
                output: vuln.description,
              },
              ttlDays: 90,
              reproducible: true,
              independentlyVerifiable: false,
              tamperEvident: false,
              cryptographicallySigned: false,
            },
          };
          this.addEvidence(evidence.claimId, evidence);
        }
      }
    }

    const dbResult = this.scanResults.database as DatabaseScanResult | undefined;
    if (dbResult?.engines?.length) {
      for (const engine of dbResult.engines) {
        if (engine.detected) {
          const evidence: Evidence = {
            id: `ev-db-${engine.type}`,
            claimId: this.mapEngineToClaim(engine),
            type: "SOURCE_CODE",
            source: "repository",
            provenance: "STATIC",
            location: { file: engine.files?.[0] },
            content: {
              hash: createHash("sha3-512").update(JSON.stringify(engine)).digest("hex"),
              size: 100,
              preview: `Engine: ${engine.type}, Tables: ${engine.tables?.join(", ")}, Authority for: ${engine.isAuthorityFor?.join(", ")}`,
            },
            metadata: {
              collectedAt: now,
              collectedBy: "database-scanner",
              environment,
              ttlDays: 90,
              reproducible: true,
              independentlyVerifiable: false,
              tamperEvident: false,
              cryptographicallySigned: false,
            },
          };
          this.addEvidence(evidence.claimId, evidence);
        }
      }
    }

    const finResult = this.scanResults.financial as FinancialScanResult | undefined;
    if (finResult?.operations?.length) {
      for (const op of finResult.operations) {
        const evidence: Evidence = {
          id: `ev-fin-${op.name}`,
          claimId: "CLAIM-005",
          type: op.atomic && op.idempotent ? "INTEGRATION_TEST" : "SECURITY_TEST",
          source: "repository",
          provenance: "STATIC",
          location: { file: op.location },
          content: {
            hash: createHash("sha3-512").update(op.implementation).digest("hex"),
            size: op.implementation.length,
            preview: `${op.type}: atomic=${op.atomic}, idempotent=${op.idempotent}, doubleEntry=${op.doubleEntry}, ledgerIntegrated=${op.ledgerIntegrated}`,
          },
          metadata: {
            collectedAt: now,
            collectedBy: "financial-scanner",
            environment,
            testResult: {
              passed: op.atomic && op.idempotent && op.balanceCheck,
              durationMs: 0,
              output: `Operation ${op.name}: ${op.atomic ? "atomic" : "NOT atomic"}, ${op.idempotent ? "idempotent" : "NOT idempotent"}`,
            },
            ttlDays: 90,
            reproducible: true,
            independentlyVerifiable: false,
            tamperEvident: false,
            cryptographicallySigned: false,
          },
        };
        this.addEvidence(evidence.claimId, evidence);
      }
    }

    const govResult = this.scanResults.governance as GovernanceScanResult | undefined;
    if (govResult?.claims?.length) {
      for (const claimAnalysis of govResult.claims) {
        if (claimAnalysis.codeImplemented) {
          const evidence: Evidence = {
            id: `ev-gov-${claimAnalysis.claim.id}-code`,
            claimId: claimAnalysis.claim.id,
            type: "SOURCE_CODE",
            source: "repository",
            provenance: "STATIC",
            content: {
              hash: createHash("sha3-512").update(`code:${claimAnalysis.claim.id}`).digest("hex"),
              size: 100,
              preview: `Code implemented for claim ${claimAnalysis.claim.id}`,
            },
            metadata: {
              collectedAt: now,
              collectedBy: "governance-scanner",
              environment,
              ttlDays: 90,
              reproducible: true,
              independentlyVerifiable: false,
              tamperEvident: false,
              cryptographicallySigned: false,
            },
          };
          this.addEvidence(evidence.claimId, evidence);
        }
        if (claimAnalysis.evidenceFound) {
          const evidence: Evidence = {
            id: `ev-gov-${claimAnalysis.claim.id}-evidence`,
            claimId: claimAnalysis.claim.id,
            type: "ARCHITECTURE_DOCUMENT",
            source: "repository",
            provenance: "STATIC",
            content: {
              hash: createHash("sha3-512")
                .update(`evidence:${claimAnalysis.claim.id}`)
                .digest("hex"),
              size: 100,
              preview: `Evidence found for claim ${claimAnalysis.claim.id}`,
            },
            metadata: {
              collectedAt: now,
              collectedBy: "governance-scanner",
              environment,
              ttlDays: 90,
              reproducible: true,
              independentlyVerifiable: false,
              tamperEvident: false,
              cryptographicallySigned: false,
            },
          };
          this.addEvidence(evidence.claimId, evidence);
        }
        if (claimAnalysis.testsPassing) {
          const evidence: Evidence = {
            id: `ev-gov-${claimAnalysis.claim.id}-tests`,
            claimId: claimAnalysis.claim.id,
            type: "UNIT_TEST",
            source: "test-execution",
            provenance: "STATIC",
            content: {
              hash: createHash("sha3-512").update(`tests:${claimAnalysis.claim.id}`).digest("hex"),
              size: 100,
              preview: `Tests passing for claim ${claimAnalysis.claim.id}`,
            },
            metadata: {
              collectedAt: now,
              collectedBy: "governance-scanner",
              environment,
              ttlDays: 90,
              reproducible: true,
              independentlyVerifiable: false,
              tamperEvident: false,
              cryptographicallySigned: false,
            },
          };
          this.addEvidence(evidence.claimId, evidence);
        }
      }
    }
  }

  private collectEvidenceFromTests(): void {
    if (!this.testResults) return;
    const now = new Date().toISOString();
    const environment = {
      runner: isCiEnvironment() ? "GitHub Actions" : "local",
      runnerId: isCiEnvironment() ? getCiRunId() : "local",
      os: process.platform,
      nodeVersion: process.version,
      pnpmVersion: "10.15.0",
      dependencyLockHash: this.getDependencyLockHash(),
    };

    const executionByTest = new Map<string, { passed: boolean; durationMs: number }>();
    for (const tr of this.testExecution?.results ?? [])
      executionByTest.set(`${tr.file}|${tr.testName}`, {
        passed: tr.passed,
        durationMs: tr.durationMs,
      });

    for (const testFile of this.testResults.testFiles) {
      for (const testCase of testFile.tests) {
        let evidenceType: Evidence["type"] = "UNIT_TEST";
        if (testFile.category === "integration") evidenceType = "INTEGRATION_TEST";
        else if (testFile.category === "security") evidenceType = "SECURITY_TEST";
        else if (testFile.category === "concurrency") evidenceType = "CONCURRENCY_TEST";
        else if (testFile.category === "e2e") evidenceType = "INTEGRATION_TEST";
        else if (testFile.category === "performance") evidenceType = "UNIT_TEST";
        const executed = executionByTest.get(`${testFile.file}|${testCase.name}`);
        if (!executed) continue;
        const claimId = this.mapTestFileToClaim(testFile);
        const evidence: Evidence = {
          id: `ev-test-${testFile.file.replace(/[^a-zA-Z0-9]/g, "-")}-${testCase.name.replace(/[^a-zA-Z0-9]/g, "-")}`.slice(
            0,
            64,
          ),
          claimId,
          type: evidenceType,
          source: "test-execution",
          provenance: "RUNTIME",
          location: { file: testFile.file, line: testCase.line },
          content: {
            hash: createHash("sha3-512").update(`${testFile.file}:${testCase.name}`).digest("hex"),
            size: 100,
            preview: `${testFile.category} test: ${testCase.name}${executed ? (executed.passed ? " (passed)" : " (failed)") : " (discovered, not executed)"}`,
          },
          metadata: {
            collectedAt: now,
            collectedBy: executed ? "test-executor" : "test-discovery",
            environment,
            testResult: executed
              ? {
                  passed: executed.passed,
                  durationMs: Math.max(1, executed.durationMs),
                }
              : undefined,
            ttlDays: 90,
            reproducible: true,
            independentlyVerifiable: false,
            tamperEvident: false,
            cryptographicallySigned: false,
          },
        };
        this.addEvidence(evidence.claimId, evidence);
      }
    }
  }

  private mapArtifactToClaim(artifact: CodeArtifact): string {
    const file = artifact.file.toLowerCase();
    if (file.includes("sovereign") || file.includes("engine")) return "CLAIM-007";
    if (file.includes("bookpi") || file.includes("ledger") || file.includes("audit"))
      return "CLAIM-003";
    if (file.includes("auth") || file.includes("rbac") || file.includes("abac")) return "CLAIM-002";
    if (file.includes("csp") || file.includes("security")) return "CLAIM-010";
    if (file.includes("financial") || file.includes("billing") || file.includes("payment"))
      return "CLAIM-005";
    if (file.includes("database") || file.includes("repository") || file.includes("persistence"))
      return "CLAIM-006";
    if (file.includes("kill") || file.includes("emergency")) return "CLAIM-008";
    if (file.includes("mfa") || file.includes("step-up")) return "CLAIM-009";
    if (file.includes("provenance") || file.includes("git") || file.includes("charter"))
      return "CLAIM-001";
    if (file.includes("privacy") || file.includes("gdpr") || file.includes("dpa"))
      return "CLAIM-004";
    return "CLAIM-001";
  }

  private mapVulnToClaim(vuln: VulnerabilityFinding): string {
    const file = vuln.file.toLowerCase();
    if (file.includes("csp") || file.includes("content-security")) return "CLAIM-010";
    if (file.includes("sql") || file.includes("injection")) return "CLAIM-005";
    if (file.includes("auth") || file.includes("jwt")) return "CLAIM-002";
    if (file.includes("eval") || file.includes("injection")) return "CLAIM-007";
    return "CLAIM-003";
  }

  private mapEngineToClaim(engine: DetectedEngine): string {
    if (engine.type === "postgresql" || engine.type === "neon") return "CLAIM-006";
    if (engine.type === "supabase") return "CLAIM-006";
    if (engine.type === "json_files") return "CLAIM-007";
    if (engine.type === "in_memory") return "CLAIM-007";
    return "CLAIM-006";
  }

  private mapTestFileToClaim(testFile: TestFile): string {
    const file = testFile.file.toLowerCase();
    if (file.includes("audit") || file.includes("ledger") || file.includes("bookpi"))
      return "CLAIM-003";
    if (file.includes("financial") || file.includes("billing") || file.includes("payment"))
      return "CLAIM-005";
    if (file.includes("auth") || file.includes("rbac") || file.includes("hitl")) return "CLAIM-002";
    if (file.includes("sovereign") || file.includes("state")) return "CLAIM-007";
    if (file.includes("database") || file.includes("repository")) return "CLAIM-006";
    if (file.includes("kill") || file.includes("emergency")) return "CLAIM-008";
    if (file.includes("mfa")) return "CLAIM-009";
    if (file.includes("csp") || file.includes("security")) return "CLAIM-010";
    return "CLAIM-001";
  }

  evaluateClaimStatus(claimId: string): ClaimStatus {
    const claim = this.claims.get(claimId);
    if (!claim) return "UNKNOWN";
    const evidences = this.getEvidences(claimId);
    const findings = this.getFindings(claimId);
    const criticalFindings = findings.filter((f) => f.severity === "CRITICAL").length;
    if (criticalFindings > 0) return "FAILED";
    const requiredTypes = claim.evidenceRequired;
    const coveredTypes = new Set(evidences.map((e) => e.type));
    const missingTypes = requiredTypes.filter((t) => !coveredTypes.has(t));
    if (missingTypes.length > 0) {
      const minRequired = this.getMinEvidenceForStatus(claim.requiredStatus);
      if (evidences.length < minRequired) return "PARTIAL";
      if (missingTypes.length === requiredTypes.length) return "PLANNED";
      return "PARTIAL";
    }
    if (claim.requiredStatus === "PRODUCTION-VERIFIED") {
      const hasDeploymentRecord = evidences.some((e) => e.type === "DEPLOYMENT_RECORD");
      const hasHealthCheck = evidences.some((e) => e.type === "HEALTH_CHECK");
      const hasMonitoring = evidences.some((e) => e.type === "MONITORING_DATA");
      const hasIncidentReport = evidences.some((e) => e.type === "INCIDENT_REPORT");
      if (!hasDeploymentRecord || !hasHealthCheck || !hasMonitoring || !hasIncidentReport)
        return "VERIFIED";
      return "PRODUCTION-VERIFIED";
    }
    if (claim.requiredStatus === "VERIFIED") {
      const hasExternalAudit = evidences.some((e) => e.type === "EXTERNAL_AUDIT");
      const hasConcurrencyTest = evidences.some((e) => e.type === "CONCURRENCY_TEST");
      if (!hasExternalAudit || !hasConcurrencyTest) return "TESTED";
      return "VERIFIED";
    }
    if (claim.requiredStatus === "TESTED") {
      const hasIntegrationTest = evidences.some((e) => e.type === "INTEGRATION_TEST");
      const hasSecurityTest = evidences.some((e) => e.type === "SECURITY_TEST");
      if (!hasIntegrationTest || !hasSecurityTest) return "IMPLEMENTED";
      return "TESTED";
    }
    if (claim.requiredStatus === "IMPLEMENTED") {
      const hasSourceCode = evidences.some((e) => e.type === "SOURCE_CODE");
      const hasUnitTest = evidences.some((e) => e.type === "UNIT_TEST");
      if (!hasSourceCode || !hasUnitTest) return "DESIGNED";
      return "IMPLEMENTED";
    }
    return "DESIGNED";
  }

  private getMinEvidenceForStatus(status: ClaimStatus): number {
    const requirements: Record<ClaimStatus, number> = {
      PLANNED: 0,
      DESIGNED: 1,
      PARTIAL: 2,
      IMPLEMENTED: 2,
      TESTED: 4,
      VERIFIED: 6,
      "PRODUCTION-VERIFIED": 10,
      FAILED: 0,
      UNKNOWN: 0,
      "NOT-APPLICABLE": 0,
    };
    return requirements[status] ?? 0;
  }

  generateClaimsHash(): string {
    const sortedClaims = Array.from(this.claims.values()).sort((a, b) => a.id.localeCompare(b.id));
    const content = JSON.stringify(
      sortedClaims.map((c) => ({
        id: c.id,
        title: c.title,
        requiredStatus: c.requiredStatus,
      })),
    );
    return createHash("sha3-512").update(content).digest("hex");
  }
}

export function createClaimEngine(config?: ClaimEngineConfig): ClaimEngine {
  return new ClaimEngine(config);
}
