import { Claim } from "./schemas/claim.schema";
import { Finding } from "./schemas";
import { Evidence } from "./schemas/evidence.schema";

/**
 * RELEASE GATE (src/lib/genesis/release/release-gate.ts) — P0-90
 * -----------------------------------------------------------------
 * Puerta de lanzamiento determinista y basada en EVIDENCIA REAL (nunca
 * fabricada). Evalúa seis dominios:
 *
 *   MANDATORY-CLAIMS  claims de gobernanza/seguridad núcleo satisfechos
 *   SECURITY          claims + tipos de evidencia de seguridad
 *   FINANCIAL         circuit break: caso financiero (A–J) PROBADO o NO-GO
 *   RUNTIME           claims + evidencia de runtime (health, monitoreo)
 *   DEPLOYMENT        evidencia de despliegue real (records, health)
 *   DR                evidencia de recuperación ante desastres
 *
 * Reglas de decisión (en este orden):
 *   1. finding CRITICAL abierta              → NO-GO
 *   2. dominio FINANCIAL no probado          → NO-GO (no live payments)
 *   3. dominio MANDATORY/SECURITY fallido    → NO-GO
 *   4. high abierta, readiness <70, o
 *      cobertura de evidencia <60            → CONDITIONAL
 *   5. todo lo anterior pasa                 → GO
 *
 * No se OTORGA ningún dominio por "existir un archivo": se deriva de
 * claims satisfechos + tipos de evidencia realmente recolectados.
 */

export type ReleaseDecision = "GO" | "CONDITIONAL" | "NO-GO";

export interface ReleaseGateDomain {
  id: string;
  label: string;
  /** claims que deben estar satisfechas para que el dominio pase */
  requiredClaims: string[];
  /** tipos de evidencia que deben existir al menos una vez en el dominio */
  requiredEvidenceKinds: string[];
}

export const RELEASE_GATE_DOMAINS: ReleaseGateDomain[] = [
  {
    id: "MANDATORY-CLAIMS",
    label: "Mandatory claims (gobernanza/seguridad núcleo)",
    requiredClaims: ["CLAIM-002", "CLAIM-003", "CLAIM-006", "CLAIM-007", "CLAIM-008", "CLAIM-010"],
    requiredEvidenceKinds: [],
  },
  {
    id: "SECURITY",
    label: "Seguridad",
    requiredClaims: ["CLAIM-002", "CLAIM-003", "CLAIM-008", "CLAIM-010"],
    requiredEvidenceKinds: ["SECURITY_TEST", "TEST_HITL", "TEST_AUDIT_CHAIN", "TEST_CONCURRENCY"],
  },
  {
    id: "FINANCIAL",
    label: "Circuito financiero (casos A–J)",
    requiredClaims: ["CLAIM-005"],
    requiredEvidenceKinds: [
      "UNIT_TEST",
      "INTEGRATION_TEST",
      "CONCURRENCY_TEST",
      "EXTERNAL_AUDIT",
      "DEPLOYMENT_RECORD",
      "HEALTH_CHECK",
    ],
  },
  {
    id: "RUNTIME",
    label: "Runtime",
    requiredClaims: ["CLAIM-006"],
    requiredEvidenceKinds: ["HEALTH_CHECK", "MONITORING_DATA", "DEPLOYMENT_RECORD"],
  },
  {
    id: "DEPLOYMENT",
    label: "Despliegue",
    requiredClaims: [],
    requiredEvidenceKinds: ["DEPLOYMENT_RECORD", "HEALTH_CHECK"],
  },
  {
    id: "DR",
    label: "Recuperación ante desastres",
    requiredClaims: [],
    requiredEvidenceKinds: ["INCIDENT_REPORT", "MONITORING_DATA", "DEPLOYMENT_RECORD"],
  },
];

export interface ReleaseGateCheck {
  domain: string;
  domainLabel: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface ReleaseGateResult {
  decision: ReleaseDecision;
  checks: ReleaseGateCheck[];
  blockingFindings: number;
  passedDomains: string[];
  failedDomains: string[];
  justification: string;
}

export interface ReleaseGateInput {
  claims: Claim[];
  findings: Finding[];
  productionReadiness: number;
  evidenceCoverage: number;
  claimSatisfied: (claimId: string) => boolean;
  /** fracción 0..1 de evidencia requerida presente por dominio (por id de dominio) */
  domainEvidenceCoverage?: (domainId: string) => number;
}

const CLAIM_SATISFACTION_STATUSES = ["TESTED", "VERIFIED", "PRODUCTION-VERIFIED"] as const;

export function isClaimSatisfiedByStatus(status: string): boolean {
  return (CLAIM_SATISFACTION_STATUSES as readonly string[]).includes(status);
}

export function countOpenBySeverity(findings: Finding[], severity: string): number {
  return findings.filter((f) => f.severity === severity && f.status === "OPEN").length;
}

export function evaluateReleaseGate(input: ReleaseGateInput): ReleaseGateResult {
  const checks: ReleaseGateCheck[] = [];
  const passedDomains: string[] = [];
  const failedDomains: string[] = [];

  for (const domain of RELEASE_GATE_DOMAINS) {
    let domainPassed = true;

    // Claims requeridas del dominio.
    for (const claimId of domain.requiredClaims) {
      const claim = input.claims.find((c) => c.id === claimId);
      const satisfied = claim ? input.claimSatisfied(claimId) : false;
      const label = `${claim?.title ?? claimId} (${claimId})`;
      if (!satisfied) domainPassed = false;
      checks.push({
        domain: domain.id,
        domainLabel: domain.label,
        label: `Claim: ${label}`,
        passed: satisfied,
        detail: satisfied
          ? "Claim satisfecha con estado >= TESTED"
          : "Claim NO satisfecha — requiere estado TESTED/VERIFIED/PRODUCTION-VERIFIED",
      });
    }

    // Tipos de evidencia requerida del dominio (solo si hay métrica real).
    if (input.domainEvidenceCoverage) {
      const coverage = input.domainEvidenceCoverage(domain.id);
      const expected = domain.requiredEvidenceKinds.length;
      if (expected > 0) {
        const ratio = Math.min(1, Math.max(0, coverage));
        const passed = ratio >= 0.67;
        if (!passed) domainPassed = false;
        checks.push({
          domain: domain.id,
          domainLabel: domain.label,
          label: `Evidencia del dominio (${expected} tipos requeridos)`,
          passed,
          detail: `Cobertura de evidencia del dominio: ${Math.round(ratio * 100)}% (mínimo 67%)`,
        });
      }
    }

    if (domainPassed) {
      passedDomains.push(domain.id);
    } else {
      failedDomains.push(domain.id);
    }
  }

  const criticalOpen = countOpenBySeverity(input.findings, "CRITICAL");
  const highOpen = countOpenBySeverity(input.findings, "HIGH");

  let decision: ReleaseDecision = "GO";
  const reasons: string[] = [];

  // Regla 1: critical abierta → NO-GO.
  if (criticalOpen > 0) {
    decision = "NO-GO";
    reasons.push(`${criticalOpen} finding(s) CRITICAL abierta(s) bloquean el release`);
  }

  // Regla 2: circuito financiero no probado → NO-GO (nunca live payments).
  if (!passedDomains.includes("FINANCIAL")) {
    decision = "NO-GO";
    reasons.push("Dominio FINANCIAL no probado: casos financieros (A–J) sin evidencia suficiente");
  }

  // Regla 3: dominios mandatorios/seguridad fallidos → NO-GO.
  const mandatoryFailed = failedDomains.filter((d) => ["MANDATORY-CLAIMS", "SECURITY"].includes(d));
  if (mandatoryFailed.length > 0) {
    decision = "NO-GO";
    reasons.push(`Dominios obligatorios fallidos: ${mandatoryFailed.join(", ")}`);
  }

  // Regla 4: high abierta, readiness <70 o cobertura <60 → CONDITIONAL.
  if (decision === "GO") {
    if (highOpen > 0) {
      decision = "CONDITIONAL";
      reasons.push(`${highOpen} finding(s) HIGH requieren plan de mitigación`);
    }
    if (input.productionReadiness < 70) {
      decision = "CONDITIONAL";
      reasons.push(`Production readiness ${input.productionReadiness}% < 70%`);
    }
    if (input.evidenceCoverage < 60) {
      decision = "CONDITIONAL";
      reasons.push(`Cobertura de evidencia ${input.evidenceCoverage}% < 60%`);
    }
  }

  const justification =
    decision === "GO"
      ? "Todos los dominios del release gate pasaron con evidencia real"
      : reasons.join("; ");

  const blockingFindings =
    decision === "NO-GO"
      ? criticalOpen > 0
        ? criticalOpen
        : failedDomains.length > 0
          ? failedDomains.length
          : highOpen
      : highOpen;

  return {
    decision,
    checks,
    blockingFindings,
    passedDomains,
    failedDomains,
    justification,
  };
}

export function createEvidenceCoverageMeasurer(
  claims: Claim[],
  evidencesByClaim: (claimId: string) => Evidence[],
) {
  const expectedKinds = new Set<string>();
  for (const claim of claims) {
    for (const kind of claim.evidenceRequired) expectedKinds.add(kind);
  }
  const presentKinds = new Set<string>();
  for (const claim of claims) {
    for (const evidence of evidencesByClaim(claim.id)) presentKinds.add(evidence.type);
  }

  return {
    overallCoverage: Math.round((presentKinds.size / Math.max(1, expectedKinds.size)) * 100),
    domainEvidenceCoverage: (domainId: string) => {
      const domain = RELEASE_GATE_DOMAINS.find((d) => d.id === domainId);
      if (!domain || domain.requiredEvidenceKinds.length === 0) return 1;
      const covered = domain.requiredEvidenceKinds.filter((kind) => presentKinds.has(kind));
      return covered.length / domain.requiredEvidenceKinds.length;
    },
  };
}
