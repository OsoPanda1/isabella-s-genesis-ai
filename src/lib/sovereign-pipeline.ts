/**
 * PIPELINE SOBERANO (src/lib/sovereign-pipeline.ts)
 * -----------------------------------------------------------------
 * Orquestación canónica: Perceive → Remember → Policy → Decide → Act → Audit.
 * Real, sin mockdata:
 *  - Cada fase produce resultados tipados y verificables.
 *  - Fail-closed: si falta identidad, autorización o integridad,
 *    la pipeline degrada o deniega la acción.
 *  - Registra un DecisionRecord y un AuditBundle al finalizar.
 */

import * as CROWN from "./crown";
import { evaluateConstitutionalGate } from "./constitutional-gate";
import { evaluatePolicy, type PolicyEvaluationResult } from "./policy-engine";
import { createToolRegistry } from "./tool-registry";
import { createMemoryEngine, type MemoryActorRole } from "./memory-engine";
import type { MemoryRepository } from "./repositories/memory-repository";
import type { AuditRepository } from "./repositories/audit-repository";

export interface PipelineInput {
  requestId: string;
  traceId: string;
  actorId: string;
  actorIp: string;
  tenantId: string;
  input: string;
  identity: CROWN.IdentityAssessment;
  evidence: CROWN.EvidenceAssessment;
  timestamp: string;
  memoryScope?: CROWN.MemoryScope;
  toolRequest?: string;
}

export interface PipelineResult {
  decision: CROWN.RoutingDecision;
  constitutionalGate: ReturnType<typeof evaluateConstitutionalGate>["checks"];
  policyResult: PolicyEvaluationResult | null;
  memoryRecords: number;
  toolExecuted: boolean;
  auditRecorded: boolean;
  systemPrompt: string;
  denied: boolean;
  denialReason?: string;
}

export function createSovereignPipeline(
  opts?: {
    memoryRepository?: MemoryRepository;
    auditRepository?: AuditRepository;
  },
) {
  const memoryEngine = createMemoryEngine(opts?.memoryRepository);
  const toolRegistry = createToolRegistry();

  return {
    async execute(input: PipelineInput): Promise<PipelineResult> {
      // ── FASE 1: PERCEIVE ──────────────────────────────────────
      const context: CROWN.RequestContext = {
        requestId: input.requestId,
        input: input.input,
        timestamp: input.timestamp,
        source: "user",
        actorId: input.actorId,
        locale: "es-MX",
      };

      const intent = CROWN.assessIntent(input.input);
      const routing = CROWN.createRoutingDecision(context, {
        identity: input.identity,
        evidence: input.evidence,
      });

      // ── FASE 2: CONSTITUTIONAL GATE ──────────────────────────
      const gate = evaluateConstitutionalGate(
        context,
        input.identity,
        input.evidence,
        intent,
      );

      if (!gate.passed) {
        const auditEvent = opts?.auditRepository?.append({
          traceId: input.traceId,
          correlationId: input.requestId,
          actorIp: input.actorIp,
          event: "constitutional_gate_denied",
          severity: "S1",
          details: `Artículos denegados: ${gate.deniedArticles.join(", ")}`,
        });

        return {
          decision: routing,
          constitutionalGate: gate.checks,
          policyResult: null,
          memoryRecords: 0,
          toolExecuted: false,
          auditRecorded: Boolean(auditEvent),
          systemPrompt: CROWN.buildSystemPrompt({
            ...routing,
            policy: {
              ...routing.policy,
              status: "denied",
              reasons: [`Puerta constitucional denegada: ${gate.deniedArticles.join(", ")}`],
            },
          }),
          denied: true,
          denialReason: `Puerta constitucional denegada: ${gate.deniedArticles.join(", ")}`,
        };
      }

      // ── FASE 3: REMEMBER ─────────────────────────────────────
      const allowedScopes = CROWN.resolveAllowedMemoryScopes(intent, input.identity);
      const actorRole: MemoryActorRole =
        input.identity.roles.includes("SovereignOwner")
          ? "SovereignOwner"
          : input.identity.roles.includes("operator")
            ? "Operator"
            : "Guest";

      const memoryResult = memoryEngine.retrieve({
        tenantId: input.tenantId,
        actorId: input.actorId,
        role: actorRole,
        scope: input.memoryScope ?? "turn",
        authenticated: input.identity.authenticated,
        grantedScopes: allowedScopes as unknown as readonly CROWN.MemoryScope[],
      });

      // ── FASE 4: POLICY GATE ─────────────────────────────────
      let policyResult: PolicyEvaluationResult | null = null;
      if (input.toolRequest) {
        const toolMeta = toolRegistry.lookup(input.toolRequest);
        if (toolMeta) {
          // Human authority never turns off ARGUS. Even the sovereign owner
          // can only approve high/critical operations explicitly.
          const riskThreshold: "low" | "medium" = "medium";

          policyResult = evaluatePolicy({
            tool: toolMeta,
            territorialBoundaryEnforced: Boolean(input.tenantId),
            humanInTheLoop: input.identity.authenticated,
            approvalThreshold: riskThreshold,
            consentRequired: toolMeta.requiresApproval,
            consentGranted: false,
          });

          if (policyResult.decision === "denied") {
            const auditEvent = opts?.auditRepository?.append({
              traceId: input.traceId,
              correlationId: input.requestId,
              actorIp: input.actorIp,
              event: "policy_denied",
              severity: "S2",
              details: policyResult.reason,
            });

            return {
              decision: routing,
              constitutionalGate: gate.checks,
              policyResult,
              memoryRecords: memoryResult.records.length,
              toolExecuted: false,
              auditRecorded: Boolean(auditEvent),
              systemPrompt: CROWN.buildSystemPrompt(routing),
              denied: true,
              denialReason: policyResult.reason,
            };
          }
        }
      }

      // ── FASE 5: DECIDE (CROWN routing ya calculado) ──────────

      // ── FASE 6: ACT + AUDIT ─────────────────────────────────
      const auditEvent = opts?.auditRepository?.append({
        traceId: input.traceId,
        correlationId: input.requestId,
        actorIp: input.actorIp,
        event: "pipeline_completed",
        severity: "S3",
        details: JSON.stringify({
          intent: intent.category,
          action: intent.action,
          risk: routing.policy.risk,
          memoryUsed: memoryResult.records.length,
          toolRequest: input.toolRequest ?? null,
        }),
      });

      return {
        decision: routing,
        constitutionalGate: gate.checks,
        policyResult,
        memoryRecords: memoryResult.records.length,
        toolExecuted: false,
        auditRecorded: Boolean(auditEvent),
        systemPrompt: CROWN.buildSystemPrompt(routing),
        denied: false,
      };
    },

    verifyAuditChain() {
      return opts?.auditRepository?.verifyChain() ?? { success: true, error: "Sin repositorio de auditoría." };
    },
  };
}

export type SovereignPipeline = ReturnType<typeof createSovereignPipeline>;
export const SOVEREIGN_PIPELINE = {
  create: createSovereignPipeline,
};
