import { createHash } from "node:crypto";
import { NeonRepository } from "@/lib/persistence/adapters/neon-adapter";
import { evaluateModelRelease, type ReleaseCandidate } from "./release-gate";

export interface ModelReleaseRecord {
  id: string;
  tenantId: string;
  modelId: string;
  version: string;
  artifactHash: string;
  manifestHash: string;
  evidenceId: string;
  status: "CANDIDATE" | "APPROVED" | "REVOKED";
  createdAt: string;
}

const releases = new NeonRepository<ModelReleaseRecord>("fgais_model_releases");

function releaseId(tenantId: string, candidate: ReleaseCandidate): string {
  return `rel_${createHash("sha256").update(`${tenantId}:${candidate.modelId}:${candidate.version}`).digest("hex").slice(0, 32)}`;
}

export async function proposeModelRelease(
  tenantId: string,
  candidate: ReleaseCandidate,
): Promise<ModelReleaseRecord> {
  if (!tenantId) throw new Error("tenantId required");
  const decision = evaluateModelRelease(candidate);
  if (!decision.allowed) throw new Error(`model_release_blocked: ${decision.reasons.join("; ")}`);
  const record: ModelReleaseRecord = {
    id: releaseId(tenantId, candidate),
    tenantId,
    modelId: candidate.modelId,
    version: candidate.version,
    artifactHash: candidate.artifactHash,
    manifestHash: candidate.manifestHash,
    evidenceId: candidate.evidenceId,
    status: "CANDIDATE",
    createdAt: new Date().toISOString(),
  };
  return releases.create(tenantId, record);
}
