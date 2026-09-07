/**
 * FRAUD REVIEW + PAYOUT GUARD (src/lib/monetization/fraud-review.ts)
 * -----------------------------------------------------------------
 * Flujo real de revisión de fraude y controles de payout:
 *
 *   solicitud → risk scoring determinista → hold/pass/fraud
 *   hold → revisión humana (approve/deny con motivo, auditado)
 *   payout → guard: revisión pass + doble aprobación (montos altos)
 *             + sin disputas abiertas + idempotencia
 *   chargeback → disputa abierta (congela payouts) → cierre
 *
 * Sin red ni DB: estado inyectable (Map en memoria por defecto; el
 * cableado productivo usa los repositorios). Cada transición emite un
 * registro de auditoría vía callback inyectado. Sin callbacks de
 * persistencia, el payout se deniega (fail-closed honesto).
 */

import { randomUUID } from "node:crypto";

export type FraudStatus = "pass" | "hold" | "fraud_detected";
export type ReviewDecision = "approve" | "deny";
export type DisputeStatus = "open" | "won" | "lost";

export interface WithdrawalRiskInput {
  userId: string;
  amountCents: number;
  accountAgeDays: number;
  withdrawalsLast24h: number;
  failedAttemptsLast24h: number;
  sanctioned: boolean;
  underFraudReview: boolean;
  identityVerified: boolean;
}

export interface RiskEvaluation {
  reviewId: string;
  status: FraudStatus;
  score: number;
  signals: string[];
}

export interface FraudCase {
  reviewId: string;
  userId: string;
  amountCents: number;
  status: FraudStatus;
  score: number;
  signals: string[];
  decidedBy?: string;
  decision?: ReviewDecision;
  decisionReason?: string;
  decidedAt?: string;
  createdAt: string;
}

export interface Dispute {
  disputeId: string;
  provider: string;
  providerEventId: string;
  tenantId: string;
  amountMinor: number;
  status: DisputeStatus;
  openedAt: string;
  closedAt?: string;
}

export interface AuditSink {
  (event: string, details: Record<string, unknown>): void;
}

/** Umbrales operativos (centavos USD). */
export const FRAUD_HIGH_AMOUNT_CENTS = 50_000;
export const PAYOUT_DUAL_APPROVAL_CENTS = 100_000;

/**
 * Scoring determinista y explicable. Pesos calibrados para que una sola
 * señal grave (cuenta sancionada) bloquee y las leves acumulen.
 */
export function evaluateWithdrawalRisk(input: WithdrawalRiskInput): RiskEvaluation {
  const signals: string[] = [];
  const weights: number[] = [];

  if (input.sanctioned || input.underFraudReview) {
    signals.push("account-flagged");
    weights.push(0.95);
  }
  if (!input.identityVerified) {
    signals.push("identity-unverified");
    weights.push(0.5);
  }
  if (input.accountAgeDays < 30 && input.amountCents >= FRAUD_HIGH_AMOUNT_CENTS) {
    signals.push("new-account-high-amount");
    weights.push(0.7);
  }
  if (input.withdrawalsLast24h >= 3) {
    signals.push("rapid-withdrawals");
    weights.push(0.65);
  }
  if (input.failedAttemptsLast24h >= 3) {
    signals.push("repeated-failures");
    weights.push(0.6);
  }
  if (input.amountCents >= PAYOUT_DUAL_APPROVAL_CENTS) {
    signals.push("large-amount");
    weights.push(0.45);
  }

  let complement = 1;
  for (const weight of weights) complement *= 1 - weight;
  const score = Math.round((1 - complement) * 1000) / 1000;

  const status: FraudStatus = score >= 0.8 ? "fraud_detected" : score >= 0.4 ? "hold" : "pass";
  return { reviewId: `fr_${randomUUID().replace(/-/g, "")}`, status, score, signals };
}

export function createFraudReviewQueue(opts?: {
  audit?: AuditSink;
  cases?: Map<string, FraudCase>;
  disputes?: Map<string, Dispute>;
}) {
  const cases = opts?.cases ?? new Map<string, FraudCase>();
  const disputes = opts?.disputes ?? new Map<string, Dispute>();
  const audit = opts?.audit;

  return {
    /** Abre un caso desde una evaluación de riesgo. */
    open(evaluation: RiskEvaluation, userId: string, amountCents: number): FraudCase {
      const existing = [...cases.values()].find((c) => c.reviewId === evaluation.reviewId);
      if (existing) return existing;
      const fraudCase: FraudCase = {
        reviewId: evaluation.reviewId,
        userId,
        amountCents,
        status: evaluation.status,
        score: evaluation.score,
        signals: [...evaluation.signals],
        createdAt: new Date().toISOString(),
      };
      cases.set(fraudCase.reviewId, fraudCase);
      audit?.("fraud.case.opened", {
        reviewId: fraudCase.reviewId,
        userId,
        status: fraudCase.status,
        score: fraudCase.score,
      });
      return fraudCase;
    },

    /** Decisión humana (un solo uso): aprueba o deniega con motivo. */
    decide(
      reviewId: string,
      decision: ReviewDecision,
      reviewerId: string,
      reason: string,
    ): FraudCase | null {
      const fraudCase = cases.get(reviewId);
      if (!fraudCase || fraudCase.decision) return null;
      if (!reviewerId || !reason) return null;
      fraudCase.decision = decision;
      fraudCase.decidedBy = reviewerId;
      fraudCase.decisionReason = reason;
      fraudCase.decidedAt = new Date().toISOString();
      fraudCase.status = decision === "approve" ? "pass" : "fraud_detected";
      audit?.("fraud.case.decided", {
        reviewId,
        decision,
        reviewer: reviewerId,
        reason,
      });
      return fraudCase;
    },

    get(reviewId: string): FraudCase | null {
      return cases.get(reviewId) ?? null;
    },

    pending(): FraudCase[] {
      return [...cases.values()].filter((c) => !c.decision && c.status !== "pass");
    },

    /** Disputa (chargeback): congela payouts del tenant hasta el cierre. */
    openDispute(input: {
      provider: string;
      providerEventId: string;
      tenantId: string;
      amountMinor: number;
    }): Dispute {
      const existing = [...disputes.values()].find(
        (dispute) =>
          dispute.provider === input.provider && dispute.providerEventId === input.providerEventId,
      );
      if (existing) return existing;
      const dispute: Dispute = {
        disputeId: `dp_${randomUUID().replace(/-/g, "")}`,
        provider: input.provider,
        providerEventId: input.providerEventId,
        tenantId: input.tenantId,
        amountMinor: input.amountMinor,
        status: "open",
        openedAt: new Date().toISOString(),
      };
      disputes.set(dispute.disputeId, dispute);
      audit?.("payment.dispute.opened", { ...input, disputeId: dispute.disputeId });
      return dispute;
    },

    closeDispute(disputeId: string, status: Exclude<DisputeStatus, "open">): Dispute | null {
      const dispute = disputes.get(disputeId);
      if (!dispute || dispute.status !== "open") return null;
      dispute.status = status;
      dispute.closedAt = new Date().toISOString();
      audit?.("payment.dispute.closed", { disputeId, status });
      return dispute;
    },

    openDisputesForTenant(tenantId: string): Dispute[] {
      return [...disputes.values()].filter(
        (dispute) => dispute.tenantId === tenantId && dispute.status === "open",
      );
    },
  };
}

export type FraudReviewQueue = ReturnType<typeof createFraudReviewQueue>;

export interface PayoutRequest {
  userId: string;
  tenantId: string;
  amountCents: number;
  idempotencyKey: string;
  reviewId: string;
  reviewerIds: string[];
}

/**
 * Guard de payout: solo autoriza cuando (1) el caso de fraude está en
 * `pass` con decisión registrada o scoring directo pass, (2) montos altos
 * traen doble aprobación de revisores distintos, (3) no hay disputas
 * abiertas del tenant, (4) hay sink de auditoría (si no, deny honesto).
 * La idempotencia la garantiza el llamador con `idempotencyKey`
 * (UNIQUE en economic_events / webhook_events).
 */
export function assertPayoutAllowed(
  request: PayoutRequest,
  queue: FraudReviewQueue,
  opts?: { audit?: AuditSink },
): { allowed: boolean; reason: string } {
  if (!opts?.audit) {
    return { allowed: false, reason: "Sin sink de auditoría no hay payouts." };
  }
  const fraudCase = queue.get(request.reviewId);
  if (!fraudCase || fraudCase.userId !== request.userId) {
    return { allowed: false, reason: "Caso de fraude inexistente o ajeno." };
  }
  if (fraudCase.status !== "pass") {
    return { allowed: false, reason: `Caso en estado '${fraudCase.status}', no aprobado.` };
  }
  if (fraudCase.score >= 0.4 && !fraudCase.decision) {
    return { allowed: false, reason: "Hold sin decisión humana registrada." };
  }
  // Aprobadores: el que decidió el caso + los declarados en la solicitud.
  const approvers = [
    ...new Set(
      [fraudCase.decidedBy, ...request.reviewerIds].filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    ),
  ];
  const needsDual = request.amountCents >= PAYOUT_DUAL_APPROVAL_CENTS;
  if (needsDual && approvers.length < 2) {
    return { allowed: false, reason: "Monto alto exige doble aprobación de revisores distintos." };
  }
  if (!needsDual && fraudCase.decision && approvers.length < 1) {
    return { allowed: false, reason: "Falta aprobador registrado." };
  }
  const open = queue.openDisputesForTenant(request.tenantId);
  if (open.length > 0) {
    return {
      allowed: false,
      reason: `Disputas abiertas del tenant (${open.length}): payouts congelados.`,
    };
  }
  opts.audit("payment.payout.authorized", {
    userId: request.userId,
    tenantId: request.tenantId,
    amountCents: request.amountCents,
    reviewId: request.reviewId,
    idempotencyKey: request.idempotencyKey,
  });
  return { allowed: true, reason: "Payout autorizado con controles completos." };
}

export const FRAUD_REVIEW = {
  evaluate: evaluateWithdrawalRisk,
  queue: createFraudReviewQueue,
  payout: assertPayoutAllowed,
  thresholds: { highAmount: FRAUD_HIGH_AMOUNT_CENTS, dualApproval: PAYOUT_DUAL_APPROVAL_CENTS },
};
