import { createHash } from "node:crypto";
import type { NativeMLHooks } from "./types";

export interface TextMLSignal {
  features: number[];
  labels: string[];
  probability: number;
  confidence: number;
  riskScore: number;
  modelId: string;
  modelHash: string;
}

const MODEL_VERSION = "native-text-risk-1.0.0";
const FEATURE_LABELS = [
  "instruction_override",
  "secret_request",
  "external_action",
  "sensitive_data",
] as const;
const WEIGHTS = [1.8, 2.4, 1.1, 1.5];
const BIAS = -2.2;
const MAX_SCAN_CHARS = 32_000;

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, value))));
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

// Constant for a given model version: computed once, not on every request.
const MODEL_HASH = hash({ MODEL_VERSION, WEIGHTS, BIAS, FEATURE_LABELS });

function normalizedTokens(input: string): Set<string> {
  return new Set(
    input
      .toLocaleLowerCase("es-MX")
      .normalize("NFKC")
      .match(/[\p{L}\p{N}\-_]+/gu) ?? [],
  );
}

function hasAny(tokens: Set<string>, values: readonly string[]): number {
  return values.some((value) => tokens.has(value)) ? 1 : 0;
}

/** Deterministic, inspectable text classifier. It is a safety signal, never an authority decision. */
export function classifyTextRisk(input: string, hooks: NativeMLHooks = {}): TextMLSignal {
  const scanned = input.length > MAX_SCAN_CHARS ? input.slice(0, MAX_SCAN_CHARS) : input;
  const tokens = normalizedTokens(scanned);
  const features = [
    hasAny(tokens, ["ignora", "override", "bypass", "system", "instrucciones"]),
    hasAny(tokens, ["secreto", "token", "password", "api", "key", "credencial"]),
    hasAny(tokens, ["ejecuta", "elimina", "transfiere", "publica", "despliega"]),
    hasAny(tokens, ["personal", "privado", "pago", "salud", "identidad"]),
  ];
  const logit = BIAS + features.reduce((sum, feature, index) => sum + feature * WEIGHTS[index]!, 0);
  const probability = sigmoid(logit);
  const modelHash = MODEL_HASH;
  const signal: TextMLSignal = {
    features,
    labels: FEATURE_LABELS.filter((_, index) => features[index] === 1),
    probability,
    confidence: Math.max(probability, 1 - probability),
    riskScore: probability,
    modelId: MODEL_VERSION,
    modelHash,
  };
  void hooks.audit?.("native_ml.text_risk_scored", {
    modelId: signal.modelId,
    modelHash: signal.modelHash,
    riskScore: signal.riskScore,
    labels: signal.labels,
  });
  return signal;
}
