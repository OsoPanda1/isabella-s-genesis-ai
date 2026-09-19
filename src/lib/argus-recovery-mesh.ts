import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export interface RecoveryPlan {
  planId: string;
  planDigest: string;
  targetCheckpoint: { sequence: number; digest: string };
  expiresAt: number;
  quorum: number;
  authorizedNodes: readonly string[];
}

export interface NodeAttestation {
  nodeId: string;
  planId: string;
  epoch: string;
  signature: string;
}

export function deriveRecoveryEpoch(plan: {
  planId: string;
  planDigest: string;
  targetCheckpoint: { sequence: number; digest?: string; stateDigest?: string };
}): string {
  return createHash("sha256")
    .update(
      `${plan.planId}:${plan.planDigest}:${plan.targetCheckpoint.sequence}:${plan.targetCheckpoint.digest ?? plan.targetCheckpoint.stateDigest ?? ""}`,
    )
    .digest("hex");
}

function sign(epoch: string, nodeId: string, secret: string): string {
  return createHmac("sha256", secret).update(`${epoch}:${nodeId}`).digest("hex");
}

export function createNodeAttestation(
  plan: RecoveryPlan,
  nodeId: string,
  secret: string,
  now = Date.now(),
): NodeAttestation {
  if (!plan.authorizedNodes.includes(nodeId) || now > plan.expiresAt)
    throw new Error("RECOVERY_PLAN_INVALID");
  return {
    nodeId,
    planId: plan.planId,
    epoch: deriveRecoveryEpoch(plan),
    signature: sign(deriveRecoveryEpoch(plan), nodeId, secret),
  };
}

export class ArgusRecoveryMesh {
  private readonly consumed = new Set<string>();
  private readonly quorum: number;
  private readonly secretByNode: ReadonlyMap<string, string>;

  constructor(config: ReadonlyMap<string, string> | { quorum?: number }) {
    this.secretByNode = config instanceof Map ? config : new Map();
    this.quorum =
      config instanceof Map ? 1 : Math.max(1, (config as { quorum?: number }).quorum ?? 2);
  }

  verify(
    plan: RecoveryPlan,
    attestations: readonly NodeAttestation[],
    now = Date.now(),
  ): { approved: boolean; reason: string; epoch: string } {
    const epoch = deriveRecoveryEpoch(plan);
    if (
      !/^([a-f0-9]{64})$/.test(plan.planDigest) ||
      !/^([a-f0-9]{64})$/.test(plan.targetCheckpoint.digest)
    )
      return { approved: false, reason: "INVALID_DIGEST", epoch };
    if (now > plan.expiresAt || plan.quorum < 1 || plan.quorum > plan.authorizedNodes.length)
      return { approved: false, reason: "PLAN_EXPIRED_OR_QUORUM_INVALID", epoch };
    if (this.consumed.has(plan.planId)) return { approved: false, reason: "REPLAY", epoch };

    const valid = new Set<string>();
    for (const attestation of attestations) {
      if (
        attestation.planId !== plan.planId ||
        attestation.epoch !== epoch ||
        valid.has(attestation.nodeId) ||
        !plan.authorizedNodes.includes(attestation.nodeId)
      )
        continue;
      const secret = this.secretByNode.get(attestation.nodeId);
      if (!secret || !/^[a-f0-9]{64}$/.test(attestation.signature)) continue;
      const expected = Buffer.from(sign(epoch, attestation.nodeId, secret), "utf8");
      const received = Buffer.from(attestation.signature, "utf8");
      if (expected.length === received.length && timingSafeEqual(expected, received))
        valid.add(attestation.nodeId);
    }
    if (valid.size < plan.quorum) return { approved: false, reason: "QUORUM_NOT_REACHED", epoch };
    this.consumed.add(plan.planId);
    return { approved: true, reason: "QUORUM_REACHED", epoch };
  }

  static signAttestation(
    secret: string,
    input: {
      nodeId: string;
      planId: string;
      planDigest: string;
      epoch: string;
      attestedAt: string;
    },
  ): NodeAttestation & { planDigest: string; attestedAt: string } {
    const signature = createHmac("sha256", secret)
      .update(`${input.epoch}:${input.nodeId}`)
      .digest("hex");
    return {
      nodeId: input.nodeId,
      planId: input.planId,
      epoch: input.epoch,
      signature,
      planDigest: input.planDigest,
      attestedAt: input.attestedAt,
    };
  }

  verifyAndAuthorize(
    plan: Parameters<typeof deriveRecoveryEpoch>[0],
    attestations: readonly NodeAttestation[],
    secrets: ReadonlyMap<string, string>,
    epoch: string,
    now = Date.now(),
  ) {
    if (epoch !== deriveRecoveryEpoch(plan))
      return { accepted: false, reason: "EPOCH_MISMATCH" } as const;
    const expiresAt = (plan as { expiresAt?: number }).expiresAt;
    if (typeof expiresAt === "number" && now > expiresAt)
      return { accepted: false, reason: "PLAN_EXPIRED" } as const;
    if (this.consumed.has(plan.planId))
      return { accepted: false, reason: "REPLAYED_PLAN" } as const;
    const valid = new Set<string>();
    for (const attestation of attestations) {
      const secret = secrets.get(attestation.nodeId);
      if (!secret || attestation.planId !== plan.planId || attestation.epoch !== epoch) continue;
      const expected = createHmac("sha256", secret)
        .update(`${epoch}:${attestation.nodeId}`)
        .digest("hex");
      if (expected === attestation.signature) valid.add(attestation.nodeId);
    }
    if (valid.size < this.quorum)
      return { accepted: false, reason: "INVALID_ATTESTATION" } as const;
    this.consumed.add(plan.planId);
    return { accepted: true, reason: "QUORUM_REACHED" } as const;
  }
}
