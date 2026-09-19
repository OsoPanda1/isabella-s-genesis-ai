/**
 * KILL SWITCH (§7.1 del Charter FGAIS)
 * -----------------------------------------------------------------
 * Parada de emergencia por capacidad autónoma: inference,
 * tool-execution, skill-execution, payouts, quantum-jobs.
 *
 * - Estado durable en PostgreSQL (`kill_switch_state`); store en
 *   memoria solo para desarrollo/tests (inyectable).
 * - `isKilled()` se consulta ANTES de ejecutar; engaged → deny/503.
 * - engage/release exigen actor + motivo y emiten auditoría vía
 *   callback inyectado (fail-closed: sin auditoría no hay cambio).
 */

import { Pool } from "pg";
import { config } from "./config";

export const KILL_SWITCH_CAPABILITIES = [
  "inference",
  "tool-execution",
  "skill-execution",
  "payouts",
  "quantum-jobs",
] as const;

export type KillCapability = (typeof KILL_SWITCH_CAPABILITIES)[number];

export interface KillSwitchState {
  capability: string;
  engaged: boolean;
  reason: string | null;
  actorId: string | null;
  engagedAt: string | null;
  releasedAt: string | null;
}

export interface KillSwitchStore {
  isKilled(capability: string): Promise<boolean>;
  engage(capability: string, reason: string, actorId: string): Promise<KillSwitchState>;
  release(capability: string, actorId: string): Promise<KillSwitchState>;
  list(): Promise<KillSwitchState[]>;
}

export function isKnownCapability(capability: string): capability is KillCapability {
  return (KILL_SWITCH_CAPABILITIES as readonly string[]).includes(capability);
}

export function createMemoryKillSwitchStore(
  audit?: (event: string, details: Record<string, unknown>) => void,
): KillSwitchStore & { states: Map<string, KillSwitchState> } {
  const states = new Map<string, KillSwitchState>();
  const now = () => new Date().toISOString();
  return {
    states,
    async isKilled(capability: string): Promise<boolean> {
      return states.get(capability)?.engaged === true;
    },
    async engage(capability: string, reason: string, actorId: string): Promise<KillSwitchState> {
      if (!isKnownCapability(capability)) throw new Error(`Capacidad desconocida: ${capability}.`);
      if (!reason || !actorId) throw new Error("Motivo y actor obligatorios.");
      const state: KillSwitchState = {
        capability,
        engaged: true,
        reason,
        actorId,
        engagedAt: now(),
        releasedAt: null,
      };
      states.set(capability, state);
      audit?.("kill-switch.engaged", { capability, reason, actorId });
      return state;
    },
    async release(capability: string, actorId: string): Promise<KillSwitchState> {
      const current = states.get(capability);
      if (!current?.engaged) throw new Error(`Sin parada activa en '${capability}'.`);
      if (!actorId) throw new Error("Actor obligatorio.");
      const state: KillSwitchState = {
        ...current,
        engaged: false,
        releasedAt: now(),
        actorId,
      };
      states.set(capability, state);
      audit?.("kill-switch.released", { capability, actorId });
      return state;
    },
    async list(): Promise<KillSwitchState[]> {
      return [...states.values()];
    },
  };
}

let pool: Pool | null = null;
let poolUrl: string | null = null;

function getPool(): Pool {
  const url = config().DATABASE_URL;
  if (!url) {
    throw new Error("Kill switch durable requiere DATABASE_URL (fail-closed).");
  }
  if (!pool || poolUrl !== url) {
    if (pool) void pool.end().catch(() => undefined);
    pool = new Pool({ connectionString: url, max: 2 });
    poolUrl = url;
  }
  return pool;
}

function mapRow(row: Record<string, unknown>): KillSwitchState {
  return {
    capability: String(row.capability),
    engaged: row.engaged === true,
    reason: row.reason === null ? null : String(row.reason),
    actorId: row.actor_id === null ? null : String(row.actor_id),
    engagedAt: row.engaged_at === null ? null : new Date(String(row.engaged_at)).toISOString(),
    releasedAt: row.released_at === null ? null : new Date(String(row.released_at)).toISOString(),
  };
}

export function createPostgresKillSwitchStore(
  audit?: (event: string, details: Record<string, unknown>) => void,
): KillSwitchStore {
  return {
    async isKilled(capability: string): Promise<boolean> {
      const { rows } = await getPool().query(
        "SELECT engaged FROM kill_switch_state WHERE capability = $1 LIMIT 1",
        [capability],
      );
      return rows[0]?.engaged === true;
    },
    async engage(capability: string, reason: string, actorId: string): Promise<KillSwitchState> {
      if (!isKnownCapability(capability)) throw new Error(`Capacidad desconocida: ${capability}.`);
      if (!reason || !actorId) throw new Error("Motivo y actor obligatorios.");
      const { rows } = await getPool().query(
        `INSERT INTO kill_switch_state (capability, engaged, reason, actor_id, engaged_at, released_at)
         VALUES ($1, TRUE, $2, $3, NOW(), NULL)
         ON CONFLICT (capability) DO UPDATE
           SET engaged = TRUE, reason = $2, actor_id = $3, engaged_at = NOW(), released_at = NULL, updated_at = NOW()
         RETURNING *`,
        [capability, reason, actorId],
      );
      audit?.("kill-switch.engaged", { capability, reason, actorId });
      return mapRow(rows[0]);
    },
    async release(capability: string, actorId: string): Promise<KillSwitchState> {
      if (!actorId) throw new Error("Actor obligatorio.");
      const { rows } = await getPool().query(
        `UPDATE kill_switch_state
         SET engaged = FALSE, released_at = NOW(), actor_id = $2, updated_at = NOW()
         WHERE capability = $1 AND engaged = TRUE
         RETURNING *`,
        [capability, actorId],
      );
      if (!rows[0]) throw new Error(`Sin parada activa en '${capability}'.`);
      audit?.("kill-switch.released", { capability, actorId });
      return mapRow(rows[0]);
    },
    async list(): Promise<KillSwitchState[]> {
      const { rows } = await getPool().query(
        "SELECT * FROM kill_switch_state ORDER BY capability ASC",
      );
      return rows.map(mapRow);
    },
  };
}

export const KILL_SWITCH = {
  capabilities: KILL_SWITCH_CAPABILITIES,
  memory: createMemoryKillSwitchStore,
  postgres: createPostgresKillSwitchStore,
};
