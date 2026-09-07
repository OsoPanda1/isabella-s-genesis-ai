/**
 * EXECUTION AUTHORITY (src/lib/execution-authority.ts)
 * -----------------------------------------------------------------
 * Cadena real de ejecución de herramientas (cierra el `toolExecuted: false`
 * estructural del pipeline):
 *
 *   Decide → Authorization → Approval → Tool execution
 *          → Result validation → Audit
 *
 *  - Authorization: PDP real (`evaluateAuthorization`, RBAC+ABAC).
 *  - Approval: ledger de aprobaciones humanas de un solo uso con TTL.
 *    Herramientas con `requiresApproval` (o riesgo > umbral) exigen un
 *    approval consumido; sin él, deny explícito (nunca implícito).
 *  - Execution: despacho a ejecutores reales inyectados por herramienta.
 *    Sin ejecutor registrado → deny "no-executor" (fail-closed honesto).
 *  - Validation: validador por herramienta; lo no validable no se audita
 *    como éxito.
 *  - Audit: evento append-only con IDs de decisión/aprobación y hash del
 *    resultado. Sin repositorio, la ejecución se deniega (sin auditoría
 *    no hay ejecución).
 */

import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { evaluateAuthorization } from "./authorization";
import { evaluatePolicy } from "./policy-engine";
import { createToolRegistry, type RegisteredTool } from "./tool-registry";
import type { MemoryRepository } from "./repositories/memory-repository";
import type { AuditRepository } from "./repositories/audit-repository";

export interface ApprovalGrant {
  approvalId: string;
  traceId: string;
  tool: string;
  actorId: string;
  tenantId: string;
  grantedAt: number;
  expiresAt: number;
  consumed: boolean;
}

export interface ExecutionRequest {
  tool: string;
  input: unknown;
  actorId: string;
  tenantId: string;
  role: string;
  authenticated: boolean;
  traceId: string;
  ip: string;
  approvals?: ApprovalGrant[];
}

export type ExecutionOutcome =
  | {
      executed: true;
      result: unknown;
      resultHash: string;
      approvalId: string | null;
      auditId: string;
    }
  | {
      executed: false;
      reason: string;
      stage: "decide" | "authorization" | "approval" | "execution" | "validation" | "audit";
    };

export interface ToolExecutor {
  (
    input: unknown,
    ctx: { actorId: string; tenantId: string; traceId: string },
  ): Promise<unknown> | unknown;
}

const APPROVAL_TTL_MS = 5 * 60 * 1000;

export function createApprovalLedger() {
  const grants = new Map<string, ApprovalGrant>();

  return {
    grant(traceId: string, tool: string, actorId: string, tenantId: string): ApprovalGrant {
      const now = Date.now();
      const grant: ApprovalGrant = {
        approvalId: `apr_${randomUUID().replace(/-/g, "")}`,
        traceId,
        tool,
        actorId,
        tenantId,
        grantedAt: now,
        expiresAt: now + APPROVAL_TTL_MS,
        consumed: false,
      };
      grants.set(grant.approvalId, grant);
      return grant;
    },
    consume(
      traceId: string,
      tool: string,
      actorId: string,
      tenantId: string,
    ): ApprovalGrant | null {
      const now = Date.now();
      for (const grant of grants.values()) {
        if (
          !grant.consumed &&
          grant.traceId === traceId &&
          grant.tool === tool &&
          grant.actorId === actorId &&
          grant.tenantId === tenantId &&
          grant.expiresAt > now
        ) {
          grant.consumed = true;
          return grant;
        }
      }
      return null;
    },
    pending(): number {
      const now = Date.now();
      let count = 0;
      for (const grant of grants.values()) {
        if (!grant.consumed && grant.expiresAt > now) count += 1;
      }
      return count;
    },
    /** Inspección sin consumo: ¿existe approval vigente? */
    has(traceId: string, tool: string, actorId: string, tenantId: string): boolean {
      const now = Date.now();
      for (const grant of grants.values()) {
        if (
          !grant.consumed &&
          grant.traceId === traceId &&
          grant.tool === tool &&
          grant.actorId === actorId &&
          grant.tenantId === tenantId &&
          grant.expiresAt > now
        ) {
          return true;
        }
      }
      return false;
    },
  };
}

export type ApprovalLedger = ReturnType<typeof createApprovalLedger>;

function hashResult(result: unknown): string {
  let rendered: string;
  try {
    rendered = JSON.stringify(result) ?? "null";
  } catch {
    rendered = "[unserializable]";
  }
  return createHash("sha256").update(rendered).digest("hex");
}

function validateResult(
  tool: RegisteredTool,
  result: unknown,
): { valid: boolean; reason?: string } {
  if (result === undefined) return { valid: false, reason: "Resultado indefinido." };
  try {
    JSON.stringify(result);
  } catch {
    return { valid: false, reason: "Resultado no serializable." };
  }
  if (tool.name === "memory.retrieve" && !Array.isArray(result)) {
    return { valid: false, reason: "memory.retrieve debe devolver un arreglo." };
  }
  return { valid: true };
}

export function createExecutionAuthority(opts?: {
  memoryRepository?: MemoryRepository;
  auditRepository?: AuditRepository;
  ledgerAppend?: ToolExecutor;
  storageRead?: ToolExecutor;
  identityResolve?: ToolExecutor;
  sandboxRun?: ToolExecutor;
  approvalLedger?: ApprovalLedger;
  /**
   * Store durable de approvals (PostgreSQL). Si se provee, tiene
   * precedencia sobre el ledger en memoria (multi-instancia).
   */
  approvalStore?: {
    has(traceId: string, tool: string, actorId: string, tenantId: string): Promise<boolean>;
    consume(
      traceId: string,
      tool: string,
      actorId: string,
      tenantId: string,
    ): Promise<ApprovalGrant | null>;
  };
}) {
  const registry = createToolRegistry();
  const approvals = opts?.approvalLedger ?? createApprovalLedger();

  function executors(memoryRepository?: MemoryRepository): Map<string, ToolExecutor> {
    const map = new Map<string, ToolExecutor>();
    if (memoryRepository) {
      map.set("memory.retrieve", (input) => {
        const params = (input ?? {}) as {
          scope?: "turn" | "session" | "project" | "territorial" | "historical";
        };
        return memoryRepository.list(
          (input as { tenantId?: string })?.tenantId ?? "",
          params.scope,
        );
      });
      map.set("memory.record", (input, ctx) => {
        const params = (input ?? {}) as {
          content?: string;
          scope?: "turn" | "session" | "project" | "territorial" | "historical";
          sensitivity?: "public" | "internal" | "personal" | "restricted";
          purpose?: string;
          consentGranted?: boolean;
          ownerId?: string;
        };
        return memoryRepository.add({
          tenantId: ctx.tenantId,
          content: params.content ?? "",
          source: "tool",
          scope: params.scope ?? "turn",
          sensitivity: params.sensitivity ?? "internal",
          purpose: params.purpose ?? "tool-execution",
          consentRequired: false,
          consentGranted: params.consentGranted ?? true,
          ownerId: params.ownerId,
          provenance: [`execution:${ctx.traceId}`],
        });
      });
    }
    if (opts?.ledgerAppend) map.set("ledger.record", opts.ledgerAppend);
    if (opts?.storageRead) map.set("storage.read", opts.storageRead);
    if (opts?.identityResolve) map.set("identity.resolve", opts.identityResolve);
    if (opts?.sandboxRun) map.set("compute.sandbox", opts.sandboxRun);
    return map;
  }

  return {
    approvals,
    registry,

    async execute(request: ExecutionRequest): Promise<ExecutionOutcome> {
      // ── DECIDE: whitelist Zero Trust ──────────────────────────
      const check = registry.check(request.tool);
      if (!check.allowed) {
        return { executed: false, reason: check.reason, stage: "decide" };
      }
      const tool = registry.lookup(request.tool);
      if (!tool) {
        return { executed: false, reason: "Herramienta no registrada.", stage: "decide" };
      }

      // ── AUTHORIZATION: PDP real ───────────────────────────────
      const decision = await evaluateAuthorization({
        tenant_id: request.tenantId,
        subject_id: request.actorId,
        action: "execute",
        resource: `tool:${request.tool}`,
        role: request.role,
        authenticated: request.authenticated,
        context: {
          ip_address: request.ip,
          user_agent: "execution-authority",
          timestamp: new Date(),
        },
      });
      if (!decision.allow) {
        return {
          executed: false,
          reason: `PDP denegó: ${decision.obligations.find((o) => o.startsWith("deny:")) ?? "deny"}.`,
          stage: "authorization",
        };
      }

      // ── APPROVAL: política + approval de un solo uso ──────────
      // El consentimiento de la política DERIVA del approval humano vigente
      // (ledger o grants adjuntos): consentRequired nunca se satisface solo.
      const hasApproval =
        (opts?.approvalStore
          ? await opts.approvalStore.has(
              request.traceId,
              request.tool,
              request.actorId,
              request.tenantId,
            )
          : approvals.has(request.traceId, request.tool, request.actorId, request.tenantId)) ||
        (request.approvals ?? []).some(
          (candidate) =>
            !candidate.consumed &&
            candidate.traceId === request.traceId &&
            candidate.tool === request.tool &&
            candidate.actorId === request.actorId &&
            candidate.tenantId === request.tenantId &&
            candidate.expiresAt > Date.now(),
        );
      // territorialBoundaryEnforced = false: todos los ejecutores registrados
      // son locales (sin egress a terceros). Una herramienta con egress
      // externo debería pasar true explícito desde su llamador.
      const policy = evaluatePolicy({
        tool,
        territorialBoundaryEnforced: false,
        humanInTheLoop: request.authenticated,
        approvalThreshold: "medium",
        consentRequired: tool.requiresApproval,
        consentGranted: hasApproval,
      });
      let approvalId: string | null = null;
      if (policy.decision === "denied") {
        return { executed: false, reason: `Política denegó: ${policy.reason}.`, stage: "approval" };
      }
      if (policy.decision === "requires_approval" || tool.requiresApproval) {
        const fromStore = opts?.approvalStore
          ? await opts.approvalStore.consume(
              request.traceId,
              request.tool,
              request.actorId,
              request.tenantId,
            )
          : null;
        const grant =
          fromStore ??
          approvals.consume(request.traceId, request.tool, request.actorId, request.tenantId) ??
          (request.approvals ?? []).find(
            (candidate) =>
              !candidate.consumed &&
              candidate.traceId === request.traceId &&
              candidate.tool === request.tool &&
              candidate.actorId === request.actorId &&
              candidate.tenantId === request.tenantId &&
              candidate.expiresAt > Date.now(),
          ) ??
          null;
        if (!grant) {
          return {
            executed: false,
            reason: `Aprobación humana requerida para '${request.tool}' (un solo uso, TTL 5 min).`,
            stage: "approval",
          };
        }
        grant.consumed = true;
        approvalId = grant.approvalId;
      }

      // ── EXECUTION: despacho a ejecutor real ───────────────────
      const executor = executors(opts?.memoryRepository).get(request.tool);
      if (!executor) {
        return {
          executed: false,
          reason: `Sin ejecutor registrado para '${request.tool}' (fail-closed honesto).`,
          stage: "execution",
        };
      }
      let result: unknown;
      try {
        result = await executor(request.input, {
          actorId: request.actorId,
          tenantId: request.tenantId,
          traceId: request.traceId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown";
        return { executed: false, reason: `Ejecutor falló: ${message}.`, stage: "execution" };
      }

      // ── VALIDATION ────────────────────────────────────────────
      const validation = validateResult(tool, result);
      if (!validation.valid) {
        return {
          executed: false,
          reason: `Resultado inválido: ${validation.reason}`,
          stage: "validation",
        };
      }

      // ── AUDIT: sin auditoría no hay ejecución ─────────────────
      if (!opts?.auditRepository) {
        return {
          executed: false,
          reason: "Sin repositorio de auditoría: ejecución denegada.",
          stage: "audit",
        };
      }
      const resultHash = hashResult(result);
      const event = opts.auditRepository.append({
        traceId: request.traceId,
        correlationId: decision.decision_id,
        actorIp: request.ip,
        event: tool.auditEvent,
        severity: tool.risk === "critical" || tool.risk === "high" ? "S2" : "S3",
        details: JSON.stringify({
          tool: request.tool,
          actor: request.actorId,
          tenant: request.tenantId,
          approvalId,
          resultHash,
        }),
      });

      return { executed: true, result, resultHash, approvalId, auditId: event.id };
    },
  };
}

export type ExecutionAuthority = ReturnType<typeof createExecutionAuthority>;
export const EXECUTION_AUTHORITY = {
  create: createExecutionAuthority,
  approvals: createApprovalLedger,
};
