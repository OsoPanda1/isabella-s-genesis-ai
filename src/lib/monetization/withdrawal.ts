import { randomUUID } from "node:crypto";
import {
  MINIMUM_WITHDRAWAL_CENTS,
  type MonetizationEligibility,
  type WithdrawalRequest,
} from "./types";
import { evaluateEligibility } from "./eligibility";

/**
 * WITHDRAWAL & ZERO-LOSS SETTLEMENT (src/lib/monetization/withdrawal.ts)
 * -----------------------------------------------------------------
 * Manages the withdrawal requests. Enforces the 90-day escrow maturation
 * and checks the territorial node's liquidity pool. If the platform lacks
 * liquidity, or the funds haven't matured, the withdrawal is blocked.
 * The platform NEVER uses its own funds to pay out early.
 */

export interface WithdrawalRiskReview {
  reviewId: string;
  status: "pass" | "hold" | "fraud_detected";
  score: number;
  signals: string[];
}

export interface WithdrawalDependencies {
  getEligibility(userId: string): Promise<MonetizationEligibility>;
  runRiskReview(userId: string): Promise<WithdrawalRiskReview>;
  isIdempotent(key: string): Promise<boolean>;
  markIdempotent(key: string): Promise<void>;
  checkLiquidityPool(territoryId: string, amountCents: number): Promise<boolean>;
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
    territoryId: string,
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

    // Strict 90-day matured balance check
    if (eligibility.availableBalanceCents < MINIMUM_WITHDRAWAL_CENTS) {
      return {
        ok: false,
        code: "MINIMUM_WITHDRAWAL_NOT_REACHED_OR_FUNDS_IN_ESCROW",
        minimumCents: MINIMUM_WITHDRAWAL_CENTS,
        availableCents: eligibility.availableBalanceCents,
      };
    }

    // Zero-Loss Check: Does the territorial pool have actual cash liquidity?
    const hasLiquidity = await this.deps.checkLiquidityPool(territoryId, eligibility.availableBalanceCents);
    if (!hasLiquidity) {
      return {
        ok: false,
        code: "INSUFFICIENT_LIQUIDITY_POOL",
        reasons: ["TERRITORIAL_FUNDS_PENDING_CLEARANCE"],
      };
    }

    const review = await this.deps.runRiskReview(userId);
    await this.deps.appendBookPI({
      type: review.status === "pass" ? "withdrawal.review.passed" : "withdrawal.held",
      userId,
      riskScore: review.score,
      idempotencyKey,
    });

    if (review.status === "hold" || review.status === "fraud_detected") {
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
