/**
 * REGISTRO FORMAL DE CAPACIDADES (src/lib/capability-registry.ts)
 * -----------------------------------------------------------------
 * Taxonomía canónica de estados de capacidad:
 *   implemented | verified | experimental | simulated | shadow | planned | unavailable
 *
 * Materializa técnicamente la taxonomía del marco documental. Permite
 * que el sistema distinga "existe el contrato" de "está realmente
 * implementado y verificado", evitando afirmar "operational" sin
 * evidencia.
 */

export type CapabilityState =
  "implemented" | "verified" | "experimental" | "simulated" | "shadow" | "planned" | "unavailable";

export const CAPABILITY_STATES: readonly CapabilityState[] = [
  "implemented",
  "verified",
  "experimental",
  "simulated",
  "shadow",
  "planned",
  "unavailable",
];

export interface CapabilityRecord {
  id: string;
  state: CapabilityState;
  /** evidencia que respalda el estado (test, ruta, documento) */
  evidence?: string[];
  /** responsabilidad (módulo o persona) */
  owner?: string;
  /** actualización */
  updatedAt?: string;
  /** dependencias de configuración/entorno para estar operativo */
  requiredConfig?: string[];
  metadata?: Record<string, unknown>;
}

export type CapabilityRegistry = Map<string, CapabilityRecord>;

export class CapabilityRegistryService {
  private registry = new Map<string, CapabilityRecord>();

  register(record: CapabilityRecord): void {
    this.registry.set(record.id, record);
  }

  get(id: string): CapabilityRecord | undefined {
    return this.registry.get(id);
  }

  stateOf(id: string): CapabilityState {
    return this.registry.get(id)?.state ?? "unavailable";
  }

  isOperational(id: string): boolean {
    return this.stateOf(id) === "implemented" || this.stateOf(id) === "verified";
  }

  all(): CapabilityRecord[] {
    return [...this.registry.values()];
  }

  byState(state: CapabilityState): CapabilityRecord[] {
    return this.all().filter((c) => c.state === state);
  }

  toSnapshot(): Record<string, CapabilityState> {
    const out: Record<string, CapabilityState> = {};
    for (const [id, rec] of this.registry) out[id] = rec.state;
    return out;
  }
}

/** Registrar genérico con los dominios declarados en la documentación. */
export function createDefaultCapabilityRegistry(): CapabilityRegistryService {
  const svc = new CapabilityRegistryService();
  const now = new Date().toISOString();
  const register = (id: string, state: CapabilityState, evidence?: string[]): void => {
    const record: CapabilityRecord = { id, state, updatedAt: now };
    if (evidence) record.evidence = evidence;
    svc.register(record);
  };

  register("build", "implemented", ["package.json scripts", "npm run typecheck/lint/test/build"]);
  register("auth", "implemented", ["src/lib/principal-context.ts", "src/lib/jwt-verifier.ts"]);
  register("identity.oidc", "planned");
  register("tenancy", "implemented", ["supabase/migrations/*", "src/lib/tenant-guard.ts"]);
  register("memory", "implemented", ["src/lib/memory-engine.ts", "tabla memories"]);
  register("bookpi", "implemented", ["src/lib/bookpi*.ts", "tabla bookpi_ledger"]);
  register("audit", "implemented", ["src/lib/repositories/audit-repository.ts"]);
  register("crown", "implemented", ["src/lib/crown.ts", "constitutional-gate.ts"]);
  register("llm", "implemented", ["src/routes/api/isabella.ts"]);
  register("voice", "implemented", ["src/routes/api/isabella-voice.ts"]);
  register("tools", "experimental", ["src/lib/tool-registry.ts", "src/lib/orion-engine.ts"]);
  register("sandbox", "experimental", ["src/lib/sovereign-sandbox.ts"]);
  register("pqc", "unavailable");
  register("monetization", "implemented", ["src/lib/monetization/*"]);
  register("heads.12", "implemented", ["12 cognitive heads configured in sovereign-engine.ts"]);
  register("nuclei.24", "simulated", ["24 cognitive nuclei modeled in sovereign-engine.ts"]);

  return svc;
}

export const capabilityRegistry: CapabilityRegistryService = createDefaultCapabilityRegistry();
