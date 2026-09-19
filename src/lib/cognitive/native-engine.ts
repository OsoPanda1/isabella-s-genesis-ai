/**
 * Isabella Cognitive Native Engine
 * Deterministic, dependency-light ML plane for FGAIS.
 * No provider/network access. Suitable for local, edge and federated nodes.
 */
import { createHash, randomUUID } from "node:crypto";

export type Task =
  "classification" | "regression" | "clustering" | "anomaly" | "ranking" | "timeseries";
export type Vector = number[];
export interface Dataset {
  id: string;
  version: string;
  features: string[];
  rows: Vector[];
  labels?: number[];
  hash: string;
}
export interface ModelArtifact {
  modelId: string;
  version: string;
  task: Task;
  algorithm: string;
  weights: number[][];
  bias: number[];
  featureCount: number;
  artifactHash: string;
  datasetHash: string;
  createdAt: string;
}
export interface Evaluation {
  modelId: string;
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  mse?: number;
  rmse?: number;
  r2?: number;
  fairness?: { group: string; positiveRate: number; sampleCount: number }[];
  passed: boolean;
  thresholds: Record<string, number>;
}

const finite = (x: number) => Number.isFinite(x);
function assertMatrix(X: Vector[]): void {
  if (!X.length || !X.every((r) => r.length > 0 && r.every(finite)))
    throw new Error("Dataset vacío o no finito");
  const n = X[0].length;
  if (!X.every((r) => r.length === n)) throw new Error("Dimensiones inconsistentes");
}
function assertLabels(y: number[], n: number): void {
  if (y.length !== n || !y.every(finite)) throw new Error("Labels inválidos");
}
export function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableSerialize(o[k])}`)
    .join(",")}}`;
}
export function sha256(value: unknown): string {
  return createHash("sha256")
    .update(typeof value === "string" ? value : stableSerialize(value))
    .digest("hex");
}
function dot(a: Vector, b: Vector): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
function sigmoid(x: number): number {
  const z = Math.max(-60, Math.min(60, x));
  return 1 / (1 + Math.exp(-z));
}
function mean(a: number[]): number {
  return a.reduce((s, x) => s + x, 0) / a.length;
}
function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export class NativeMLEngine {
  trainClassification(
    X: Vector[],
    y: number[],
    options: { epochs?: number; learningRate?: number } = {},
  ): ModelArtifact {
    assertMatrix(X);
    assertLabels(y, X.length);
    const classes = [...new Set(y)].sort((a, b) => a - b);
    if (classes.length < 2) throw new Error("Se requieren al menos dos clases");
    if (classes.length > 2) return this.trainOvR(X, y, classes, options);
    const w = new Array(X[0].length).fill(0),
      lr = options.learningRate ?? 0.05,
      epochs = options.epochs ?? 300;
    let b = 0;
    for (let e = 0; e < epochs; e++) {
      const gw = new Array(w.length).fill(0);
      let gb = 0;
      for (let i = 0; i < X.length; i++) {
        const p = sigmoid(dot(w, X[i]) + b);
        const err = p - y[i];
        for (let j = 0; j < w.length; j++) gw[j] += err * X[i][j];
        gb += err;
      }
      for (let j = 0; j < w.length; j++) w[j] -= (lr * gw[j]) / X.length;
      b -= (lr * gb) / X.length;
    }
    return this.artifact("classification", "logistic-regression", [w], [b], X, y);
  }
  private trainOvR(
    X: Vector[],
    y: number[],
    classes: number[],
    options: { epochs?: number; learningRate?: number },
  ): ModelArtifact {
    const ws: number[][] = [],
      bs: number[] = [];
    for (const c of classes) {
      const yy = y.map((v) => (v === c ? 1 : 0));
      const m = this.trainClassification(X, yy, { ...options });
      ws.push(m.weights[0]);
      bs.push(m.bias[0]);
    }
    return this.artifact("classification", "one-vs-rest-logistic", ws, bs, X, y);
  }
  trainRegression(
    X: Vector[],
    y: number[],
    options: { epochs?: number; learningRate?: number } = {},
  ): ModelArtifact {
    assertMatrix(X);
    assertLabels(y, X.length);
    const w = new Array(X[0].length).fill(0),
      lr = options.learningRate ?? 0.01,
      epochs = options.epochs ?? 500;
    let b = 0;
    for (let e = 0; e < epochs; e++) {
      const gw = new Array(w.length).fill(0);
      let gb = 0;
      for (let i = 0; i < X.length; i++) {
        const err = dot(w, X[i]) + b - y[i];
        for (let j = 0; j < w.length; j++) gw[j] += err * X[i][j];
        gb += err;
      }
      for (let j = 0; j < w.length; j++) w[j] -= (lr * 2 * gw[j]) / X.length;
      b -= (lr * 2 * gb) / X.length;
    }
    return this.artifact("regression", "linear-regression", [w], [b], X, y);
  }
  predict(model: ModelArtifact, X: Vector[]): number[] {
    assertMatrix(X);
    if (X[0].length !== model.featureCount) throw new Error("Feature count mismatch");
    if (model.algorithm.includes("logistic")) {
      return X.map((row) => {
        const scores = model.weights.map((w, i) => sigmoid(dot(w, row) + (model.bias[i] ?? 0)));
        return scores.length === 1
          ? scores[0] >= 0.5
            ? 1
            : 0
          : scores.indexOf(Math.max(...scores));
      });
    }
    return X.map((row) => dot(model.weights[0], row) + model.bias[0]);
  }
  probabilities(model: ModelArtifact, X: Vector[]): number[][] {
    if (!model.algorithm.includes("logistic")) throw new Error("Probabilities require classifier");
    return X.map((row) => model.weights.map((w, i) => sigmoid(dot(w, row) + (model.bias[i] ?? 0))));
  }
  kmeans(X: Vector[], k: number, iterations = 50): { centroids: Vector[]; assignments: number[] } {
    assertMatrix(X);
    if (!Number.isInteger(k) || k < 2 || k > X.length) throw new Error("Invalid k");
    const c = X.slice(0, k).map((r) => [...r]);
    const a = new Array(X.length).fill(0);
    for (let it = 0; it < iterations; it++) {
      let changed = false;
      for (let i = 0; i < X.length; i++) {
        let best = 0,
          bestD = Infinity;
        for (let j = 0; j < k; j++) {
          const d = X[i].reduce((s, v, p) => s + (v - c[j][p]) ** 2, 0);
          if (d < bestD) {
            bestD = d;
            best = j;
          }
        }
        if (a[i] !== best) {
          a[i] = best;
          changed = true;
        }
      }
      const sums = c.map(() => new Array(X[0].length).fill(0)),
        counts = new Array(k).fill(0);
      X.forEach((r, i) => {
        counts[a[i]]++;
        r.forEach((v, p) => (sums[a[i]][p] += v));
      });
      for (let j = 0; j < k; j++) if (counts[j]) c[j] = sums[j].map((v) => v / counts[j]);
      if (!changed) break;
    }
    return { centroids: c, assignments: a };
  }
  anomaly(X: Vector[], z = 3): { scores: number[]; anomalies: boolean[] } {
    assertMatrix(X);
    const rows = X.length;
    const dims = X[0]!.length;
    // Single pass for the mean and one for the variance: avoids allocating a
    // temporary column array per feature (previous form built O(dims) arrays).
    const mu = new Array<number>(dims).fill(0);
    for (let i = 0; i < rows; i++) {
      const row = X[i]!;
      for (let j = 0; j < dims; j++) mu[j] += row[j]!;
    }
    for (let j = 0; j < dims; j++) mu[j] /= rows;
    const variance = new Array<number>(dims).fill(0);
    for (let i = 0; i < rows; i++) {
      const row = X[i]!;
      for (let j = 0; j < dims; j++) {
        const delta = row[j]! - mu[j]!;
        variance[j] += delta * delta;
      }
    }
    const sd = variance.map((value) => Math.sqrt(value / rows) || 1);
    const scores = X.map((r) => Math.sqrt(mean(r.map((v, j) => ((v - mu[j]!) / sd[j]!) ** 2))));
    return { scores, anomalies: scores.map((s) => s >= z) };
  }
  drift(
    reference: Vector[],
    current: Vector[],
    bins = 10,
  ): {
    psi: number;
    features: { feature: number; psi: number; drift: boolean }[];
  } {
    assertMatrix(reference);
    assertMatrix(current);
    const fs = reference[0].map((_, j) => {
      const all = reference.map((r) => r[j]).concat(current.map((r) => r[j]));
      const min = Math.min(...all),
        max = Math.max(...all),
        width = (max - min || 1) / bins;
      const hist = (rows: Vector[]) => {
        const h = new Array(bins).fill(0);
        rows.forEach((r) => h[Math.min(bins - 1, Math.max(0, Math.floor((r[j] - min) / width)))]++);
        return h.map((v) => Math.max(v / rows.length, 1e-6));
      };
      const p = hist(reference),
        q = hist(current);
      const psi = p.reduce((s, v, i) => s + (v - q[i]) * Math.log(v / q[i]), 0);
      return { feature: j, psi, drift: psi >= 0.2 };
    });
    return { psi: mean(fs.map((f) => f.psi)), features: fs };
  }
  evaluateClassification(
    y: number[],
    pred: number[],
    groups?: { group: string; value: number }[],
  ): Evaluation {
    assertLabels(y, y.length);
    if (pred.length !== y.length) throw new Error("Prediction length mismatch");
    const tp = y.filter((v, i) => v === 1 && pred[i] === 1).length,
      fp = y.filter((v, i) => v !== 1 && pred[i] === 1).length,
      fn = y.filter((v, i) => v === 1 && pred[i] !== 1).length,
      acc = mean(y.map((v, i) => (v === pred[i] ? 1 : 0))),
      precision = tp / (tp + fp || 1),
      recall = tp / (tp + fn || 1),
      f1 = (2 * precision * recall) / (precision + recall || 1);
    const fairness = groups
      ? groups.map((g) => {
          const idx = groups.map((x, i) => (x.group === g.group ? i : -1)).filter((i) => i >= 0);
          const positiveRate = mean(idx.map((i) => (pred[i] === 1 ? 1 : 0)));
          return { group: g.group, positiveRate, sampleCount: idx.length };
        })
      : undefined;
    return {
      modelId: "evaluation",
      accuracy: acc,
      precision,
      recall,
      f1,
      fairness,
      passed: acc >= 0.8 && f1 >= 0.7,
      thresholds: { accuracy: 0.8, f1: 0.7 },
    };
  }
  evaluateRegression(y: number[], pred: number[]): Evaluation {
    if (y.length !== pred.length || !y.length) throw new Error("Invalid regression evaluation");
    const mse = mean(y.map((v, i) => (v - pred[i]) ** 2)),
      rmse = Math.sqrt(mse),
      ym = mean(y),
      ssRes = y.reduce((s, v, i) => s + (v - pred[i]) ** 2, 0),
      ssTot = y.reduce((s, v) => s + (v - ym) ** 2, 0);
    const r2 = 1 - ssRes / (ssTot || 1);
    return {
      modelId: "evaluation",
      mse,
      rmse,
      r2,
      passed: r2 >= 0.5,
      thresholds: { r2: 0.5 },
    };
  }
  private artifact(
    task: Task,
    algorithm: string,
    weights: number[][],
    bias: number[],
    X: Vector[],
    y: number[],
  ): ModelArtifact {
    const datasetHash = sha256({ X, y }),
      base = {
        modelId: `native-${randomUUID()}`,
        version: "1.0.0",
        task,
        algorithm,
        weights,
        bias,
        featureCount: X[0].length,
        datasetHash,
        createdAt: new Date().toISOString(),
      };
    return { ...base, artifactHash: sha256(base) };
  }
}
export function weightedAverage(values: number[][], weights: number[]): number[] {
  if (
    !values.length ||
    values.some((v) => v.length !== values[0].length) ||
    weights.length !== values.length
  )
    throw new Error("Invalid aggregation");
  const total = weights.reduce((s, w) => s + w, 0);
  if (!(total > 0)) throw new Error("Invalid aggregation weights");
  return values[0].map((_, j) => values.reduce((s, v, i) => s + v[j] * weights[i], 0) / total);
}
export function robustMedianAggregate(values: number[][]): number[] {
  if (!values.length) throw new Error("No updates");
  return values[0].map((_, j) => median(values.map((v) => v[j])));
}
