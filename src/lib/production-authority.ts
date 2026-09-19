/**
 * PRODUCTION AUTHORITY (src/lib/production-authority.ts)
 * -----------------------------------------------------------------
 * Define DEFINITIVAMENTE quién es autoridad de qué en producción.
 * Infraestructura ≠ autoridad.
 *
 * AUTHORITATIVE STATE .... PostgreSQL (DATABASE_URL)
 * CACHE .................. Redis (derivada; nunca fuente de verdad)
 * VECTOR ................. pgvector (PostgreSQL)
 * AUDIT .................. PostgreSQL + BookPI/evidence hash chain
 * OBJECT STORAGE ......... S3-compatible cuando aplique
 * OBSERVABILITY .......... OTLP Collector → backend durable/SIEM
 * IDENTITY ............... OIDC/JWT + API keys (principal-context)
 * INFERENCE .............. canonical Isabella gateway → authorized provider
 */

import { config } from "./config";
import { isProductionLike, resolveRuntimeMode, type RuntimeMode } from "./runtime-mode";

export type AuthorityId =
  "identity" | "database" | "inference" | "audit" | "payment" | "observability";
export type AuthorityStatus = "real" | "partial";

export interface AuthorityCheck {
  ok: boolean;
  critical: boolean;
  detail: string;
}
export interface AuthorityDefinition {
  id: AuthorityId;
  name: string;
  authority: string;
  infrastructure: readonly string[];
  status: AuthorityStatus;
  implementations: readonly string[];
  verify: () => AuthorityCheck[];
}

function has(value: unknown): boolean {
  return typeof value === "string" ? value.length > 0 : value !== undefined && value !== null;
}

function hasAuthorizedInferenceProvider(): boolean {
  const cfg = config();
  return Boolean(has(cfg.GEMINI_API_KEY) || has(cfg.GROQ_API_KEY) || has(cfg.XAI_API_KEY));
}

export const PRODUCTION_AUTHORITIES: readonly AuthorityDefinition[] = [
  {
    id: "identity",
    name: "Identity Authority",
    authority: "OIDC/JWT + API keys (server-side)",
    infrastructure: ["OIDC", "JWKS"],
    status: "real",
    implementations: ["src/lib/principal-context.ts", "src/lib/api-key-authenticator.ts"],
    verify: () => [
      {
        ok: has(config().AUTH_JWT_SECRET),
        critical: true,
        detail: "AUTH_JWT_SECRET requerido para identidad firmada.",
      },
    ],
  },
  {
    id: "database",
    name: "Database Authority",
    authority: "PostgreSQL dedicado (DATABASE_URL)",
    infrastructure: ["Neon", "PostgreSQL"],
    status: "real",
    implementations: [
      "src/lib/persistence/repository-factory.ts",
      "src/lib/persistence/adapters/neon-adapter.ts",
    ],
    verify: () => [
      {
        ok: has(config().DATABASE_URL),
        critical: true,
        detail: "DATABASE_URL requerido para estado durable en producción.",
      },
    ],
  },
  {
    id: "inference",
    name: "Inference Authority",
    authority: "Canonical Isabella Chat Gateway → authorized inference provider",
    infrastructure: ["Gemini", "Groq", "xAI"],
    status: "real",
    implementations: [
      "src/lib/isabella-chat-gateway.ts",
      "src/routes/api/isabella.ts",
      "src/routes/api/v1/isabella.ts",
    ],
    verify: () => [
      {
        ok: hasAuthorizedInferenceProvider(),
        critical: true,
        detail:
          "Se requiere al menos un proveedor de inferencia autorizado; sin proveedor se responde 503, nunca con una simulación.",
      },
    ],
  },
  {
    id: "audit",
    name: "Audit Authority",
    authority: "Evidence/BookPI hash chain + PostgreSQL durable audit",
    infrastructure: ["PostgreSQL", "BookPI"],
    status: "real",
    implementations: [
      "src/lib/repositories/audit-repository.ts",
      "src/lib/sovereign-audit.ts",
      "supabase/migrations/20260904070000_bookpi_immutability.sql",
    ],
    verify: () => [
      {
        ok: has(config().AEGIS_AUDIT_SECRET),
        critical: true,
        detail: "AEGIS_AUDIT_SECRET requerido para sellos de auditoría.",
      },
    ],
  },
  {
    id: "payment",
    name: "Payment Authority",
    authority: "Stripe + webhook_events + economic_events + BookPI",
    infrastructure: ["Stripe API"],
    status: "real",
    implementations: ["src/server-routes/api/billing.ts", "src/lib/economic-events.ts"],
    verify: () => {
      const cfg = config();
      return [
        {
          ok: has(cfg.STRIPE_SECRET_KEY),
          critical: true,
          detail: "STRIPE_SECRET_KEY requerido.",
        },
        {
          ok: has(cfg.STRIPE_WEBHOOK_SECRET),
          critical: true,
          detail: "STRIPE_WEBHOOK_SECRET requerido.",
        },
        {
          ok: has(cfg.BOOKPI_SIGNING_KEY),
          critical: true,
          detail: "BOOKPI_SIGNING_KEY requerido.",
        },
      ];
    },
  },
  {
    id: "observability",
    name: "Observability Authority",
    authority: "OTLP Collector → backend durable/SIEM",
    infrastructure: ["OTLP/HTTP Collector"],
    status: "real",
    implementations: ["src/lib/otel-exporter.ts", "src/lib/latam-aegis-x.ts"],
    verify: () => [
      {
        ok: has(config().OTEL_EXPORTER_OTLP_ENDPOINT),
        critical: true,
        detail: "OTEL_EXPORTER_OTLP_ENDPOINT requerido en producción.",
      },
    ],
  },
];

export interface AuthorityReport {
  mode: RuntimeMode;
  productionLike: boolean;
  authorities: Array<{
    id: AuthorityId;
    name: string;
    authority: string;
    ok: boolean;
    criticalFailed: boolean;
    checks: AuthorityCheck[];
  }>;
  criticalFailed: boolean;
}

export function evaluateProductionAuthorities(): AuthorityReport {
  const mode = resolveRuntimeMode(config().ISABELLA_RUNTIME_MODE);
  const productionLike = isProductionLike(mode);
  const authorities = PRODUCTION_AUTHORITIES.map((definition) => {
    let checks: AuthorityCheck[];
    try {
      checks = definition.verify();
    } catch {
      checks = [{ ok: false, critical: true, detail: "Verificación lanzó excepción." }];
    }
    const criticalFailed = productionLike && checks.some((check) => check.critical && !check.ok);
    return {
      id: definition.id,
      name: definition.name,
      authority: definition.authority,
      ok: checks.every((check) => check.ok || !check.critical || !productionLike),
      criticalFailed,
      checks,
    };
  });
  return {
    mode,
    productionLike,
    authorities,
    criticalFailed: authorities.some((a) => a.criticalFailed),
  };
}

export function assertProductionAuthorities(): AuthorityReport {
  const report = evaluateProductionAuthorities();
  if (report.productionLike && report.criticalFailed) {
    const failed = report.authorities
      .filter((a) => a.criticalFailed)
      .map((a) => a.id)
      .join(", ");
    throw new Error(`[ProductionAuthority] Autoridades críticas sin configurar: ${failed}.`);
  }
  return report;
}

export const PRODUCTION_AUTHORITY = {
  authorities: PRODUCTION_AUTHORITIES,
  evaluate: evaluateProductionAuthorities,
  assert: assertProductionAuthorities,
};
