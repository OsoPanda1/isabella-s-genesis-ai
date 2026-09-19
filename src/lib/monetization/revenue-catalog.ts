export type RevenueStatus =
  "DESIGNED" | "IMPLEMENTED" | "TESTED" | "VERIFIED" | "PRODUCTION_VERIFIED" | "BLOCKED";
export interface RevenueStream {
  id: string;
  name: string;
  category: string;
  frequency: "one-time" | "recurring" | "usage" | "event" | "grant";
  status: RevenueStatus;
  realMoney: boolean;
  humanReviewRequired: boolean;
  regulatoryReviewRequired: boolean;
  notes: string;
}

const categories: Record<string, [string, RevenueStream["category"], RevenueStream["frequency"]]> =
  {
    "M-01": ["Subscriptions", "subscription", "recurring"],
    "M-02": ["Enterprise plans", "enterprise", "recurring"],
    "M-03": ["Marketplace", "marketplace", "usage"],
    "M-04": ["Financial services", "financial", "usage"],
    "M-05": ["Cards", "financial", "usage"],
    "M-06": ["Payments", "financial", "usage"],
    "M-07": ["Premium membership", "subscription", "recurring"],
    "M-08": ["Microtransactions", "transactional", "usage"],
    "M-09": ["Events", "events", "event"],
    "M-10": ["Digital goods", "commerce", "one-time"],
    "M-11": ["Tips/contributions", "contributions", "usage"],
    "M-12": ["Skill transactions", "marketplace", "usage"],
    "M-13": ["Licensing", "enterprise", "recurring"],
    "M-14": ["Compute", "infrastructure", "usage"],
    "M-15": ["Infrastructure services", "infrastructure", "usage"],
    "M-16": ["Professional services", "services", "one-time"],
    "M-17": ["Enterprise licensing", "enterprise", "recurring"],
    "M-18": ["Hardware/commerce", "commerce", "one-time"],
    "M-19": ["Grants/cofinancing", "grant", "grant"],
    "M-20": ["Training", "education", "one-time"],
  };

export const REVENUE_CATALOG: RevenueStream[] = Object.entries(categories).map(
  ([id, [name, category, frequency]]) => ({
    id,
    name,
    category,
    frequency,
    status: "DESIGNED",
    realMoney: true,
    humanReviewRequired: true,
    regulatoryReviewRequired: ["M-04", "M-05", "M-06"].includes(id),
    notes: "Diseño catalogado; precios, márgenes y volumen no constituyen evidencia de producción.",
  }),
);
export function getRevenueStream(id: string): RevenueStream | undefined {
  return REVENUE_CATALOG.find((item) => item.id === id);
}
