import { createHash } from "node:crypto";

export type AionState = "LEARNING" | "NORMAL" | "SUSPICIOUS" | "CRITICAL";

export interface ArgusObservation {
  latencyMs: number;
  riskScore: number;
  vetoed: boolean;
  policyVersion: string;
  sequence: number;
  decisionDigest: string;
  timestamp: number;
}

export interface AionAssessment {
  state: AionState;
  anomalyScore: number;
  reasons: string[];
  baselineSize: number;
  observationDigest: string;
}

interface NumericBaseline {
  latency: number[];
  risk: number[];
  veto: number[];
  policyVersions: string[];
}

const MAX_BASELINE = 128;
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function robustDeviation(value: number, values: number[]): number {
  if (values.length < 4) return 0;
  const center = median(values);
  const mad = median(values.map((item) => Math.abs(item - center)));
  if (mad === 0) return value === center ? 0 : 1;
  return clamp(Math.abs(value - center) / (6 * mad));
}

function validObservation(observation: ArgusObservation): boolean {
  return (
    Number.isFinite(observation.latencyMs) &&
    observation.latencyMs >= 0 &&
    Number.isFinite(observation.riskScore) &&
    observation.riskScore >= 0 &&
    observation.riskScore <= 1 &&
    Number.isSafeInteger(observation.sequence) &&
    observation.sequence >= 0 &&
    /^[a-f0-9]{32,128}$/i.test(observation.decisionDigest) &&
    observation.policyVersion.length > 0 &&
    observation.policyVersion.length <= 64
  );
}

export class ArgusAionBehavioralSentinel {
  private readonly baseline: NumericBaseline = {
    latency: [],
    risk: [],
    veto: [],
    policyVersions: [],
  };
  private readonly maxBaseline: number;
  private readonly minimumSamples: number;
  private lastSequence = -1;
  private lastTimestamp = 0;

  constructor(config: { baselineWindow?: number; minimumSamples?: number } = {}) {
    this.maxBaseline = Math.max(4, config.baselineWindow ?? MAX_BASELINE);
    this.minimumSamples = Math.max(1, config.minimumSamples ?? 4);
  }

  observe(observation: ArgusObservation): AionAssessment {
    if (!validObservation(observation)) {
      return this.assessment("CRITICAL", 1, ["invalid_observation"]);
    }
    if (observation.sequence <= this.lastSequence || observation.timestamp < this.lastTimestamp) {
      return this.assessment("CRITICAL", 1, ["sequence_or_time_regression"]);
    }

    const deviations = {
      latency: robustDeviation(observation.latencyMs, this.baseline.latency),
      risk: robustDeviation(observation.riskScore, this.baseline.risk),
      veto: robustDeviation(observation.vetoed ? 1 : 0, this.baseline.veto),
      policy:
        this.baseline.policyVersions.length > 0 &&
        !this.baseline.policyVersions.includes(observation.policyVersion)
          ? 1
          : 0,
    };
    const score = clamp(
      deviations.latency * 0.34 +
        deviations.risk * 0.31 +
        deviations.veto * 0.25 +
        deviations.policy * 0.1,
    );
    const reasons = Object.entries(deviations)
      .filter(([, value]) => value >= 0.5)
      .map(([key]) => `${key}_deviation`);
    const state: AionState =
      this.baseline.latency.length < this.minimumSamples
        ? "LEARNING"
        : score >= 0.8
          ? "CRITICAL"
          : score >= 0.45
            ? "SUSPICIOUS"
            : "NORMAL";

    this.lastSequence = observation.sequence;
    this.lastTimestamp = observation.timestamp;
    this.push(this.baseline.latency, observation.latencyMs);
    this.push(this.baseline.risk, observation.riskScore);
    this.push(this.baseline.veto, observation.vetoed ? 1 : 0);
    this.push(this.baseline.policyVersions, observation.policyVersion);
    return this.assessment(state, score, reasons, observation);
  }

  snapshot() {
    return {
      state:
        this.baseline.latency.length < this.minimumSamples
          ? ("LEARNING" as const)
          : ("NORMAL" as const),
      size: this.baseline.latency.length,
      lastSequence: this.lastSequence,
    };
  }

  private push<T>(values: T[], value: T) {
    values.push(value);
    if (values.length > this.maxBaseline) values.shift();
  }
  private assessment(
    state: AionState,
    anomalyScore: number,
    reasons: string[],
    observation?: ArgusObservation,
  ): AionAssessment {
    const observationDigest = createHash("sha256")
      .update(JSON.stringify(observation ?? { state, anomalyScore, reasons }))
      .digest("hex");
    return {
      state,
      anomalyScore,
      reasons,
      baselineSize: this.baseline.latency.length,
      observationDigest,
    };
  }
}

/** Adapter for the strict, digest-oriented observation contract. */
export class ArgusAionBehaviorSentinel {
  private readonly sentinel: ArgusAionBehavioralSentinel;
  private lastSequence = 0;

  constructor(config: { baselineWindow?: number; minimumSamples?: number } = {}) {
    this.sentinel = new ArgusAionBehavioralSentinel(config);
  }

  observe(sample: {
    sequence: number;
    capturedAt: string;
    latencyMs: number;
    riskScore: number;
    vetoRate: number;
    policyVersion: string;
    decisionDigest: string;
  }) {
    if (sample.sequence <= this.lastSequence) throw new Error("aion_behavior_invalid_sequence");
    this.lastSequence = sample.sequence;
    if (sample.sequence < 1) throw new Error("aion_behavior_invalid_sequence");
    if (!/^[a-f0-9]{64}$/u.test(sample.decisionDigest)) {
      throw new Error("aion_behavior_invalid_integrity");
    }
    const assessment = this.sentinel.observe({
      sequence: sample.sequence,
      timestamp: Date.parse(sample.capturedAt),
      latencyMs: sample.latencyMs,
      riskScore: sample.riskScore,
      vetoed: sample.vetoRate > 0.5,
      policyVersion: sample.policyVersion,
      decisionDigest: sample.decisionDigest,
    });
    return {
      ...assessment,
      status: assessment.state,
      sampleCount: assessment.baselineSize,
      policyChanged: assessment.reasons.includes("policy_deviation"),
      latencyDeviation: assessment.anomalyScore,
      riskDeviation: assessment.anomalyScore,
      vetoDeviation: assessment.anomalyScore,
      assessmentDigest: assessment.observationDigest,
    };
  }
}
