import { config } from "../config";
import type { IRepository, RepositoryFactory, ApiKey, AuditEntry, Tenant, Session } from "./repository";
import { JsonRepositoryFactory } from "./adapters/json-adapter";
import { SupabaseRepository } from "./adapters/supabase-adapter";

class ProductionRepositoryFactory implements RepositoryFactory {
  private readonly supabaseFactory = new Map<string, IRepository<unknown>>();
  private readonly jsonFactory = new JsonRepositoryFactory();

  private isProduction(): boolean {
    try {
      const cfg = config();
      return cfg.NODE_ENV === "production" || cfg.ISABELLA_RUNTIME_MODE === "production" || cfg.ISABELLA_RUNTIME_MODE === "staging";
    } catch {
      return process.env.NODE_ENV === "production";
    }
  }

  private isDurableJsonAllowed(): boolean {
    try {
      const cfg = config() as unknown as Record<string, unknown>;
      // Explicit flag — defaults to false in production
      if (typeof cfg.DURABLE_JSON_ALLOWED === "boolean") return cfg.DURABLE_JSON_ALLOWED as boolean;
      if (typeof cfg.DURABLE_JSON_ALLOWED === "string") return (cfg.DURABLE_JSON_ALLOWED as string) === "true";
    } catch {}
    const raw = process.env.DURABLE_JSON_ALLOWED;
    if (raw === "true") return true;
    if (raw === "false") return false;
    return false;
  }

  private assertProductionPersistence(): void {
    if (this.isProduction() && !this.isDurableJsonAllowed()) {
      // Supabase must be configured
      const cfg = config();
      if (!cfg.SUPABASE_URL || !cfg.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error(
          "[FATAL] Production persistence misconfigured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required and DURABLE_JSON_ALLOWED must not be used to bypass. Deployment blocker."
        );
      }
    }
    if (this.isProduction() && this.isDurableJsonAllowed()) {
      throw new Error("[FATAL] JSON persistence forbidden in production: DURABLE_JSON_ALLOWED=false required. Use Supabase/Postgres.");
    }
  }

  private getSupabaseRepo<T extends { id: string }>(type: string): IRepository<T> {
    this.assertProductionPersistence();
    let repo = this.supabaseFactory.get(type) as IRepository<T> | undefined;
    if (!repo) {
      repo = new SupabaseRepository<T>(type);
      this.supabaseFactory.set(type, repo as IRepository<unknown>);
    }
    return repo;
  }

  getAdapter<T extends { id: string }>(type: "supabase" | "neon" | "redis", _schema?: string): IRepository<T> {
    if (type === "supabase") return this.getSupabaseRepo<T>("supabase");
    // Neon/redis not yet implemented — fail closed in production
    if (this.isProduction()) {
      throw new Error(`[FATAL] Adapter ${type} not implemented for production — deployment blocker`);
    }
    return new JsonRepositoryFactory().getAdapter<T>(type);
  }

  getApiKeyRepository(): IRepository<ApiKey> {
    if (this.isProduction()) return this.getSupabaseRepo<ApiKey>("apiKey");
    return this.jsonFactory.getApiKeyRepository();
  }

  getAuditRepository(): IRepository<AuditEntry> {
    if (this.isProduction()) return this.getSupabaseRepo<AuditEntry>("audit");
    return this.jsonFactory.getAuditRepository();
  }

  getTenantRepository(): IRepository<Tenant> {
    if (this.isProduction()) return this.getSupabaseRepo<Tenant>("tenant");
    return this.jsonFactory.getTenantRepository();
  }

  getSessionRepository(): IRepository<Session> {
    if (this.isProduction()) return this.getSupabaseRepo<Session>("session");
    return this.jsonFactory.getSessionRepository();
  }
}

export const repositoryFactory: RepositoryFactory = new ProductionRepositoryFactory();

// Legacy export for direct JSON access in dev/test only — not for production routes
export { JsonRepositoryFactory } from "./adapters/json-adapter";
export { SupabaseRepository } from "./adapters/supabase-adapter";
export { createBookpiPostgresRepository } from "../repositories/bookpi-postgres-repository";
