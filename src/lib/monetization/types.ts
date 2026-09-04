/**
 * TIPOS DE MONETIZACIÓN (src/lib/monetization/types.ts)
 * -----------------------------------------------------------------
 * Contratos canónicos del protocolo de monetización de Isabella.
 * Modelo económico: el usuario es dueño de su monetización; la
 * plataforma retiene un 15% para infraestructura y la suscripción
 * activa desbloquea la capacidad de monetizar.
 *
 * Regla de reparto por defecto: 85% usuario / 15% plataforma.
 */

export const PLATFORM_FEE_BASIS_POINTS = 1500; // 15%
export const USER_SCHARE_BASIS_POINTS = 8500; // 85%
export const MINIMUM_WITHDRAWAL_CENTS = 5000; // $50.00 USD
export const WITHDRAWAL_WINDOW_PER_MONTH = 1;
export const MONETIZATION_SUBSCRIPTION_REQUIRED = true;

export type MonetizationMethod =
  "referral" | "education" | "territorial" | "evidence" | "professional_reference";

export type EarningStatus = "pending" | "available" | "held" | "reversed" | "paid" | "disputed";

export type MonetizationBlockReason =
  | "NO_SUBSCRIPTION"
  | "IDENTITY_UNVERIFIED"
  | "PAYMENT_ACCOUNT_UNVERIFIED"
  | "PROFILE_INCOMPLETE"
  | "TRAINING_REQUIRED"
  | "ACTIVITY_REQUIREMENT_MISSING"
  | "FRAUD_REVIEW"
  | "SANCTIONED_ACCOUNT"
  | "MINIMUM_NOT_REACHED";

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
  // Requisitos de actividad
  activityRequirementMet: boolean;
  balanceRequirementMet: boolean;
}

/** Desglose de reparto económico de un evento. */
export interface RevenueSplit {
  grossAmountCents: number;
  platformFeeCents: number;
  refundReserveCents: number;
  communityShareCents: number;
  netAmountCents: number;
}

export interface MonetizationEvent {
  eventId: string;
  userIdHash: string;
  tenantIdHash: string;
  method: MonetizationMethod;
  grossAmountCents: number;
  platformFeeCents: number;
  refundReserveCents: number;
  communityShareCents: number;
  netAmountCents: number;
  status: EarningStatus;
  sourceHash: string;
  createdAt: string;
  availableAt: string;
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
