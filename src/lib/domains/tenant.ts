import { createHash } from "node:crypto";

// ============================================================================
// DOMINIO DE TENANT (src/lib/domains/tenant.ts)
// ----------------------------------------------------------------------------
// Contrato de dominio canónico y mappers explícitos hacia/desde la fila SQL.
// Aislado de adaptadores: domain no depende de proveedores externos (AGENTS.md §11).
// ============================================================================

export type TenantTier = "Free" | "Enterprise" | "Sovereign";

export interface TenantDomain {
  id: string;
  slug: string;
  name: string;
  region: string;
  tier: TenantTier;
  quotaBalance: number;
  quotaTierLimit: number;
  createdAt: Date;
  createdBy: string | null;
  metadata: Record<string, unknown>;
}

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  region: string;
  tier: TenantTier;
  quota_balance: number;
  quota_tier_limit: number;
  created_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Derivación idempotente y unívoca de slug a partir del nombre. */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "tenant"
  );
}

/** Mapea una fila de Postgres (snake_case) al objeto de dominio (camelCase). */
export function mapTenantRowToDomain(row: TenantRow): TenantDomain {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    region: row.region,
    tier: row.tier,
    quotaBalance: Number(row.quota_balance),
    quotaTierLimit: Number(row.quota_tier_limit),
    createdAt: new Date(row.created_at),
    createdBy: row.created_by ?? null,
    metadata: row.metadata ?? {},
  };
}

/** Mapea el objeto de dominio a fila de Postgres (snake_case). */
export function mapTenantDomainToRow(domain: TenantDomain): TenantRow {
  return {
    id: domain.id,
    slug: domain.slug,
    name: domain.name,
    region: domain.region,
    tier: domain.tier,
    quota_balance: domain.quotaBalance,
    quota_tier_limit: domain.quotaTierLimit,
    created_by: domain.createdBy,
    metadata: domain.metadata,
    created_at: domain.createdAt.toISOString(),
    updated_at: domain.createdAt.toISOString(),
  };
}

/** Aplica la política de límite de cuota por tier (solo como valor por defecto). */
export function defaultQuotaTierLimit(tier: TenantTier): number {
  switch (tier) {
    case "Free":
      return 100;
    case "Enterprise":
      return 10_000;
    case "Sovereign":
      return 1_000_000;
    default:
      return 1_000;
  }
}

/** Normaliza el tier a un valor canónico seguro. */
export function normalizeTenantTier(tier: string): TenantTier {
  if (tier === "Enterprise" || tier === "Sovereign") return tier;
  return "Free";
}

/** Resumen criptográfico del dominio para auditoría/hash chaining. */
export function tenantDomainHash(domain: TenantDomain): string {
  return createHash("sha256")
    .update(
      [
        domain.id,
        domain.slug,
        domain.name,
        domain.tier,
        domain.quotaBalance,
        domain.quotaTierLimit,
        domain.createdAt.toISOString(),
      ].join("|"),
    )
    .digest("hex");
}
