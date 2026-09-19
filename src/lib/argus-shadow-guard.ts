import { createHash, timingSafeEqual } from "node:crypto";

export type ArgusRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ArgusDecision = "ALLOW" | "REVIEW" | "DENY";

export interface ArgusSecurityInput {
  tenantId: string;
  actorId: string;
  requestId: string;
  traceId: string;
  action: string;
  payloadDigest: string;
  riskScore: number;
  authenticated: boolean;
  approvalBound: boolean;
  integrityVerified: boolean;
}

export interface ArgusShadowDecision {
  decision: ArgusDecision;
  riskLevel: ArgusRiskLevel;
  reasonCodes: string[];
  decisionDigest: string;
  latencyClass: "FAST_PATH" | "GUARDED_PATH";
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function riskLevel(score: number): ArgusRiskLevel {
  if (score >= 0.9) return "CRITICAL";
  if (score >= 0.7) return "HIGH";
  if (score >= 0.4) return "MEDIUM";
  return "LOW";
}

function constantTimeHexEqual(a: string, b: string): boolean {
  if (!/^[a-f0-9]{64}$/u.test(a) || !/^[a-f0-9]{64}$/u.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/**
 * ARGUS shadow guard. It is intentionally independent from the primary policy
 * engine. It never grants authority; it can only preserve, escalate, or veto.
 * The hot path is deterministic and CPU-only so it adds no network latency.
 */
export function evaluateArgusShadow(input: ArgusSecurityInput): ArgusShadowDecision {
  const reasons: string[] = [];
  const level = riskLevel(input.riskScore);

  if (!input.authenticated) reasons.push("IDENTITY_REQUIRED");
  if (!input.integrityVerified) reasons.push("INTEGRITY_UNVERIFIED");
  if (!input.approvalBound) reasons.push("APPROVAL_NOT_BOUND");
  if (!/^[a-f0-9]{64}$/u.test(input.payloadDigest)) reasons.push("PAYLOAD_DIGEST_INVALID");
  if (!Number.isFinite(input.riskScore) || input.riskScore < 0 || input.riskScore > 1)
    reasons.push("RISK_SCORE_INVALID");

  let decision: ArgusDecision = "ALLOW";
  if (reasons.length > 0 || level === "CRITICAL") decision = "DENY";
  else if (level === "HIGH" || level === "MEDIUM") decision = "REVIEW";

  const decisionDigest = digest({
    tenantId: input.tenantId,
    actorId: input.actorId,
    requestId: input.requestId,
    traceId: input.traceId,
    action: input.action,
    payloadDigest: input.payloadDigest,
    decision,
    riskLevel: level,
    reasonCodes: reasons,
  });

  return {
    decision,
    riskLevel: level,
    reasonCodes: reasons,
    decisionDigest,
    latencyClass: reasons.length === 0 && level === "LOW" ? "FAST_PATH" : "GUARDED_PATH",
  };
}

/** Verify that a supplied shadow decision belongs to the exact security context. */
export function verifyArgusShadowBinding(
  input: ArgusSecurityInput,
  decision: ArgusShadowDecision,
): boolean {
  const expected = evaluateArgusShadow(input);
  return (
    expected.decision === decision.decision &&
    expected.riskLevel === decision.riskLevel &&
    constantTimeHexEqual(expected.decisionDigest, decision.decisionDigest)
  );
}
