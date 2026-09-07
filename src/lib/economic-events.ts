/**
 * ECONOMIC EVENTS (src/lib/economic-events.ts)
 * -----------------------------------------------------------------
 * §5/§8.-: la autoridad económica es PostgreSQL. Este módulo expone:
 *  - `claimWebhookEvent()`: deduplicación ATÓMICA de webhooks vía
 *    UNIQUE(provider, provider_event_id). Devuelve `duplicate: true` solo
 *    cuando el INSERT choca con la constraint — nunca por búsqueda de texto.
 *  - `recordEconomicEvent()`: registra el evento económico canónico con sus
 *    constraints de unicidad (es la fuente de verdad para reconciliación).
 */
import { Pool } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { config } from "./config";

let pool: Pool | null = null;
function getPool(): Pool {
  const cfg = config();
  const url = cfg.DATABASE_URL;
  if (!url) {
    throw new Error(
      "CRITICAL: DATABASE_URL is missing. Economic events require PostgreSQL persistence.",
    );
  }
  if (!pool) {
    pool = new Pool({ connectionString: url, max: 5 });
    pool.on("error", (err) => {
      console.error("Unexpected error on idle economic-events pool", err);
    });
  }
  return pool;
}

export type WebhookClaimResult =
  | { status: "processed"; id: string }
  | { status: "duplicate"; id: string }
  | { status: "error"; id: string; message: string };

/**
 * Inserta el webhook y detecta duplicados con la UNIQUE constraint.
 * Dos entregas simultáneas del mismo evento → una procesada, una duplicate.
 */
export async function claimWebhookEvent(input: {
  provider: string;
  providerEventId: string;
  eventType: string;
  payloadHash?: string;
}): Promise<WebhookClaimResult> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const payloadHash =
      input.payloadHash ??
      createHash("sha256").update(JSON.stringify({ provider: input.provider, eventId: input.providerEventId })).digest("hex");
    const { rows } = await client.query(
      `INSERT INTO webhook_events (provider, provider_event_id, event_type, payload_hash, status, processed_at, error)
       VALUES ($1, $2, $3, $4, 'processed', NOW(), NULL)
       ON CONFLICT (provider, provider_event_id) DO NOTHING
       RETURNING id, status`,
      [input.provider, input.providerEventId, input.eventType, payloadHash],
    );
    if (rows[0]) {
      // Actualiza el estado si el conflicto no lo hizo (nunca reprocesa).
      await client.query(
        `UPDATE webhook_events SET status = 'processed', processed_at = NOW(), error = NULL
         WHERE id = $1`,
        [rows[0].id],
      );
      await client.query("COMMIT");
      return { status: "processed", id: String(rows[0].id) };
    }
    // Conflicto → duplicado conocido (o en curso). Nunca reprocesar.
    const existing = await client.query(
      "SELECT id, status FROM webhook_events WHERE provider = $1 AND provider_event_id = $2 LIMIT 1",
      [input.provider, input.providerEventId],
    );
    await client.query("COMMIT");
    const id = String(existing.rows[0]?.id ?? "unknown");
    return { status: "duplicate", id };
  } catch (err) {
    await client.query("ROLLBACK");
    const message = err instanceof Error ? err.message : "unknown";
    return { status: "error", id: randomUUID(), message };
  } finally {
    client.release();
  }
}

export type EconomicEventInput = {
  tenantId: string;
  actorId: string;
  eventType: string;
  amountMinor: number | bigint;
  direction: "DEBIT" | "CREDIT";
  source?: string;
  provider?: string;
  providerEventId?: string;
  idempotencyKey?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Registra un evento económico canónico (amount_minor en enteros).
 * Devuelve `duplicate: true` si choca con UNIQUE(provider, provider_event_id)
 * o UNIQUE(tenant_id, idempotency_key).
 */
export async function recordEconomicEvent(
  input: EconomicEventInput,
): Promise<{ ok: boolean; duplicate?: boolean; id?: string; error?: string }> {
  const sum = typeof input.amountMinor === "bigint" ? input.amountMinor : BigInt(Math.round(input.amountMinor));
  try {
    const cfg = config();
    const key =
      input.idempotencyKey ?? input.providerEventId ?? `uuid_${randomUUID()}`;
    const { rows } = await getPool().query(
      `INSERT INTO economic_events
         (tenant_id, actor_id, event_type, currency, amount_minor, direction,
          source, provider, provider_event_id, idempotency_key, correlation_id, metadata)
       VALUES ($1, $2, $3, 'USD', $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
       RETURNING id`,
      [
        input.tenantId,
        input.actorId,
        input.eventType,
        sum.toString(),
        input.direction,
        input.source ?? (cfg.NODE_ENV === "development" ? "dev_internal" : "internal"),
        input.provider ?? null,
        input.providerEventId ?? null,
        key,
        input.correlationId ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    if (rows[0]) {
      return { ok: true, id: String(rows[0].id) };
    }
    return { ok: false, duplicate: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("duplicate") || message.includes("uq_economic")) {
      return { ok: false, duplicate: true };
    }
    return { ok: false, error: message };
  }
}

/** Reconstruye proyecciones económicas desde eventos (para reconciliación). */
export async function sumEconomicBalance(tenantId: string): Promise<bigint> {
  const { rows } = await getPool().query(
    `SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount_minor ELSE -amount_minor END), 0)::text AS balance_minor
     FROM economic_events WHERE tenant_id = $1`,
    [tenantId],
  );
  return BigInt(String(rows[0]?.balance_minor ?? "0"));
}