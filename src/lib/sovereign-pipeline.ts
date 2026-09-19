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
import { createExecutionAuthority, type ApprovalGrant } from "./execution-authority";
import { createMemoryEngine, type MemoryActorRole } from "./memory-engine";
import type { MemoryRepository } from "./repositories/memory-repository";
import type { AuditRepository } from "./repositories/audit-repository";

export interface ApprovalStore {
  has(traceId: string, tool: string, actorId: string, tenantId: string): Promise<boolean>;
  consume(
    traceId: string,
    tool: string,
    actorId: string,
    tenantId: string,
  ): Promise<ApprovalGrant | null>;
}

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
  toolInput?: unknown;
  toolRole?: string;
  toolAuthenticated?: boolean;
  approvals?: ApprovalGrant[];
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

async function hasMatchingApproval(
  input: PipelineInput,
  approvalStore?: ApprovalStore,
): Promise<boolean> {
  if (
    approvalStore &&
    input.toolRequest &&
    (await approvalStore.has(input.traceId, input.toolRequest, input.actorId, input.tenantId))
  ) {
    return true;
  }

  const now = Date.now();
  return (input.approvals ?? []).some(
    (approval) =>
      !approval.consumed &&
      approval.traceId === input.traceId &&
      approval.tool === input.toolRequest &&
      approval.actorId === input.actorId &&
      approval.tenantId === input.tenantId &&
      approval.expiresAt > now,
  );
}

export function createSovereignPipeline(opts?: {
  memoryRepository?: MemoryRepository;
  auditRepository?: AuditRepository;
  approvalStore?: ApprovalStore;
  killSwitchStore?: {
    isKilled(capability: string): Promise<boolean>;
  };
}) {
  const memoryEngine = createMemoryEngine(opts?.memoryRepository);
  const toolRegistry = createToolRegistry();

  return {
    async execute(input: PipelineInput): Promise<PipelineResult> {
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

      const gate = evaluateConstitutionalGate(context, input.identity, input.evidence, intent);

      if (!gate.passed) {
        const auditEvent = await opts?.auditRepository?.append({
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

      const allowedScopes = CROWN.resolveAllowedMemoryScopes(intent, input.identity);
      const roleNames = input.identity.roles.map((role) => role.toLowerCase());
      const actorRole: MemoryActorRole = roleNames.includes("sovereignowner")
        ? "SovereignOwner"
        : roleNames.includes("operator")
          ? "Operator"
          : roleNames.includes("auditor")
            ? "Auditor"
            : roleNames.includes("system")
              ? "System"
              : "Guest";

      const memoryResult = await memoryEngine.retrieve({
        tenantId: input.tenantId,
        actorId: input.actorId,
        role: actorRole,
        scope: input.memoryScope ?? "turn",
        authenticated: input.identity.authenticated,
        grantedScopes: allowedScopes as unknown as readonly CROWN.MemoryScope[],
      });

      let policyResult: PolicyEvaluationResult | null = null;
      if (input.toolRequest) {
        const toolMeta = toolRegistry.lookup(input.toolRequest);
        if (toolMeta) {
          const approvalGranted = await hasMatchingApproval(input, opts?.approvalStore);
          policyResult = evaluatePolicy({
            tool: toolMeta,
            territorialBoundaryEnforced: false,
            humanInTheLoop: input.identity.authenticated,
            approvalThreshold: "medium",
            consentRequired: toolMeta.requiresApproval,
            consentGranted: approvalGranted,
          });

          if (policyResult.decision === "denied") {
            const auditEvent = await opts?.auditRepository?.append({
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

      let toolExecuted = false;
      if (input.toolRequest) {
        const authority = createExecutionAuthority({
          memoryRepository: opts?.memoryRepository,
          auditRepository: opts?.auditRepository,
          approvalStore: opts?.approvalStore,
          killSwitch: opts?.killSwitchStore,
        });
        const outcome = await authority.execute({
          tool: input.toolRequest,
          input: input.toolInput ?? {},
          actorId: input.actorId,
          tenantId: input.tenantId,
          role: input.toolRole ?? (actorRole as string),
          authenticated: input.toolAuthenticated ?? input.identity.authenticated,
          traceId: input.traceId,
          ip: input.actorIp,
          approvals: input.approvals,
        });
        toolExecuted = outcome.executed;
        if (!outcome.executed) {
          const auditDeny = await opts?.auditRepository?.append({
            traceId: input.traceId,
            correlationId: input.requestId,
            actorIp: input.actorIp,
            event: "tool_execution_denied",
            severity: "S2",
            details: `${outcome.stage}: ${outcome.reason}`,
          });
          return {
            decision: routing,
            constitutionalGate: gate.checks,
            policyResult,
            memoryRecords: memoryResult.records.length,
            toolExecuted: false,
            auditRecorded: Boolean(auditDeny),
            systemPrompt: CROWN.buildSystemPrompt(routing),
            denied: true,
            denialReason: `Ejecución denegada (${outcome.stage}): ${outcome.reason}`,
          };
        }
      }

      const auditEvent = await opts?.auditRepository?.append({
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
          toolExecuted,
        }),
      });

      return {
        decision: routing,
        constitutionalGate: gate.checks,
        policyResult,
        memoryRecords: memoryResult.records.length,
        toolExecuted,
        auditRecorded: Boolean(auditEvent),
        systemPrompt: CROWN.buildSystemPrompt(routing),
        denied: false,
      };
    },

    verifyAuditChain() {
      return (
        opts?.auditRepository?.verifyChain() ?? {
          success: false,
          error: "Sin repositorio de auditoría; la cadena no puede verificarse.",
        }
      );
    },
  };
}

export type SovereignPipeline = ReturnType<typeof createSovereignPipeline>;
export const SOVEREIGN_PIPELINE = {
  create: createSovereignPipeline,
};
