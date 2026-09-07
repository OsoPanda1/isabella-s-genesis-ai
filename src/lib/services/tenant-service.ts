import { repositoryFactory } from "../persistence/repository-factory";
import type { AuditEntry, IRepository, Tenant } from "../persistence/repository";
import { mapTenantRowToDomain, type TenantDomain } from "../domains/tenant";

// ============================================================================
// TENANT SERVICE (src/lib/services/tenant-service.ts)
// ----------------------------------------------------------------------------
// Capa de aplicación del dominio de tenants contra repositorios.
// Encapsula creación, lectura y auditoría transaccional (FASE 5).
// ============================================================================

export interface CreateTenantCommand {
  id: string;
  name: string;
  slug: string;
  region: string;
  tier: string;
  createdBy: string;
  quotaBalance?: number;
  quotaTierLimit?: number;
  metadata?: Record<string, unknown>;
}

export class TenantService {
  private readonly tenantRepo: IRepository<Tenant>;
  private readonly auditRepo: IRepository<AuditEntry>;

  constructor(
    tenantRepo: IRepository<Tenant> = repositoryFactory.getTenantRepository(),
    auditRepo: IRepository<AuditEntry> = repositoryFactory.getAuditRepository(),
  ) {
    this.tenantRepo = tenantRepo;
    this.auditRepo = auditRepo;
  }

  async createTenant(command: CreateTenantCommand): Promise<TenantDomain> {
    if (!command.id || !command.name || !command.slug) {
      throw new Error("invalid_tenant_request");
    }
    const existing = await this.tenantRepo.read(command.id, command.id);
    if (existing) {
      throw new Error("tenant_already_exists");
    }

    const tier = normalizeProvisionTier(command.tier);
    const tenant: Tenant = {
      id: command.id,
      slug: command.slug,
      tier,
      quotaBalance: command.quotaBalance ?? 0,
      quotaTierLimit: command.quotaTierLimit ?? defaultLimit(tier),
      createdAt: new Date().toISOString(),
      createdBy: command.createdBy,
      metadata: command.metadata ?? { provisioned: true },
    };

    await this.tenantRepo.create(command.id, tenant);

    await this.auditRepo.audit({
      id: crypto.randomUUID(),
      tenantId: command.id,
      traceId: `trace_tenant_${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      action: "tenant.created",
      resource: `tenant:${command.slug}`,
      severity: "S3",
      actor: command.createdBy,
      result: "success",
      details: { tenantId: command.id, slug: command.slug, createdBy: command.createdBy },
    });

    return mapTenantRowToDomain({
      id: tenant.id,
      slug: tenant.slug,
      name: command.name,
      region: command.region,
      tier: mapTier(tenant.tier),
      quota_balance: tenant.quotaBalance,
      quota_tier_limit: tenant.quotaTierLimit,
      created_by: tenant.createdBy,
      metadata: tenant.metadata,
      created_at: tenant.createdAt,
      updated_at: tenant.createdAt,
    });
  }

  async getTenant(tenantId: string): Promise<TenantDomain | null> {
    const record = await this.tenantRepo.read(tenantId, tenantId);
    if (!record) return null;
    return mapTenantRowToDomain({
      id: record.id,
      slug: record.slug,
      name: record.id,
      region: "",
      tier: mapTier(record.tier),
      quota_balance: record.quotaBalance,
      quota_tier_limit: record.quotaTierLimit,
      created_by: record.createdBy,
      metadata: record.metadata,
      created_at: record.createdAt,
      updated_at: record.createdAt,
    });
  }
}

function normalizeProvisionTier(tier: string): Tenant["tier"] {
  switch (tier) {
    case "Free":
    case "free":
      return "free";
    case "Enterprise":
    case "enterprise":
      return "enterprise";
    case "Sovereign":
    case "sovereign":
      return "sovereign";
    default:
      return "enterprise";
  }
}

function mapTier(tier: Tenant["tier"]): TenantDomain["tier"] {
  switch (tier) {
    case "free":
      return "Free";
    case "enterprise":
      return "Enterprise";
    case "sovereign":
      return "Sovereign";
    default:
      return "Free";
  }
}

function defaultLimit(tier: Tenant["tier"]): number {
  switch (tier) {
    case "free":
      return 100;
    case "enterprise":
      return 10_000;
    default:
      return 1_000_000;
  }
}
