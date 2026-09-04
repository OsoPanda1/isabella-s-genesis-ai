export interface CatalogEntry {
  id: string;
  domain: string;
  method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  path: string;
  auth: string;
  idempotency: boolean;
  audit: boolean;
  status: "contract" | "implemented" | "draft";
  description: string;
  requestSchema?: string;
  responseSchema?: string;
  mockResponse?: Record<string, unknown> | Array<Record<string, unknown>>;
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
  { id: "pqc", name: "PQC Defense", color: "var(--argus)" },
  { id: "billing", name: "Billing & Credits", color: "var(--orion)" },
  { id: "ops", name: "Operations & Health", color: "var(--argus)" },
] as const;

export const CATALOG_ENTRIES: CatalogEntry[] = [];

// Helper to generate REST CRUD routes for the catalog to represent the full 720+ entries elegantly
const addCrudRoutes = (
  domain: string,
  resource: string,
  basePath: string,
  descName: string,
  schemaFields: Record<string, string>,
  mockObj: Record<string, unknown>,
) => {
  CATALOG_ENTRIES.push(
    {
      id: `${domain}.${resource}.list`,
      domain,
      method: "GET",
      path: `${basePath}`,
      auth: "OIDC+tenant+scope",
      idempotency: false,
      audit: false,
      status: "contract",
      description: `Listar todos los ${descName} disponibles en el espacio de trabajo del inquilino.`,
      responseSchema: JSON.stringify({ items: [schemaFields], total: "number" }, null, 2),
      mockResponse: { items: [mockObj], total: 1 },
    },
    {
      id: `${domain}.${resource}.get`,
      domain,
      method: "GET",
      path: `${basePath}/{id}`,
      auth: "OIDC+tenant+scope",
      idempotency: false,
      audit: false,
      status: "contract",
      description: `Obtener detalles específicos de un ${descName} por su identificador único.`,
      responseSchema: JSON.stringify(schemaFields, null, 2),
      mockResponse: mockObj,
    },
    {
      id: `${domain}.${resource}.create`,
      domain,
      method: "POST",
      path: `${basePath}`,
      auth: "OIDC+tenant+scope",
      idempotency: true,
      audit: true,
      status: "contract",
      description: `Registrar o crear un nuevo ${descName} con políticas de gobernanza aplicadas.`,
      requestSchema: JSON.stringify(schemaFields, null, 2),
      responseSchema: JSON.stringify(
        { ...schemaFields, id: "string", createdAt: "string" },
        null,
        2,
      ),
      mockResponse: {
        ...mockObj,
        id: `id-${Math.random().toString(36).slice(2, 9)}`,
        createdAt: new Date().toISOString(),
      },
    },
    {
      id: `${domain}.${resource}.update`,
      domain,
      method: "PATCH",
      path: `${basePath}/{id}`,
      auth: "OIDC+tenant+scope",
      idempotency: true,
      audit: true,
      status: "contract",
      description: `Actualizar de forma incremental las propiedades de un ${descName} específico.`,
      requestSchema: JSON.stringify(schemaFields, null, 2),
      responseSchema: JSON.stringify(
        { ...schemaFields, id: "string", updatedAt: "string" },
        null,
        2,
      ),
      mockResponse: { ...mockObj, updatedAt: new Date().toISOString() },
    },
    {
      id: `${domain}.${resource}.delete`,
      domain,
      method: "DELETE",
      path: `${basePath}/{id}`,
      auth: "OIDC+tenant+scope",
      idempotency: true,
      audit: true,
      status: "contract",
      description: `Eliminar lógicamente un ${descName} y purgar referencias asociadas en la memoria activa.`,
      responseSchema: JSON.stringify(
        { deleted: "boolean", id: "string", purgedAt: "string" },
        null,
        2,
      ),
      mockResponse: { deleted: true, id: "target-id", purgedAt: new Date().toISOString() },
    },
    {
      id: `${domain}.${resource}.action`,
      domain,
      method: "POST",
      path: `${basePath}/{id}/actions/execute`,
      auth: "OIDC+tenant+scope",
      idempotency: true,
      audit: true,
      status: "contract",
      description: `Ejecutar una acción o procedimiento operativo especial sobre el ${descName} seleccionado.`,
      requestSchema: JSON.stringify({ action: "string", params: "object" }, null, 2),
      responseSchema: JSON.stringify({ status: "success", traceId: "string" }, null, 2),
      mockResponse: { status: "success", traceId: "tr-live-execution-simulated" },
    },
  );
};

// 1. Domain: Identity
addCrudRoutes(
  "identity",
  "sessions",
  "/v1/identity/sessions",
  "perfil de sesión OIDC activa",
  { sessionToken: "string", expiresAt: "string", scopes: "string[]" },
  {
    sessionToken: "eyJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ...",
    expiresAt: "2026-12-31T23:59:59Z",
    scopes: ["read", "write"],
  },
);
addCrudRoutes(
  "identity",
  "users",
  "/v1/identity/users",
  "usuario autenticado",
  { username: "string", email: "string", status: "string" },
  { username: "anubisvillasenor", email: "anubisvillasenor1@gmail.com", status: "active" },
);
addCrudRoutes(
  "identity",
  "roles",
  "/v1/identity/roles",
  "rol RBAC constitucional",
  { name: "string", permissions: "string[]", tier: "number" },
  { name: "governance_admin", permissions: ["*:*", "crown:bypass"], tier: 1 },
);
addCrudRoutes(
  "identity",
  "scopes",
  "/v1/identity/scopes",
  "alcance de datos limitado",
  { identifier: "string", description: "string", dataBoundary: "string" },
  {
    identifier: "data:personal:process",
    description: "Procesar datos territoriales",
    dataBoundary: "Nodo Cero",
  },
);
addCrudRoutes(
  "identity",
  "tenants",
  "/v1/identity/tenants",
  "inquilino o nodo soberano",
  { name: "string", location: "string", complianceTier: "string" },
  { name: "TAMV ONLINE NETWORK", location: "Real del Monte, Hidalgo", complianceTier: "Sovereign" },
);
addCrudRoutes(
  "identity",
  "consents",
  "/v1/identity/consents",
  "consentimiento explícito",
  { actorId: "string", purpose: "string", granted: "boolean" },
  { actorId: "usr-anubis", purpose: "Uso de memoria histórica de Real del Monte", granted: true },
);
addCrudRoutes(
  "identity",
  "api-keys",
  "/v1/identity/api-keys",
  "llave de API rotada",
  { label: "string", truncatedKey: "string", role: "string" },
  { label: "Isabella-Integration-Key", truncatedKey: "isa_live_...9f2a", role: "orion_executor" },
);
addCrudRoutes(
  "identity",
  "devices",
  "/v1/identity/devices",
  "dispositivo autorizado",
  { deviceName: "string", ipAddress: "string", trustworthyScore: "number" },
  { deviceName: "Terminal-Soberano-01", ipAddress: "192.168.10.15", trustworthyScore: 0.99 },
);
addCrudRoutes(
  "identity",
  "service-accounts",
  "/v1/identity/service-accounts",
  "cuenta de servicio",
  { accountName: "string", permissions: "string[]" },
  { accountName: "service-bookpi-writer", permissions: ["bookpi:write"] },
);
addCrudRoutes(
  "identity",
  "jwks",
  "/v1/identity/jwks",
  "par de claves públicas JWK",
  { kid: "string", alg: "string", n: "string" },
  { kid: "isabella-public-jwk-1", alg: "RS256", n: "uv-z-Xf7s..." },
);

// 2. Domain: Crown
addCrudRoutes(
  "crown",
  "requests",
  "/v1/crown/requests",
  "petición de enrutamiento CROWN",
  { input: "string", routedTo: "string" },
  { input: "Generar reporte de patrimonio", routedTo: "ORION" },
);
addCrudRoutes(
  "crown",
  "plans",
  "/v1/crown/plans",
  "plan operativo propuesto",
  { steps: "string[]", estimatedLatencyMs: "number" },
  { steps: ["Validar en ARGUS", "Consultar memoria", "Generar síntesis"], estimatedLatencyMs: 120 },
);
addCrudRoutes(
  "crown",
  "policies",
  "/v1/crown/policies",
  "regla constitucional de gobernanza",
  { code: "string", active: "boolean" },
  { code: "HUMAN_SUPREMACY", active: true },
);
addCrudRoutes(
  "crown",
  "decisions",
  "/v1/crown/decisions",
  "decisión de arbitraje",
  { traceId: "string", primaryNode: "string" },
  { traceId: "tr-938fd8aa-381a", primaryNode: "CROWN" },
);
addCrudRoutes(
  "crown",
  "approvals",
  "/v1/crown/approvals",
  "aprobación de alto impacto",
  { token: "string", action: "string", approvedBy: "string" },
  { token: "tok-approve-991", action: "modify", approvedBy: "Edwin Oswaldo Castillo" },
);
addCrudRoutes(
  "crown",
  "replays",
  "/v1/crown/replays",
  "sesión de reejecución de traza",
  { originalTraceId: "string", replayTraceId: "string" },
  { originalTraceId: "tr-original-1", replayTraceId: "tr-replay-1" },
);
addCrudRoutes(
  "crown",
  "budgets",
  "/v1/crown/budgets",
  "límite financiero o de tokens",
  { dailyLimit: "number", remaining: "number" },
  { dailyLimit: 500000, remaining: 485120 },
);
addCrudRoutes(
  "crown",
  "routing",
  "/v1/crown/routing",
  "parámetro de enrutamiento dinámico",
  { nodeBias: "string", activeScale: "number" },
  { nodeBias: "SOPHIA", activeScale: 0.95 },
);
addCrudRoutes(
  "crown",
  "feature-flags",
  "/v1/crown/feature-flags",
  "bandera de característica",
  { flagName: "string", enabled: "boolean" },
  { flagName: "realtime-waveform-stream", enabled: true },
);
addCrudRoutes(
  "crown",
  "kill-switches",
  "/v1/crown/kill-switches",
  "mecanismo de apagado seguro de emergencia",
  { active: "boolean", triggeredBy: "string" },
  { active: false, triggeredBy: "system" },
);

// 3. Domain: Heads
addCrudRoutes(
  "heads",
  "heads",
  "/v1/heads/heads",
  "cabeza cognitiva activa",
  { name: "string", focus: "string" },
  { name: "Isabella Primary Head", focus: "Sovereign Dialogue" },
);
addCrudRoutes(
  "heads",
  "cores",
  "/v1/heads/cores",
  "núcleo de inferencia local",
  { modelName: "string", status: "string" },
  { modelName: "google/gemini-3.5-flash", status: "healthy" },
);
addCrudRoutes(
  "heads",
  "proposals",
  "/v1/heads/proposals",
  "propuesta del modelo",
  { draftId: "string", content: "string" },
  { draftId: "prp-1129", content: "Plan de reactivación de turismo sustentable" },
);
addCrudRoutes(
  "heads",
  "verifications",
  "/v1/heads/verifications",
  "verificación heurística",
  { checkedBy: "string", status: "string" },
  { checkedBy: "SOPHIA-Verifier", status: "passed" },
);
addCrudRoutes(
  "heads",
  "health",
  "/v1/heads/health",
  "estado de salud de las cabezas",
  { headId: "string", pingMs: "number" },
  { headId: "ISA", pingMs: 12 },
);
addCrudRoutes(
  "heads",
  "metrics",
  "/v1/heads/metrics",
  "métrica de procesamiento",
  { inputTokens: "number", outputTokens: "number" },
  { inputTokens: 1450, outputTokens: 820 },
);
addCrudRoutes(
  "heads",
  "promotions",
  "/v1/heads/promotions",
  "promoción de contexto a memoria persistente",
  { sourceSession: "string", scope: "string" },
  { sourceSession: "sess-current", scope: "territorial" },
);
addCrudRoutes(
  "heads",
  "rollbacks",
  "/v1/heads/rollbacks",
  "retroceso de estado cognitivo",
  { rollbackToSnapshot: "string" },
  { rollbackToSnapshot: "snap-2026-08-31-0900" },
);
addCrudRoutes(
  "heads",
  "learning-runs",
  "/v1/heads/learning-runs",
  "sesión de auto-ajuste adaptativo",
  { runName: "string", precisionGain: "number" },
  { runName: "Real-del-Monte-Knowledge-Tuning", precisionGain: 0.045 },
);
addCrudRoutes(
  "heads",
  "evaluations",
  "/v1/heads/evaluations",
  "evaluación analítica",
  { testSuite: "string", passRate: "number" },
  { testSuite: "Constitutional-Safety-Conformance", passRate: 1.0 },
);

// We populate the remaining 9 domains programmatically so they exist under catalog entries!
const populateRemainingDomains = () => {
  const domains = [
    {
      id: "memory",
      desc: "memoria",
      paths: [
        "items",
        "sessions",
        "projects",
        "territorial",
        "historical",
        "embeddings",
        "collections",
        "retention",
        "deletions",
        "exports",
      ],
    },
    {
      id: "evidence",
      desc: "evidencia",
      paths: [
        "sources",
        "claims",
        "citations",
        "datasets",
        "documents",
        "hashes",
        "licenses",
        "provenance",
        "retractions",
        "search",
      ],
    },
    {
      id: "praxis",
      desc: "ejecución praxis",
      paths: [
        "skills",
        "manifests",
        "executions",
        "sandboxes",
        "artifacts",
        "permissions",
        "secrets",
        "network-policies",
        "logs",
        "cancellations",
      ],
    },
    {
      id: "bookpi",
      desc: "registro de libro",
      paths: [
        "ledgers",
        "events",
        "blocks",
        "anchors",
        "proofs",
        "signatures",
        "audit-exports",
        "integrity",
        "reconciliation",
        "outbox",
      ],
    },
    {
      id: "topology",
      desc: "nodo de malla",
      paths: [
        "federations",
        "nodes",
        "links",
        "telemetry",
        "incidents",
        "routes",
        "firmware",
        "attestations",
        "mesh-keys",
        "sync",
      ],
    },
    {
      id: "quantum",
      desc: "recurso cuántico",
      paths: [
        "jobs",
        "circuits",
        "providers",
        "backends",
        "budgets",
        "results",
        "artifacts",
        "replays",
        "queues",
        "calibration",
      ],
    },
    {
      id: "pqc",
      desc: "seguridad pqc",
      paths: [
        "profiles",
        "kem-keys",
        "signing-keys",
        "certificates",
        "rotations",
        "revocations",
        "test-vectors",
        "benchmarks",
        "policies",
        "hsm",
      ],
    },
    {
      id: "billing",
      desc: "registro de cobro",
      paths: [
        "customers",
        "subscriptions",
        "invoices",
        "usage",
        "credits",
        "payouts",
        "webhooks",
        "plans",
        "entitlements",
        "tax",
      ],
    },
    {
      id: "ops",
      desc: "telemetría de operaciones",
      paths: [
        "health",
        "readiness",
        "deployments",
        "releases",
        "canaries",
        "traces",
        "metrics",
        "alerts",
        "backups",
        "incidents",
      ],
    },
  ];

  for (const d of domains) {
    for (const p of d.paths) {
      addCrudRoutes(
        d.id,
        p,
        `/v1/${d.id}/${p}`,
        `${d.desc} para ${p}`,
        { resourceId: "string", status: "string" },
        {
          resourceId: `res-${p}-${Math.random().toString(36).slice(2, 6)}`,
          status: "active",
          lastAudited: new Date().toISOString(),
        },
      );
    }
  }
};

populateRemainingDomains();
