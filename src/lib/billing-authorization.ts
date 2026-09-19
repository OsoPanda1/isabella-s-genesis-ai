import type { Role } from "./rbac";

export type BillingOperation =
  | "checkout"
  | "topup"
  | "refund"
  | "marketplace-publish"
  | "marketplace-purchase"
  | "authorize-run";

const REQUIRED_SCOPE: Record<BillingOperation, string> = {
  checkout: "billing:checkout",
  topup: "billing:topup",
  refund: "billing:refund",
  "marketplace-publish": "marketplace:publish",
  "marketplace-purchase": "marketplace:purchase",
  "authorize-run": "billing:authorize-run",
};

const PRIVILEGED_ROLES = new Set<Role>(["SovereignOwner", "governance_admin"]);

export function requiredBillingScope(operation: BillingOperation): string {
  return REQUIRED_SCOPE[operation];
}

export function hasBillingAuthorization(input: {
  operation: BillingOperation;
  role: Role;
  scopes: readonly string[];
  stepUpVerified?: boolean;
}): boolean {
  const scope = REQUIRED_SCOPE[input.operation];
  if (!input.scopes.includes(scope)) return false;
  if (input.operation === "refund" || input.operation === "topup") {
    if (!PRIVILEGED_ROLES.has(input.role)) return false;
    if (input.stepUpVerified !== true) return false;
  }
  if (input.operation === "marketplace-publish" && !PRIVILEGED_ROLES.has(input.role)) return false;
  return true;
}
