import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

/**
 * Isabella Learning Core
 *
 * Token-independent learning layer. This module does not pretend to update model
 * weights. It learns durable, auditable state: concepts, procedures, preferences,
 * episodes, outcomes and competence. A provider can consume that state during
 * inference without coupling the learning model to a tokenizer or vendor.
 */

export const LearningModeSchema = z.enum([
  "supervised",
  "contrastive",
  "preference",
  "episodic",
  "procedural",
  "reflective",
  "multimodal",
]);
export type LearningMode = z.infer<typeof LearningModeSchema>;

export const LearningExampleSchema = z.object({
  mode: LearningModeSchema,
  input: z.string().min(1).max(100_000),
  target: z.string().max(100_000).optional(),
  negative: z.string().max(100_000).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  outcome: z.enum(["success", "partial", "failure", "unknown"]).default("unknown"),
  quality: z.number().min(0).max(1).default(0.5),
  consent: z.boolean().default(false),
  source: z.string().min(1).max(256),
  skillIds: z.array(z.string().min(1).max(80)).max(32).default([]),
});
export type LearningExample = z.infer<typeof LearningExampleSchema>;

export interface LearningMemory {
  id: string;
  mode: LearningMode;
  source: string;
  signature: string;
  concepts: string[];
  procedures: string[];
  preferences: string[];
  outcome: LearningExample["outcome"];
  quality: number;
  createdAt: string;
  lastReinforcedAt: string;
  reinforcementCount: number;
}

export interface Competence {
  skillId: string;
  score: number;
  observations: number;
  successes: number;
  failures: number;
  lastUpdatedAt: string;
}

export interface LearningSnapshot {
  memories: LearningMemory[];
  competence: Competence[];
  conceptWeights: Record<string, number>;
  version: 1;
}

export interface LearningStore {
  upsert(memory: LearningMemory): void;
  list(): LearningMemory[];
  get(id: string): LearningMemory | undefined;
  getBySignature(signature: string): LearningMemory | undefined;
  replace(snapshot: LearningSnapshot): void;
  snapshot(): LearningSnapshot;
}

export class InMemoryLearningStore implements LearningStore {
  private readonly memories = new Map<string, LearningMemory>();
  // signature → memory id, so dedupe on ingest is O(1) instead of a full scan.
  private readonly signatureIndex = new Map<string, string>();
  private competence: Competence[] = [];
  private conceptWeights: Record<string, number> = {};

  upsert(memory: LearningMemory): void {
    this.memories.set(memory.id, { ...memory });
    this.signatureIndex.set(memory.signature, memory.id);
  }

  list(): LearningMemory[] {
    return [...this.memories.values()].map((memory) => ({
      ...memory,
      concepts: [...memory.concepts],
      procedures: [...memory.procedures],
      preferences: [...memory.preferences],
    }));
  }

  get(id: string): LearningMemory | undefined {
    const memory = this.memories.get(id);
    return memory
      ? {
          ...memory,
          concepts: [...memory.concepts],
          procedures: [...memory.procedures],
          preferences: [...memory.preferences],
        }
      : undefined;
  }

  getBySignature(signature: string): LearningMemory | undefined {
    const id = this.signatureIndex.get(signature);
    return id ? this.get(id) : undefined;
  }

  replace(snapshot: LearningSnapshot): void {
    this.memories.clear();
    this.signatureIndex.clear();
    for (const memory of snapshot.memories) {
      this.memories.set(memory.id, { ...memory });
      this.signatureIndex.set(memory.signature, memory.id);
    }
    this.competence = snapshot.competence.map((item) => ({ ...item }));
    this.conceptWeights = { ...snapshot.conceptWeights };
  }

  snapshot(): LearningSnapshot {
    return {
      version: 1,
      memories: this.list(),
      competence: this.competence.map((item) => ({ ...item })),
      conceptWeights: { ...this.conceptWeights },
    };
  }

  updateCompetence(
    skillId: string,
    outcome: LearningExample["outcome"],
    quality: number,
  ): Competence {
    const existing = this.competence.find((item) => item.skillId === skillId);
    const now = new Date().toISOString();
    const success = outcome === "success" ? 1 : 0;
    const failure = outcome === "failure" ? 1 : 0;
    const signal = outcome === "success" ? quality : outcome === "failure" ? -quality : 0;
    if (!existing) {
      const created = {
        skillId,
        score: clamp(0.5 + signal * 0.25, 0, 1),
        observations: 1,
        successes: success,
        failures: failure,
        lastUpdatedAt: now,
      };
      this.competence.push(created);
      return { ...created };
    }
    const learningRate = 1 / Math.min(existing.observations + 1, 20);
    existing.score = clamp(existing.score + signal * learningRate, 0, 1);
    existing.observations += 1;
    existing.successes += success;
    existing.failures += failure;
    existing.lastUpdatedAt = now;
    return { ...existing };
  }

  updateConcepts(concepts: string[], quality: number): void {
    for (const concept of concepts) {
      const current = this.conceptWeights[concept] ?? 0;
      this.conceptWeights[concept] = clamp(current * 0.98 + quality * 0.02, 0, 1);
    }
  }
}

export interface LearningResult {
  accepted: boolean;
  reason?: string;
  memory?: LearningMemory;
  competence: Competence[];
  concepts: string[];
}

export class IsabellaLearningEngine {
  constructor(private readonly store: InMemoryLearningStore = new InMemoryLearningStore()) {}

  ingest(raw: unknown): LearningResult {
    const parsed = LearningExampleSchema.safeParse(raw);
    if (!parsed.success)
      return {
        accepted: false,
        reason: parsed.error.issues.map((issue) => issue.message).join("; "),
        competence: [],
        concepts: [],
      };
    const example = sanitizeExample(parsed.data);
    if (!example.consent && example.mode !== "supervised") {
      return {
        accepted: false,
        reason: "Explicit consent is required for durable non-supervised learning.",
        competence: [],
        concepts: [],
      };
    }
    if (
      containsPromptInjection(example.input) ||
      (example.target && containsPromptInjection(example.target))
    ) {
      return {
        accepted: false,
        reason: "Learning sample rejected by prompt-injection guard.",
        competence: [],
        concepts: [],
      };
    }

    const concepts = extractConcepts(example.input, example.target, example.context);
    const procedures =
      example.mode === "procedural" ? extractProcedures(example.input, example.target) : [];
    const preferences =
      example.mode === "preference" ? extractPreferences(example.input, example.target) : [];
    const signature = stableSignature(example, concepts);
    const existing = this.store.getBySignature(signature);
    const now = new Date().toISOString();
    let memory: LearningMemory;

    if (existing) {
      memory = {
        ...existing,
        quality: clamp(existing.quality * 0.8 + example.quality * 0.2, 0, 1),
        lastReinforcedAt: now,
        reinforcementCount: existing.reinforcementCount + 1,
      };
    } else {
      memory = {
        id: randomUUID(),
        mode: example.mode,
        source: example.source,
        signature,
        concepts,
        procedures,
        preferences,
        outcome: example.outcome,
        quality: example.quality,
        createdAt: now,
        lastReinforcedAt: now,
        reinforcementCount: 1,
      };
    }
    this.store.upsert(memory);
    this.store.updateConcepts(concepts, example.quality);
    const competence = example.skillIds.map((skillId) =>
      this.store.updateCompetence(skillId, example.outcome, example.quality),
    );
    return { accepted: true, memory, competence, concepts };
  }

  retrieve(query: string, limit = 8): LearningMemory[] {
    const safeQuery = sanitizeText(query);
    const queryConcepts = extractConcepts(safeQuery);
    return this.store
      .list()
      .map((memory) => ({ memory, score: relevance(memory, queryConcepts) }))
      .filter((item) => item.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score || b.memory.lastReinforcedAt.localeCompare(a.memory.lastReinforcedAt),
      )
      .slice(0, Math.max(1, Math.min(limit, 50)))
      .map((item) => item.memory);
  }

  evaluate(query: string): {
    score: number;
    supportingMemories: string[];
    concepts: string[];
  } {
    const concepts = extractConcepts(query);
    const memories = this.retrieve(query, 12);
    const score = clamp(
      memories.reduce((sum, memory) => sum + memory.quality, 0) / Math.max(memories.length, 1),
      0,
      1,
    );
    return {
      score,
      supportingMemories: memories.map((memory) => memory.id),
      concepts,
    };
  }

  snapshot(): LearningSnapshot {
    return this.store.snapshot();
  }

  restore(snapshot: LearningSnapshot): void {
    if (snapshot.version !== 1) throw new Error("Unsupported learning snapshot version");
    this.store.replace(snapshot);
  }
}

export function createIsabellaLearningEngine(
  store?: InMemoryLearningStore,
): IsabellaLearningEngine {
  return new IsabellaLearningEngine(store);
}

export function createLearningApi(engine: IsabellaLearningEngine) {
  return {
    ingest: (payload: unknown) => engine.ingest(payload),
    retrieve: (query: string, limit?: number) => engine.retrieve(query, limit),
    evaluate: (query: string) => engine.evaluate(query),
    snapshot: () => engine.snapshot(),
  };
}

function sanitizeExample(example: LearningExample): LearningExample {
  return {
    ...example,
    input: sanitizeText(example.input),
    ...(example.target ? { target: sanitizeText(example.target) } : {}),
    ...(example.negative ? { negative: sanitizeText(example.negative) } : {}),
    source: sanitizeText(example.source).slice(0, 256),
    skillIds: [...new Set(example.skillIds.map((id) => sanitizeText(id).toLowerCase()))],
    quality: clamp(example.quality, 0, 1),
  };
}

function sanitizeText(value: string): string {
  let sanitized = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code >= 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) sanitized += character;
  }
  return sanitized.trim();
}

function containsPromptInjection(value: string): boolean {
  const normalized = value.toLowerCase().replace(/\s+/g, " ").trim();
  return [
    "ignore all instructions",
    "ignore previous instructions",
    "ignore prior instructions",
    "system prompt",
    "developer message",
    "reveal the secret",
    "reveal secret",
    "jailbreak",
  ].some((term) => normalized.includes(term));
}

function extractConcepts(...values: Array<string | Record<string, unknown> | undefined>): string[] {
  const text = values
    .filter((value) => value !== undefined)
    .map((value) => (typeof value === "string" ? value : JSON.stringify(value)))
    .join(" ")
    .toLowerCase();
  const words =
    text
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .match(/[a-záéíóúñü]{4,}/gi) ?? [];
  const stop = new Set([
    "para",
    "como",
    "desde",
    "este",
    "esta",
    "that",
    "with",
    "from",
    "have",
    "will",
    "then",
    "when",
    "what",
    "into",
    "sobre",
    "entre",
  ]);
  return [
    ...new Set(words.filter((word) => !stop.has(word)).map((word) => word.slice(0, 48))),
  ].slice(0, 32);
}

function extractProcedures(input?: string, target?: string): string[] {
  const text = [input, target].filter(Boolean).join(" ");
  return (text.match(/(?:\d+[.)]|primero|despues|después|luego|finalmente)[^.!?]{3,160}/gi) ?? [])
    .slice(0, 12)
    .map(sanitizeText);
}

function extractPreferences(input?: string, target?: string): string[] {
  const text = [input, target].filter(Boolean).join(" ");
  return (
    text.match(
      /(?:prefiero|preferimos|evita|evitar|me gusta|no me gusta|should|prefer|avoid)[^.!?]{2,140}/gi,
    ) ?? []
  )
    .slice(0, 12)
    .map(sanitizeText);
}

function stableSignature(example: LearningExample, concepts: string[]): string {
  return createHash("sha3-512")
    .update(
      JSON.stringify({
        mode: example.mode,
        input: example.input,
        target: example.target ?? "",
        negative: example.negative ?? "",
        concepts,
      }),
    )
    .digest("hex");
}

function relevance(memory: LearningMemory, concepts: string[]): number {
  if (concepts.length === 0) return 0;
  const overlap =
    concepts.filter((concept) => memory.concepts.includes(concept)).length / concepts.length;
  const reinforcement = Math.min(memory.reinforcementCount / 10, 1);
  return overlap * 0.75 + memory.quality * 0.2 + reinforcement * 0.05;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
