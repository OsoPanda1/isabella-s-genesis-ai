export interface ReleaseCandidate {
  modelId: string;
  version: string;
  artifactHash: string;
  manifestHash: string;
  evidenceId: string;
  modelApproved: boolean;
  evaluationPassed: boolean;
  securityPassed: boolean;
  provenanceComplete: boolean;
  humanApproval: boolean;
}

export interface ReleaseDecision {
  allowed: boolean;
  reasons: string[];
  assurance: "NONE" | "EVIDENCE_BACKED";
}

export function evaluateModelRelease(candidate: ReleaseCandidate): ReleaseDecision {
  const reasons: string[] = [];
  if (!candidate.modelId || !candidate.version) reasons.push("model identity incomplete");
  if (!candidate.artifactHash || !candidate.manifestHash || !candidate.evidenceId)
    reasons.push("release evidence incomplete");
  if (!candidate.modelApproved) reasons.push("model not approved");
  if (!candidate.evaluationPassed) reasons.push("evaluation not passed");
  if (!candidate.securityPassed) reasons.push("security evaluation not passed");
  if (!candidate.provenanceComplete) reasons.push("provenance incomplete");
  if (!candidate.humanApproval) reasons.push("human approval required");
  return {
    allowed: reasons.length === 0,
    reasons,
    assurance: reasons.length === 0 ? "EVIDENCE_BACKED" : "NONE",
  };
}
