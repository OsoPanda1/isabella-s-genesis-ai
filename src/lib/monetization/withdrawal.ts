import { randomUUID } from "node:crypto";
import {
  MINIMUM_WITHDRAWAL_CENTS,
  type MonetizationEligibility,
  type WithdrawalRequest,
} from "./types";
import { evaluateEligibility } from "./eligibility";

/**
 * RETIROS Y LIQUIDACIÓN (src/lib/monetization/withdrawal.ts)
 * -----------------------------------------------------------------
 * Gestiona la solicitud de retiro mensual: validación de elegibilidad,
 * revisión antifraude, idempotencia, creación de payout id y registro
 * en BookPI. La confirmación de pago proviene siempre del proveedor
 * de pagos (webhook firmado), nunca de la afirmación del cliente.
 */

export interface WithdrawalRiskReview {
  reviewId: string;
  status: "pass" | "hold";
  score: number;
  signals: string[];
}

export interface WithdrawalDependencies {
  getEligibility(userId: string): Promise<MonetizationEligibility>;
  runRiskReview(userId: string): Promise<WithdrawalRiskReview>;
  isIdempotent(key: string): Promise<boolean>;
  markIdempotent(key: string): Promise<void>;
  appendBookPI(entry: {
    type: string;
    userId: string;
    payoutId?: string;
    amountCents?: number;
    riskScore?: number;
    idempotencyKey?: string;
  }): Promise<void>;
  createPayout(request: {
    userId: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<{ payoutId: string; status: "scheduled" }>;
}

export class WithdrawalService {
  constructor(private deps: WithdrawalDependencies) {}

  async request(
    userId: string,
    opts?: { idempotencyKey?: string },
  ): Promise<
    | { ok: true; payoutId: string; status: "scheduled" }
    | {
        ok: false;
        code: string;
        reasons?: string[];
        reviewId?: string;
        minimumCents?: number;
        availableCents?: number;
      }
  > {
    const idempotencyKey = opts?.idempotencyKey ?? randomUUID();
    const isIdem = await this.deps.isIdempotent(idempotencyKey);
    if (isIdem) {
      return { ok: false, code: "IDEMPOTENCY_REPLAY" };
    }
    await this.deps.markIdempotent(idempotencyKey);

    const eligibility = await this.deps.getEligibility(userId);
    if (!eligibility.eligible) {
      return {
        ok: false,
        code: "MONETIZATION_NOT_ELIGIBLE",
        reasons: eligibility.blockedReasons,
      };
    }

    if (eligibility.availableBalanceCents < MINIMUM_WITHDRAWAL_CENTS) {
      return {
        ok: false,
        code: "MINIMUM_WITHDRAWAL_NOT_REACHED",
        minimumCents: MINIMUM_WITHDRAWAL_CENTS,
        availableCents: eligibility.availableBalanceCents,
      };
    }

    const review = await this.deps.runRiskReview(userId);
    await this.deps.appendBookPI({
      type: review.status === "hold" ? "withdrawal.held" : "withdrawal.review.passed",
      userId,
      riskScore: review.score,
      idempotencyKey,
    });

    if (review.status === "hold") {
      return {
        ok: false,
        code: "WITHDRAWAL_UNDER_REVIEW",
        reviewId: review.reviewId,
      };
    }

    const payout = await this.deps.createPayout({
      userId,
      amountCents: eligibility.availableBalanceCents,
      idempotencyKey,
    });

    await this.deps.appendBookPI({
      type: "withdrawal.requested",
      userId,
      payoutId: payout.payoutId,
      amountCents: eligibility.availableBalanceCents,
      idempotencyKey,
    });

    return { ok: true, payoutId: payout.payoutId, status: payout.status };
  }
}

export function buildWithdrawalRequest(partial: Partial<WithdrawalRequest>): WithdrawalRequest {
  return {
    payoutId: partial.payoutId ?? randomUUID(),
    userId: partial.userId ?? "",
    amountCents: partial.amountCents ?? 0,
    status: partial.status ?? "scheduled",
    idempotencyKey: partial.idempotencyKey ?? randomUUID(),
    createdAt: partial.createdAt ?? new Date().toISOString(),
  };
}

export { evaluateEligibility, MINIMUM_WITHDRAWAL_CENTS };
