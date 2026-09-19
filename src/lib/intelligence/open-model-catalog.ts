export interface OpenModelCandidate {
  modelId: string;
  family: string;
  license: "Apache-2.0" | "MIT";
  local: boolean;
  freeLocalInference: boolean;
  productionApproved: false;
  rationale: string;
}

/**
 * Curated open-weight candidates checked for published licensing during the
 * 2026-09-09 hardening pass. This catalog is NOT a safety certification.
 * Open weights and permissive licenses do not establish behavioral safety.
 * Every candidate remains evaluation-only until evidence-backed approval.
 */
export const OPEN_MODEL_CATALOG: readonly OpenModelCandidate[] = [
  {
    modelId: "Qwen/Qwen3-4B",
    family: "Qwen3",
    license: "Apache-2.0",
    local: true,
    freeLocalInference: true,
    productionApproved: false,
    rationale: "Small local evaluation target.",
  },
  {
    modelId: "Qwen/Qwen3-8B",
    family: "Qwen3",
    license: "Apache-2.0",
    local: true,
    freeLocalInference: true,
    productionApproved: false,
    rationale: "Balanced local evaluation target.",
  },
  {
    modelId: "Qwen/Qwen3-30B-A3B",
    family: "Qwen3",
    license: "Apache-2.0",
    local: true,
    freeLocalInference: true,
    productionApproved: false,
    rationale: "MoE reasoning/capability evaluation target.",
  },
  {
    modelId: "openai/gpt-oss-20b",
    family: "gpt-oss",
    license: "Apache-2.0",
    local: true,
    freeLocalInference: true,
    productionApproved: false,
    rationale: "Local reasoning and agent evaluation target.",
  },
  {
    modelId: "mistral-small-2603",
    family: "Mistral Small 4",
    license: "Apache-2.0",
    local: true,
    freeLocalInference: true,
    productionApproved: false,
    rationale: "Multimodal/coding/reasoning evaluation target.",
  },
  {
    modelId: "ministral-8b-2512",
    family: "Ministral 3",
    license: "Apache-2.0",
    local: true,
    freeLocalInference: true,
    productionApproved: false,
    rationale: "Efficient edge/local evaluation target.",
  },
  {
    modelId: "microsoft/phi-4",
    family: "Phi-4",
    license: "MIT",
    local: true,
    freeLocalInference: true,
    productionApproved: false,
    rationale: "MIT-licensed local language-model evaluation target.",
  },
  {
    modelId: "microsoft/Phi-4-multimodal-instruct",
    family: "Phi-4 multimodal",
    license: "MIT",
    local: true,
    freeLocalInference: true,
    productionApproved: false,
    rationale: "MIT-licensed multimodal evaluation target.",
  },
  {
    modelId: "deepseek-ai/DeepSeek-R1",
    family: "DeepSeek-R1",
    license: "MIT",
    local: true,
    freeLocalInference: true,
    productionApproved: false,
    rationale: "MIT-licensed reasoning evaluation target.",
  },
  {
    modelId: "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B",
    family: "DeepSeek-R1-0528",
    license: "MIT",
    local: true,
    freeLocalInference: true,
    productionApproved: false,
    rationale: "Compact MIT-licensed reasoning evaluation target.",
  },
  {
    modelId: "HuggingFaceTB/SmolLM2-360M-Instruct",
    family: "SmolLM2",
    license: "Apache-2.0",
    local: true,
    freeLocalInference: true,
    productionApproved: false,
    rationale: "Very small Apache-2.0 edge/evaluation target.",
  },
];

export function isCataloguedOpenModel(modelId: string): boolean {
  return OPEN_MODEL_CATALOG.some((candidate) => candidate.modelId === modelId);
}
