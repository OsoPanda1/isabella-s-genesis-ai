import { randomUUID } from "node:crypto";
import { config } from "@/lib/config";
import { isProductionLike, resolveRuntimeMode } from "@/lib/runtime-mode";
import type {
  GovernanceDecision,
  IntelligenceProvider,
  IntelligenceRequest,
  IntelligenceResponse,
} from "./contracts";
import { approveModel, getModel, registerProvider } from "./model-registry";
import { authorizeModelForRuntime } from "./production-model-gate";
import { inspectInferenceInput } from "./inference-firewall";

const providers = new Map<string, IntelligenceProvider>();
const failures = new Map<string, { count: number; openUntil: number }>();
const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 30_000;
const MAX_CANDIDATES = 3;

function circuitOpen(modelId: string): boolean {
  const state = failures.get(modelId);
  if (!state) return false;
  if (state.openUntil > Date.now()) return true;
  // Cooldown elapsed: half-open. Reset the streak so a single new failure does
  // not immediately re-open the circuit, and drop the stale entry.
  failures.delete(modelId);
  return false;
}

function recordFailure(modelId: string): void {
  const current = failures.get(modelId) ?? { count: 0, openUntil: 0 };
  const count = current.count + 1;
  failures.set(modelId, {
    count,
    openUntil: count >= FAILURE_THRESHOLD ? Date.now() + COOLDOWN_MS : 0,
  });
}

function recordSuccess(modelId: string): void {
  failures.delete(modelId);
}

export function addProvider(provider: IntelligenceProvider, productionApproved = false): void {
  providers.set(provider.modelId, provider);
  registerProvider(provider);
  if (productionApproved) approveModel(provider.modelId);
}

function evaluateGovernance(request: IntelligenceRequest): GovernanceDecision {
  if (!request.tenantId || !request.actorId)
    return {
      decision: "DENY",
      reasons: ["tenant-and-actor-required"],
      riskScore: 100,
      policyIds: [],
    };
  if (request.messages.length === 0 || request.messages.length > 40)
    return {
      decision: "DENY",
      reasons: ["invalid-message-count"],
      riskScore: 80,
      policyIds: [],
    };
  const temperature = request.temperature ?? 0.7;
  if (temperature < 0 || temperature > 2)
    return {
      decision: "DENY",
      reasons: ["temperature-out-of-range"],
      riskScore: 50,
      policyIds: [],
    };
  return {
    decision: "ALLOW",
    reasons: [],
    riskScore: 0,
    policyIds: ["inference-firewall-v1"],
  };
}

export function governIntelligence(request: IntelligenceRequest): GovernanceDecision {
  const base = evaluateGovernance(request);
  if (base.decision !== "ALLOW") return base;
  const firewall = inspectInferenceInput(request.messages);
  if (!firewall.allowed)
    return {
      decision: "DENY",
      reasons: firewall.reasons,
      riskScore: 95,
      policyIds: ["inference-firewall-v1"],
    };
  return base;
}

export async function invokeIntelligence(
  input: Omit<IntelligenceRequest, "requestId"> & { requestId?: string },
): Promise<IntelligenceResponse> {
  // Single firewall pass: the sanitized result is reused for governance below
  // instead of scanning (and hashing) the payload twice per request.
  const firewall = inspectInferenceInput(input.messages);
  if (!firewall.allowed) throw new Error(`intelligence_DENY:${firewall.reasons.join(",")}`);
  const request: IntelligenceRequest = {
    ...input,
    messages: firewall.sanitized,
    requestId: input.requestId ?? randomUUID(),
  };
  const governance = evaluateGovernance(request);
  if (governance.decision !== "ALLOW")
    throw new Error(`intelligence_${governance.decision.toLowerCase()}`);

  const preferred = request.preferredModel;
  const candidates = (preferred ? [preferred] : [...providers.keys()]).slice(0, MAX_CANDIDATES);
  const production = isProductionLike(resolveRuntimeMode(config().ISABELLA_RUNTIME_MODE));
  let lastError: unknown;

  for (const modelId of candidates) {
    if (circuitOpen(modelId)) continue;
    const provider = providers.get(modelId);
    const descriptor = getModel(modelId);
    if (!provider || !descriptor || !descriptor.enabled) continue;
    if (production) {
      try {
        await authorizeModelForRuntime(request.tenantId, provider);
      } catch (error) {
        lastError = error;
        recordFailure(modelId);
        continue;
      }
    }
    try {
      if (!(await provider.health())) {
        recordFailure(modelId);
        continue;
      }
      const response = await provider.invoke(request);
      recordSuccess(modelId);
      return response;
    } catch (error) {
      lastError = error;
      recordFailure(modelId);
    }
  }

  if (production) throw new Error("inference_unavailable: no production-approved healthy model");
  if (lastError) throw lastError;
  throw new Error("inference_unavailable: no registered model");
}
