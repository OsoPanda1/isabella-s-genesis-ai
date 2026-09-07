/**
 * BOOKPI ROYALTIES (src/lib/bookpi/royalties.ts)
 * -----------------------------------------------------------------
 * Liquidación exacta de regalías en BigInt (puntos básicos, 10000 = 100%).
 * La última federación recibe el remanente exacto:
 *   total - distributed  (evita pérdidas por redondeo).
 */
import type { RoyaltySplitResult } from "./BookPiEngine";

export interface FederationShareInput {
  federationId: number;
  basisPoints: number;
  walletAddress: string;
}

const BASIS_POINTS_DIVISOR = 10000n;

export function calculateBookPiRoyalties(
  totalRevenueWei: bigint,
  federationShares: FederationShareInput[],
): RoyaltySplitResult[] {
  if (federationShares.length === 0) {
    throw new Error("Se requieren las participaciones de al menos una federación.");
  }
  let distributed = 0n;

  return federationShares.map((share, index) => {
    const isLast = index === federationShares.length - 1;
    let shareAmount: bigint;

    if (isLast) {
      shareAmount = totalRevenueWei - distributed;
    } else {
      shareAmount = (totalRevenueWei * BigInt(share.basisPoints)) / BASIS_POINTS_DIVISOR;
      distributed += shareAmount;
    }

    return {
      federationId: share.federationId,
      basisPoints: share.basisPoints,
      payoutAmountWei: shareAmount.toString(),
      walletAddress: share.walletAddress,
    };
  });
}