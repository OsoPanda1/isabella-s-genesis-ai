import { classifyTextRisk, type TextMLSignal } from "./text-classifier";
import { predictBinary, trainBinaryClassifier, type BinaryDataset } from "./engine";
import type { NativeMLHooks, ModelIdentity, PredictionResult, TrainingResult } from "./types";

/** Canonical Isabella ML facade. Every native model remains inspectable and governed. */
export const NATIVE_ML_CONTRACT_VERSION = "1.0.0";

export interface NativeMLRuntime {
  classifyRisk(text: string, hooks?: NativeMLHooks): TextMLSignal;
  trainBinary(
    input: BinaryDataset,
    ownerId: string,
    territoryId: string,
    hooks?: NativeMLHooks,
  ): Promise<TrainingResult>;
  predictBinary(
    model: ModelIdentity,
    weights: number[],
    bias: number,
    features: number[][],
    hooks?: NativeMLHooks,
  ): Promise<PredictionResult<number>>;
}

export const nativeML: NativeMLRuntime = {
  classifyRisk: classifyTextRisk,
  trainBinary: trainBinaryClassifier,
  predictBinary,
};

export { classifyTextRisk, predictBinary, trainBinaryClassifier };
export type {
  BinaryDataset,
  NativeMLHooks,
  ModelIdentity,
  PredictionResult,
  TrainingResult,
  TextMLSignal,
};
export default nativeML;
