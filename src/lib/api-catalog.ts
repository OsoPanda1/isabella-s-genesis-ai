export type CatalogMethod = "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
export type CatalogStatus = "contract" | "implemented" | "draft";

/**
 * Canonical API catalog.
 *
 * This file is metadata only. It must never contain fabricated response bodies,
 * sample credentials, timestamps, random IDs, or mock payloads. Runtime truth
 * comes from the route handlers and their backing services.
 */
export interface CatalogEntry {
  id: string;
  domain: string;
  method: CatalogMethod;
  path: string;
  auth: string;
  idempotency: boolean;
  audit: boolean;
  status: CatalogStatus;
  description: string;
  implementationPath: string;
  requestSchema?: string;
  responseSchema?: string;
  verification: "source-present" | "contract-only";
}

export const DOMAINS = [
  { id: "identity", name: "Identity & Access", color: "var(--electric)" },
  { id: "crown", name: "CROWN Gateway", color: "var(--crown)" },
  { id: "heads", name: "Cognitive Heads", color: "var(--sophia)" },
  { id: "memory", name: "Hierarchical Memory", color: "var(--isa)" },
  { id: "evidence", name: "Evidence & Claims", color: "var(--sophia)" },
  { id: "praxis", name: "Praxis Execution", color: "var(--orion)" },
  { id: "bookpi", name: "BookPI Ledger", color: "var(--platinum)" },
  { id: "topology", name: "Mesh Topology", color: "var(--petrol)" },
  { id: "quantum", name: "Quantum Labs", color: "var(--iris)" },
  { id: "pqc", name: "Cryptographic Readiness", color: "var(--argus)" },
  { id: "billing", name: "Billing & Credits", color: "var(--orion)" },
  { id: "ops", name: "Operations & Health", color: "var(--argus)" },
] as const;

const route = (
  id: string,
  domain: string,
  method: CatalogMethod,
  path: string,
  auth: string,
  idempotency: boolean,
  audit: boolean,
  description: string,
  implementationPath: string,
  responseSchema?: string,
): CatalogEntry => ({
  id,
  domain,
  method,
  path,
  auth,
  idempotency,
  audit,
  status: "implemented",
  description,
  implementationPath,
  responseSchema,
  verification: "source-present",
});

export const CATALOG_ENTRIES: CatalogEntry[] = [
  route(
    "isabella.chat",
    "heads",
    "POST",
    "/api/isabella",
    "server-auth + tenant + governed policy",
    true,
    true,
    "Goberned Isabella conversation gateway.",
    "src/routes/api/isabella.ts",
  ),
  route(
    "isabella.v1.chat",
    "heads",
    "POST",
    "/api/v1/isabella",
    "server-auth + tenant + governed policy",
    true,
    true,
    "Versioned Isabella conversation endpoint backed by the canonical gateway.",
    "src/routes/api/v1/isabella.ts",
  ),
  route(
    "health.readiness",
    "ops",
    "GET",
    "/api/health",
    "public-readiness contract",
    false,
    false,
    "Runtime liveness/readiness/deep-readiness checks with dependency timeouts.",
    "src/server-routes/api/health.ts",
  ),
  route(
    "observability.overview",
    "ops",
    "GET",
    "/api/observability",
    "server-auth + operational scope",
    false,
    true,
    "Runtime observability overview for traces, metrics, alerts, agents, sandboxes and cache.",
    "src/server-routes/api/observability.ts",
    "isabella.observability.v1",
  ),
  route(
    "health.live",
    "ops",
    "GET",
    "/api/health/live",
    "public-liveness contract",
    false,
    false,
    "Low-cost process liveness probe.",
    "src/routes/api/health/live.ts",
  ),
  route(
    "health.ready",
    "ops",
    "GET",
    "/api/health/ready",
    "public-readiness contract",
    false,
    false,
    "Readiness probe for durable dependencies and configured runtime authority.",
    "src/routes/api/health/ready.ts",
  ),
  route(
    "health.deep",
    "ops",
    "GET",
    "/api/health/deep",
    "public-readiness contract",
    false,
    false,
    "Deep readiness probe including runtime mode and BookPI configuration.",
    "src/routes/api/health/deep.ts",
  ),
  route(
    "catalog.list",
    "ops",
    "GET",
    "/api/catalog",
    "server-auth + tenant + scope",
    false,
    true,
    "Canonical API capability catalog derived from executable route metadata.",
    "src/server-routes/api/catalog.ts",
  ),
  route(
    "billing.gateway",
    "billing",
    "GET",
    "/api/billing",
    "server-auth + tenant + billing policy",
    false,
    true,
    "Durable billing, ledger and marketplace operations exposed by the billing handler.",
    "src/server-routes/api/billing.ts",
  ),
  route(
    "security.gateway",
    "identity",
    "POST",
    "/api/security",
    "server-auth + policy",
    true,
    true,
    "Security operations routed through the server-side security handler.",
    "src/server-routes/api/security.ts",
  ),
  route(
    "db.gateway",
    "identity",
    "GET",
    "/api/db",
    "server-auth + tenant",
    false,
    true,
    "Durable persistence diagnostics and governed database operations.",
    "src/server-routes/api/db.ts",
  ),
  route(
    "economic-integrity.gateway",
    "billing",
    "GET",
    "/api/economic-integrity",
    "server-auth + tenant + economic policy",
    false,
    true,
    "Economic integrity verification endpoint.",
    "src/server-routes/api/economic-integrity.ts",
  ),
  route(
    "voice.gateway",
    "heads",
    "POST",
    "/api/isabella-voice",
    "server-auth + governed media policy",
    true,
    true,
    "Isabella voice operation backed by the configured provider path.",
    "src/server-routes/api/isabella-voice.ts",
  ),
  route(
    "mux.intro",
    "ops",
    "GET",
    "/api/mux-intro",
    "server-auth + media policy",
    false,
    true,
    "Canonical cinematic introduction media configuration and fallback resolution.",
    "src/routes/api/mux-intro.tsx",
  ),
  route(
    "ai.transparency",
    "ops",
    "GET",
    "/api/ai/transparency",
    "public-transparency contract",
    false,
    false,
    "Machine-readable AI identity, human oversight, safety, traceability and standards-alignment disclosure.",
    "src/server-routes/api/ai-transparency.ts",
    "isabella.ai.governance.v1",
  ),
  route(
    "connect.slack",
    "topology",
    "GET",
    "/api/connect/slack",
    "user-scoped connector auth",
    false,
    true,
    "User-scoped Slack connection lifecycle/status.",
    "src/routes/api/connect/slack.ts",
  ),
  route(
    "connect.linear",
    "topology",
    "GET",
    "/api/connect/linear",
    "user-scoped connector auth",
    false,
    true,
    "User-scoped Linear connection lifecycle/status.",
    "src/routes/api/connect/linear.ts",
  ),
];

export const CATALOG_BY_ID = new Map(CATALOG_ENTRIES.map((entry) => [entry.id, entry]));

export function getCatalogEntry(id: string): CatalogEntry | undefined {
  return CATALOG_BY_ID.get(id);
}

export function getCatalogForDomain(domain: string): CatalogEntry[] {
  return CATALOG_ENTRIES.filter((entry) => entry.domain === domain);
}
