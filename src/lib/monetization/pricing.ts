import { splitZeroLossRevenue } from "./revenue";
import type { RevenueSplit } from "./types";

export interface QupPricingFactors {
  qubitCount: number;
  circuitDepth: number;
  latencyMs: number;
  hasQec: boolean;
  hasZne: boolean;
  hasPec: boolean;
  fidelity: number;
  strictIsolation: boolean;
  infrastructureCostCents: number; // The actual hard cost to the platform
}

export interface QupPricingResult {
  baseCostCents: number;
  qecPremiumCents: number;
  errorMitigationCents: number;
  latencyCostCents: number;
  fidelityPremiumCents: number;
  isolationPremiumCents: number;
  totalGrossCents: number;
  revenueSplit: RevenueSplit;
}

export class QupPricingModel {
  /**
   * Calculates the sovereign cost for a QUP v3.0 job and determines
   * the zero-loss revenue split guaranteeing platform costs are paid first.
   */
  public static calculateCost(factors: QupPricingFactors): QupPricingResult {
    // Dynamic Pricing Model for Sovereign Quantum Processing
    const baseCostCents = 1500 + (factors.qubitCount * 50) + (factors.circuitDepth * 10);
    const qecPremiumCents = factors.hasQec ? 2500 : 0;
    
    let errorMitigationCents = 0;
    if (factors.hasZne) errorMitigationCents += 1200;
    if (factors.hasPec) errorMitigationCents += 1800;
    
    const latencyCostCents = Math.round(factors.latencyMs * 1.5);
    const fidelityPremiumCents = factors.fidelity > 0.9 ? 5000 : (factors.fidelity > 0.8 ? 2000 : 0);
    const isolationPremiumCents = factors.strictIsolation ? 3500 : 0;

    const totalGrossCents = baseCostCents + qecPremiumCents + errorMitigationCents + latencyCostCents + fidelityPremiumCents + isolationPremiumCents;

    // Distribute revenue using the Zero-Loss Sovereign Model
    const revenueSplit = splitZeroLossRevenue({
      grossPaidCents: totalGrossCents,
      infrastructureCostCents: factors.infrastructureCostCents,
      communityShareRatio: 0.05,
      refundReserveRatio: 0.10, // 10% held in 90-day escrow
    });

    return {
      baseCostCents,
      qecPremiumCents,
      errorMitigationCents,
      latencyCostCents,
      fidelityPremiumCents,
      isolationPremiumCents,
      totalGrossCents,
      revenueSplit,
    };
  }
}
