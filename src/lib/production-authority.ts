/**
 * PRODUCTION AUTHORITY (src/lib/production-authority.ts)
 * -----------------------------------------------------------------
 * Define DEFINITIVAMENTE quién es autoridad de qué en producción y
 * elimina la ambigüedad entre proveedores (Supabase vs Neon vs Redis
 * vs Upstash vs KV vs Prisma). Infraestructura ≠ autoridad.
 *
 *   AUTHORITATIVE STATE .... PostgreSQL (DATABASE_URL)
 *   CACHE .................. Redis (REDIS_URL/KV_URL, solo lectura derivada)
 *   VECTOR ................. pgvector (extensión de PostgreSQL)
 *   AUDIT .................. PostgreSQL (tablas + triggers append-only) +
 *                            archivo inmutable + exportación OTLP
 *   OBJECT STORAGE ......... S3-compatible (cuando aplique)
 *   OBSERVABILITY .......... OTLP Collector → backend durable/SIEM
 *                            (buffer en memoria = fallback local, no auditoría)
 *
 *   Identity ..... OIDC/Supabase JWT + API keys server-side (principal-context)
 *   Database ..... PostgreSQL dedicado (repository-factory; JSON prohibido en prod)
 *   Inference .... Proveedor federado Gemini (nativo solo dev declarado)
 *   Audit ........ audit-repository + PG + sello HMAC (sovereign-audit)
 *   Payment ...... Stripe + webhook_events + economic_events + BookPI
 *   Observability  OTel exporter (otel-exporter) + buffer local
 *
 * Cada autoridad expone `verify()` con chequeos REALES de configuración
 * (sin red). `assertProductionAuthorities()` aborta el arranque en
 * producción si una autoridad crítica no está configurada.
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

export const PRODUCTION_AUTHORITIES: readonly AuthorityDefinition[] = [
  {
    id: "identity",
    name: "Identity Authority",
    authority: "OIDC/Supabase JWT + API keys (server-side)",
    infrastructure: ["Supabase Auth", "JWKS"],
    status: "real",
    implementations: ["src/lib/principal-context.ts", "src/lib/api-key-authenticator.ts"],
    verify: () => {
      const cfg = config();
      return [
        {
          ok: has(cfg.AUTH_JWT_SECRET),
          critical: true,
          detail: "AUTH_JWT_SECRET configura la firma/validación de identidad.",
        },
      ];
    },
  },
  {
    id: "database",
    name: "Database Authority",
    authority: "PostgreSQL dedicado (DATABASE_URL)",
    infrastructure: ["Neon", "Supabase Postgres"],
    status: "real",
    implementations: ["src/lib/persistence/repository-factory.ts", "supabase/migrations/*"],
    verify: () => {
      const cfg = config();
      const durable = has(cfg.DATABASE_URL) || (has(cfg.SUPABASE_URL) && has(cfg.AUTH_JWT_SECRET));
      return [
        {
          ok: durable,
          critical: true,
          detail:
            "Estado autoritativo exige DATABASE_URL o Supabase tenant-scoped; JSON prohibido en prod.",
        },
      ];
    },
  },
  {
    id: "inference",
    name: "Inference Authority",
    authority: "Proveedor federado Gemini (generativelanguage.googleapis.com)",
    infrastructure: ["Google Generative AI"],
    status: "real",
    implementations: ["src/server-routes/api/isabella.ts", "src/lib/isabella-native-ml.ts"],
    verify: () => {
      const cfg = config();
      return [
        {
          ok: has(cfg.GEMINI_API_KEY),
          critical: true,
          detail:
            "Sin GEMINI_API_KEY no hay inferencia productiva (503 explícito, sin sustitutos).",
        },
      ];
    },
  },
  {
    id: "audit",
    name: "Audit Authority",
    authority: "audit-repository (hash chain) + PostgreSQL append-only + sello HMAC-SHA3-512",
    infrastructure: ["PostgreSQL", "sistema de archivos inmutable"],
    status: "real",
    implementations: [
      "src/lib/repositories/audit-repository.ts",
      "src/lib/sovereign-audit.ts",
      "supabase/migrations/20260904070000_bookpi_immutability.sql",
    ],
    verify: () => {
      const cfg = config();
      return [
        {
          ok: has(cfg.AEGIS_AUDIT_SECRET),
          critical: true,
          detail: "AEGIS_AUDIT_SECRET firma los sellos de auditoría.",
        },
      ];
    },
  },
  {
    id: "payment",
    name: "Payment Authority",
    authority: "Stripe + webhook_events + economic_events + BookPI",
    infrastructure: ["Stripe API"],
    status: "real",
    implementations: [
      "src/server-routes/api/billing.ts",
      "src/lib/economic-events.ts",
      "supabase/migrations/20260905100000_economic_contract.sql",
    ],
    verify: () => {
      const cfg = config();
      return [
        {
          ok: has(cfg.STRIPE_SECRET_KEY),
          critical: true,
          detail: "STRIPE_SECRET_KEY requerido para cargos y verificación.",
        },
        {
          ok: has(cfg.STRIPE_WEBHOOK_SECRET),
          critical: true,
          detail: "STRIPE_WEBHOOK_SECRET requerido para firma de webhooks.",
        },
        {
          ok: has(cfg.BOOKPI_SIGNING_KEY),
          critical: true,
          detail: "BOOKPI_SIGNING_KEY firma los bloques del ledger.",
        },
      ];
    },
  },
  {
    id: "observability",
    name: "Observability Authority",
    authority: "OTLP Collector → backend durable/SIEM (buffer en memoria = fallback local)",
    infrastructure: ["OTLP/HTTP Collector"],
    status: "real",
    implementations: ["src/lib/otel-exporter.ts", "src/lib/latam-aegis-x.ts (TelemetryService)"],
    verify: () => {
      const cfg = config();
      return [
        {
          ok: has(cfg.OTEL_EXPORTER_OTLP_ENDPOINT),
          critical: false,
          detail:
            "Sin OTEL_EXPORTER_OTLP_ENDPOINT la telemetría queda solo en buffer local (no durable).",
        },
      ];
    },
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

/** Evalúa las 6 autoridades. No lanza; reporta. */
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
    criticalFailed: authorities.some((authority) => authority.criticalFailed),
  };
}

/**
 * Aborta el arranque en producción si una autoridad crítica falla.
 * En desarrollo solo reporta (los tests usan esta vía sin abortar).
 */
export function assertProductionAuthorities(): AuthorityReport {
  const report = evaluateProductionAuthorities();
  if (report.productionLike && report.criticalFailed) {
    const failed = report.authorities
      .filter((authority) => authority.criticalFailed)
      .map((authority) => authority.id)
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
