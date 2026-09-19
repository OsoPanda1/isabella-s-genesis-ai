import { createHash } from "node:crypto";
import type { FederatedRound, FederatedUpdate, ModelArtifact, ModelIdentity } from "./types";

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validateFiniteArray(values: readonly number[]): void {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("invalid_federated_weights");
  }
}

export function aggregateFederatedUpdates(
  model: ModelIdentity,
  baseArtifact: ModelArtifact,
  updates: readonly FederatedUpdate[],
  verifySignature: (update: FederatedUpdate) => boolean,
): { round: FederatedRound; artifact: ModelArtifact } {
  if (model.approvalStatus !== "APPROVED") throw new Error("model_not_approved");
  if (updates.length < 2) throw new Error("federated_round_requires_multiple_nodes");
  validateFiniteArray(baseArtifact.weights);
  if (!Number.isFinite(baseArtifact.bias)) throw new Error("invalid_base_bias");

  const accepted = updates.filter(
    (update) =>
      verifySignature(update) &&
      update.modelId === model.modelId &&
      update.territoryId === model.territoryId &&
      update.baseModelVersion === model.version &&
      update.sampleCount > 0 &&
      update.deltaWeights.length === baseArtifact.weights.length &&
      update.metrics.loss >= 0 &&
      Number.isFinite(update.metrics.loss) &&
      Number.isFinite(update.deltaBias) &&
      update.deltaWeights.every((value) => Number.isFinite(value)),
  );
  if (accepted.length < 2) throw new Error("insufficient_valid_federated_updates");

  const totalSamples = accepted.reduce((sum, update) => sum + update.sampleCount, 0);
  const weights = baseArtifact.weights.map((base, index) => {
    const delta = accepted.reduce(
      (sum, update) => sum + update.deltaWeights[index]! * update.sampleCount,
      0,
    );
    return base + delta / totalSamples;
  });
  const biasDelta =
    accepted.reduce((sum, update) => sum + update.deltaBias * update.sampleCount, 0) / totalSamples;
  const artifactHash = hash({ weights, bias: baseArtifact.bias + biasDelta });
  const artifact: ModelArtifact = {
    weights,
    bias: baseArtifact.bias + biasDelta,
    artifactHash,
  };
  const roundId = `fedround_${hash({
    modelId: model.modelId,
    baseVersion: model.version,
    updates: accepted.map((update) => update.updateHash).sort(),
  }).slice(0, 24)}`;
  const nextVersion = `${model.version}+fed.${accepted.length}.${hash(artifactHash).slice(0, 8)}`;
  const round: FederatedRound = {
    roundId,
    modelId: model.modelId,
    baseVersion: model.version,
    participants: accepted.map((update) => update.nodeId).sort(),
    updateHashes: accepted.map((update) => update.updateHash).sort(),
    aggregation: "FEDAVG",
    status: "COMMITTED",
    nextVersion,
  };
  return { round, artifact };
}
