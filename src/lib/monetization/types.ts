export const MINIMUM_WITHDRAWAL_CENTS = 5000; // $50.00
export const PLATFORM_FEE_BASIS_POINTS = 1500; // 15% platform fee on Net Margin
export const USER_SCHARE_BASIS_POINTS = 8500; // 85% user share on Net Margin
export const ESCROW_MATURATION_DAYS = 90; // 90 days to clear chargeback liability

export const MONETIZATION_SUBSCRIPTION_REQUIRED = true;

export type MonetizationMethod =
  | "referral"
  | "education"
  | "territorial"
  | "evidence"
  | "professional_reference";

export type EarningStatus =
  | "pending" // In 90-day escrow
  | "available" // Cleared escrow, ready for withdrawal
  | "held" // Under fraud review
  | "reversed" // Chargebacked (Loss shifted to user)
  | "paid"
  | "disputed";

export type MonetizationBlockReason =
  | "NO_SUBSCRIPTION"
  | "IDENTITY_UNVERIFIED"
  | "PAYMENT_ACCOUNT_UNVERIFIED"
  | "PROFILE_INCOMPLETE"
  | "TRAINING_REQUIRED"
  | "ACTIVITY_REQUIREMENT_MISSING"
  | "FRAUD_REVIEW"
  | "SANCTIONED_ACCOUNT"
  | "MINIMUM_NOT_REACHED"
  | "INSUFFICIENT_LIQUIDITY_POOL"; // Platform protection

export interface MonetizationEligibilityInput {
  subscriptionActive: boolean;
  identityVerified: boolean;
  paymentAccountVerified: boolean;
  profileComplete: boolean;
  trainingCompleted: boolean;
  qualifiedUses: number;
  minimumQualifiedUses: number;
  approvedContributions: number;
  requiredContributions: number;
  availableBalanceCents: number;
  withdrawalMinimumCents: number;
  blockedReasons?: MonetizationBlockReason[];
  sanctioned: boolean;
  underFraudReview: boolean;
}

export interface MonetizationEligibility extends MonetizationEligibilityInput {
  eligible: boolean;
  blockedReasons: MonetizationBlockReason[];
  activityRequirementMet: boolean;
  balanceRequirementMet: boolean;
}

/** 
 * Zero-Loss Revenue Split 
 * Guarantees platform infrastructure costs are recovered first.
 */
export interface RevenueSplit {
  grossAmountCents: number;
  infrastructureCostCents: number;
  platformFeeCents: number;
  refundReserveCents: number;
  communityShareCents: number;
  netUserAmountCents: number;
}

export interface MonetizationEvent {
  eventId: string;
  userIdHash: string;
  tenantIdHash: string;
  method: MonetizationMethod;
  grossAmountCents: number;
  infrastructureCostCents: number;
  platformFeeCents: number;
  refundReserveCents: number;
  communityShareCents: number;
  netUserAmountCents: number;
  status: EarningStatus;
  sourceHash: string;
  createdAt: string;
  availableAt: string; // Will be createdAt + 90 days
  policyVersion: string;
  riskScore: number;
}

export interface WithdrawalRequest {
  payoutId: string;
  userId: string;
  amountCents: number;
  status: "scheduled" | "processed" | "held" | "rejected";
  idempotencyKey: string;
  createdAt: string;
}

export interface MonetizationGuide {
  method: MonetizationMethod;
  title: string;
  summary: string;
  howItWorks: string[];
  steps: string[];
  rules: string[];
  incomeSources: string[];
  compliance: string[];
}
