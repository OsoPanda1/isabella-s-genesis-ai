import { createHash, randomUUID } from "node:crypto";

export type AionMode = "DORMANT" | "SHADOW" | "AION_ACTIVE" | "RECOVERY" | "QUARANTINED";
export type AionEvent = "ARGUS_HEARTBEAT" | "ARGUS_DEGRADED" | "ARGUS_LOST" | "ARGUS_RESTORED";

export interface ArgusCheckpoint {
  sequence: number;
  capturedAt: string;
  stateDigest: string;
  policyVersion: string;
  nodeIds: readonly string[];
  healthScore: number;
}

export interface AionSignal {
  event: AionEvent;
  sequence: number;
  observedAt: string;
  argusEpoch: string;
  evidenceDigest: string;
}

export interface AionRecoveryPlan {
  planId: string;
  activatedAt: string;
  mode: "RECOVERY";
  targetCheckpoint: ArgusCheckpoint;
  requiredNodeIds: readonly string[];
  reason: "ARGUS_LOSS";
  planDigest: string;
}

export interface AionConfig {
  checkpointCapacity?: number;
  lossThresholdMs?: number;
  minimumRecoveryNodes?: number;
}

/**
 * ARGUS AION is a dormant continuity node. It does not grant authority while
 * ARGUS is healthy. It observes bounded health/checkpoint signals one or two
 * events behind the active security plane and retains only the minimum state
 * needed to construct a recovery plan.
 *
 * AION deliberately does NOT restart arbitrary infrastructure by itself. It
 * produces a signed/verifiable recovery intent for a separate infrastructure
 * controller. This prevents a compromised AION from becoming a universal
 * destructive command channel.
 */
export class ArgusAion {
  private mode: AionMode = "DORMANT";
  private readonly checkpoints: ArgusCheckpoint[] = [];
  private readonly capacity: number;
  private readonly lossThresholdMs: number;
  private readonly minimumRecoveryNodes: number;
  private lastHeartbeatAt = 0;
  private lastSequence = 0;
  private argusEpoch = "";

  constructor(config: AionConfig = {}) {
    this.capacity = Math.max(3, Math.min(64, config.checkpointCapacity ?? 8));
    this.lossThresholdMs = Math.max(100, Math.min(30_000, config.lossThresholdMs ?? 1_500));
    this.minimumRecoveryNodes = Math.max(1, Math.min(32, config.minimumRecoveryNodes ?? 3));
  }

  getMode(): AionMode {
    return this.mode;
  }

  observeHeartbeat(input: {
    argusEpoch: string;
    sequence: number;
    stateDigest: string;
    policyVersion: string;
    nodeIds: readonly string[];
    healthScore: number;
    capturedAt?: string;
  }): ArgusCheckpoint {
    if (!/^[a-f0-9]{64}$/u.test(input.stateDigest)) throw new Error("aion_invalid_state_digest");
    if (
      !input.argusEpoch ||
      !Number.isInteger(input.sequence) ||
      input.sequence <= this.lastSequence
    )
      throw new Error("aion_invalid_sequence");
    if (!Number.isFinite(input.healthScore) || input.healthScore < 0 || input.healthScore > 1)
      throw new Error("aion_invalid_health_score");
    if (input.nodeIds.length === 0 || input.nodeIds.length > 256)
      throw new Error("aion_invalid_node_set");

    this.argusEpoch = input.argusEpoch;
    this.lastSequence = input.sequence;
    this.lastHeartbeatAt = Date.now();
    this.mode = "SHADOW";

    const checkpoint: ArgusCheckpoint = {
      sequence: input.sequence,
      capturedAt: input.capturedAt ?? new Date().toISOString(),
      stateDigest: input.stateDigest,
      policyVersion: input.policyVersion,
      nodeIds: [...input.nodeIds],
      healthScore: input.healthScore,
    };
    this.checkpoints.push(checkpoint);
    while (this.checkpoints.length > this.capacity) this.checkpoints.shift();
    return checkpoint;
  }

  inspect(event: AionEvent, now = Date.now()): AionSignal | null {
    const observedAt = new Date(now).toISOString();
    const evidence = {
      event,
      lastSequence: this.lastSequence,
      lastHeartbeatAt: this.lastHeartbeatAt,
      argusEpoch: this.argusEpoch,
      latestCheckpoint: this.checkpoints.at(-1)?.stateDigest ?? null,
    };
    const evidenceDigest = createHash("sha256").update(JSON.stringify(evidence)).digest("hex");

    if (event === "ARGUS_HEARTBEAT") {
      if (this.mode !== "AION_ACTIVE" && this.mode !== "RECOVERY") this.mode = "SHADOW";
      return {
        event,
        sequence: this.lastSequence,
        observedAt,
        argusEpoch: this.argusEpoch,
        evidenceDigest,
      };
    }

    if (
      event === "ARGUS_LOST" ||
      (this.lastHeartbeatAt > 0 && now - this.lastHeartbeatAt > this.lossThresholdMs)
    ) {
      if (this.mode !== "AION_ACTIVE" && this.mode !== "RECOVERY") this.mode = "AION_ACTIVE";
      return {
        event: "ARGUS_LOST",
        sequence: this.lastSequence,
        observedAt,
        argusEpoch: this.argusEpoch,
        evidenceDigest,
      };
    }

    if (event === "ARGUS_DEGRADED") {
      this.mode = "SHADOW";
      return {
        event,
        sequence: this.lastSequence,
        observedAt,
        argusEpoch: this.argusEpoch,
        evidenceDigest,
      };
    }

    if (event === "ARGUS_RESTORED") {
      if (this.mode !== "QUARANTINED") this.mode = "SHADOW";
      return {
        event,
        sequence: this.lastSequence,
        observedAt,
        argusEpoch: this.argusEpoch,
        evidenceDigest,
      };
    }

    return null;
  }

  activateRecovery(now = Date.now()): AionRecoveryPlan {
    if (this.mode !== "AION_ACTIVE" && this.mode !== "RECOVERY")
      throw new Error("aion_not_activated");
    const checkpoints = this.checkpoints;
    if (checkpoints.length < 2) throw new Error("aion_insufficient_recovery_history");

    // Two-step rollback: never select the newest observation because it may be
    // the first corrupted state. Prefer the checkpoint two positions behind it.
    const target = checkpoints[Math.max(0, checkpoints.length - 3)]!;
    const requiredNodeIds = target.nodeIds.slice(0, Math.max(this.minimumRecoveryNodes, 1));
    if (requiredNodeIds.length < this.minimumRecoveryNodes)
      throw new Error("aion_insufficient_recovery_nodes");

    const planCore = {
      planId: randomUUID(),
      activatedAt: new Date(now).toISOString(),
      mode: "RECOVERY" as const,
      targetCheckpoint: target,
      requiredNodeIds,
      reason: "ARGUS_LOSS" as const,
    };
    const planDigest = createHash("sha256").update(JSON.stringify(planCore)).digest("hex");
    this.mode = "RECOVERY";
    return { ...planCore, planDigest };
  }

  quarantine(): void {
    this.mode = "QUARANTINED";
  }
}
