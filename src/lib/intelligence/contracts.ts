/** Model-agnostic intelligence contracts. Capability does not imply authority. */
export type Modality = "text" | "image" | "audio";
export type IntelligenceDecision = "ALLOW" | "DENY" | "REVIEW" | "MODIFY";
export type IntelligenceRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface IntelligenceMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
export interface IntelligenceRequest {
  requestId: string;
  tenantId: string;
  actorId: string;
  messages: IntelligenceMessage[];
  modality?: Modality;
  temperature?: number;
  maxTokens?: number;
  preferredModel?: string;
}
export interface IntelligenceResponse {
  requestId: string;
  modelId: string;
  providerId: string;
  text: string;
  latencyMs: number;
  degraded: boolean;
  risk: IntelligenceRisk;
  usage?: { inputTokens?: number; outputTokens?: number };
}
export interface GovernanceDecision {
  decision: IntelligenceDecision;
  riskScore: number;
  policyIds: string[];
  reasons: string[];
  auditId?: string;
}
export interface EmbeddingRequest {
  modality: Modality;
  contentHash: string;
  content: string | Uint8Array;
  modelId: string;
  territoryId: string;
}
export interface EmbeddingResult {
  modelId: string;
  modality: Modality;
  dimensions: number;
  vectorHash: string;
  embedding: number[];
}
export interface PlanStep {
  id: string;
  action: string;
  requiresAuthorization: boolean;
  riskScore: number;
}
export interface ReasoningPlan {
  planId: string;
  objectiveHash: string;
  steps: PlanStep[];
  modelId: string;
  policyId: string;
}
export interface ReasoningRequest {
  objective: string;
  territoryId: string;
  contextHashes: string[];
  modelId: string;
  governance: GovernanceDecision;
}
export interface IntelligenceProvider {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilities: ReadonlySet<Modality>;
  health(): Promise<boolean>;
  invoke(request: IntelligenceRequest): Promise<IntelligenceResponse>;
}
