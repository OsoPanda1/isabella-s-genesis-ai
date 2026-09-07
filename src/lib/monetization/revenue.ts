import { PLATFORM_FEE_BASIS_POINTS, type RevenueSplit } from "./types";

/**
 * ZERO-LOSS SOVEREIGN MONETIZATION MODEL
 * -----------------------------------------------------------------
 * To guarantee the platform NEVER suffers economic loss or funds payouts from
 * its own capital:
 * 1. Platform Infrastructure Costs (compute, token, egress) are deducted FIRST.
 * 2. Revenue split applies ONLY to the Net Margin.
 * 3. 100% of the Net Margin is split: Platform takes its fee (e.g. 15%), user/node takes the rest.
 * 4. A strict Fraud/Refund Reserve (e.g. 10%) is held from the User's share for 90 days.
 * 5. Payouts are exclusively funded from cleared, settled escrow.
 */

export interface ZeroLossRevenueInput {
  grossPaidCents: number;           // Total amount paid by the consumer upfront (Pre-funded)
  infrastructureCostCents: number;  // Absolute cost incurred by the platform (AWS/GCP/Quantum backend)
  refundReserveRatio: number;       // Ratio of user's profit held for chargeback windows (e.g. 0.10)
  communityShareRatio: number;      // Ratio for territorial node community (e.g. 0.05)
}

export function splitZeroLossRevenue(input: ZeroLossRevenueInput): RevenueSplit {
  const { grossPaidCents, infrastructureCostCents, refundReserveRatio, communityShareRatio } = input;

  if (grossPaidCents < 0) throw new Error("grossPaidCents cannot be negative");
  if (infrastructureCostCents < 0) throw new Error("infrastructureCostCents cannot be negative");
  
  // 1. DEDUCT PLATFORM COSTS FIRST (Zero-Loss Guarantee)
  const netMarginCents = grossPaidCents - infrastructureCostCents;

  if (netMarginCents < 0) {
    // If infrastructure costs exceeded gross (which should never happen due to upfront pricing),
    // the platform takes a total loss, and there is $0 to distribute.
    return {
      grossAmountCents: grossPaidCents,
      infrastructureCostCents,
      platformFeeCents: 0,
      refundReserveCents: 0,
      communityShareCents: 0,
      netUserAmountCents: 0,
    };
  }

  // 2. ALLOCATE PLATFORM FEE FROM NET MARGIN
  const platformFeeCents = Math.round((netMarginCents * PLATFORM_FEE_BASIS_POINTS) / 10_000);
  const totalPlatformTakeCents = infrastructureCostCents + platformFeeCents;

  // 3. ALLOCATE COMMUNITY SHARE
  const communityShareCents = Math.round(netMarginCents * communityShareRatio);

  // 4. CALCULATE USER PROFIT (Remaining)
  const userGrossProfitCents = netMarginCents - platformFeeCents - communityShareCents;

  // 5. WITHHOLD ESCROW (FRAUD/CHARGEBACK PROTECTION)
  // The reserve is taken ONLY from the user's profit. The platform secures its costs & fees immediately.
  const refundReserveCents = Math.round(userGrossProfitCents * refundReserveRatio);
  const netUserAmountCents = userGrossProfitCents - refundReserveCents;

  return {
    grossAmountCents: grossPaidCents,
    infrastructureCostCents,
    platformFeeCents,
    refundReserveCents,
    communityShareCents,
    netUserAmountCents,
  };
}

/** Verifies the invariant: Total Gross = Infrastructure + PlatformFee + Community + UserReserve + UserNet */
export function verifyZeroLossSplit(split: RevenueSplit): boolean {
  return (
    split.grossAmountCents ===
    split.infrastructureCostCents +
    split.platformFeeCents +
    split.communityShareCents +
    split.refundReserveCents +
    split.netUserAmountCents
  );
}
