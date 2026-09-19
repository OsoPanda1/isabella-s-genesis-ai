/** Economic events — PostgreSQL economic authority and Stripe payment binding. */
import { Pool } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { config } from "./config";
import Stripe from "stripe";

let pool: Pool | null = null;
let poolUrl: string | null = null;
function getPool(): Pool {
  const cfg = config();
  const url = cfg.DATABASE_URL;
  if (!url)
    throw new Error(
      "CRITICAL: DATABASE_URL is missing. Economic events require PostgreSQL persistence.",
    );
  if (!pool || poolUrl !== url) {
    if (pool) void pool.end().catch(() => undefined);
    pool = new Pool({
      connectionString: url,
      max: 5,
      connectionTimeoutMillis: 10000,
      statement_timeout: 15000,
    });
    poolUrl = url;
    pool.on("error", (err) => console.error("Unexpected error on idle economic-events pool", err));
  }
  return pool;
}

export type WebhookClaimResult =
  | { status: "processed"; id: string }
  | { status: "duplicate"; id: string }
  | { status: "error"; id: string; message: string };

export async function claimWebhookEvent(input: {
  provider: string;
  providerEventId: string;
  eventType: string;
  payloadHash?: string;
}): Promise<WebhookClaimResult> {
  let client;
  try {
    client = await getPool().connect();
  } catch (err) {
    return {
      status: "error",
      id: randomUUID(),
      message: err instanceof Error ? err.message : "unknown",
    };
  }
  try {
    await client.query("BEGIN");
    const payloadHash =
      input.payloadHash ??
      createHash("sha256")
        .update(JSON.stringify({ provider: input.provider, eventId: input.providerEventId }))
        .digest("hex");
    const { rows } = await client.query(
      `INSERT INTO webhook_events (provider, provider_event_id, event_type, payload_hash, status, processed_at, error)
       VALUES ($1,$2,$3,$4,'processed',NOW(),NULL)
       ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id`,
      [input.provider, input.providerEventId, input.eventType, payloadHash],
    );
    if (rows[0]) {
      await client.query("COMMIT");
      return { status: "processed", id: String(rows[0].id) };
    }
    const existing = await client.query(
      "SELECT id FROM webhook_events WHERE provider=$1 AND provider_event_id=$2 LIMIT 1",
      [input.provider, input.providerEventId],
    );
    await client.query("COMMIT");
    return { status: "duplicate", id: String(existing.rows[0]?.id ?? "unknown") };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    return {
      status: "error",
      id: randomUUID(),
      message: err instanceof Error ? err.message : "unknown",
    };
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

export function validateQuotaTopupMetadata(
  paymentIntent: {
    status?: string;
    currency?: string;
    amount?: number;
    metadata?: Record<string, string>;
  },
  tenantId: string,
  userId: string,
  amountMinor: number | bigint,
): { ok: true } | { ok: false; error: string } {
  if (paymentIntent.status !== "succeeded")
    return { ok: false, error: "PaymentIntent is not succeeded." };
  if ((paymentIntent.currency ?? "").toLowerCase() !== "usd")
    return { ok: false, error: "Unsupported PaymentIntent currency." };
  if (BigInt(paymentIntent.amount ?? -1) !== BigInt(amountMinor))
    return { ok: false, error: "PaymentIntent amount mismatch." };
  if (paymentIntent.metadata?.purpose !== "quota_topup")
    return { ok: false, error: "PaymentIntent purpose mismatch." };
  if (paymentIntent.metadata?.tenantId !== tenantId)
    return { ok: false, error: "PaymentIntent tenant binding mismatch." };
  if (paymentIntent.metadata?.userId !== userId)
    return { ok: false, error: "PaymentIntent user binding mismatch." };
  return { ok: true };
}

async function verifyQuotaTopupBinding(
  input: EconomicEventInput,
  amountMinor: bigint,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.eventType !== "QUOTA_TOPUP") return { ok: true };
  if (input.provider !== "stripe" || !input.providerEventId)
    return { ok: false, error: "QUOTA_TOPUP requires a Stripe PaymentIntent." };
  const cfg = config();
  if (!cfg.STRIPE_SECRET_KEY) return { ok: false, error: "Stripe configuration unavailable." };
  const stripe = new Stripe(cfg.STRIPE_SECRET_KEY, {
    apiVersion: "2022-11-15" as Stripe.LatestApiVersion,
  });
  const paymentIntent = await stripe.paymentIntents.retrieve(input.providerEventId);
  const metadataCheck = validateQuotaTopupMetadata(
    paymentIntent,
    input.tenantId,
    input.actorId,
    amountMinor,
  );
  if (!metadataCheck.ok) return metadataCheck;

  const { rows } = await getPool().query(
    `SELECT tenant_id,user_id,purpose,currency,amount_minor,consumed_at
       FROM billing_payment_intents WHERE stripe_payment_intent_id=$1 LIMIT 1`,
    [input.providerEventId],
  );
  const binding = rows[0];
  if (!binding) return { ok: false, error: "PaymentIntent has no durable server binding." };
  if (String(binding.tenant_id) !== input.tenantId || String(binding.user_id) !== input.actorId)
    return { ok: false, error: "Durable PaymentIntent ownership mismatch." };
  if (String(binding.purpose) !== "quota_topup" || String(binding.currency).toLowerCase() !== "usd")
    return { ok: false, error: "Durable PaymentIntent purpose/currency mismatch." };
  if (BigInt(binding.amount_minor) !== amountMinor)
    return { ok: false, error: "Durable PaymentIntent amount mismatch." };
  if (binding.consumed_at) return { ok: false, error: "PaymentIntent already consumed." };
  return { ok: true };
}

export async function recordEconomicEvent(
  input: EconomicEventInput,
): Promise<{ ok: boolean; duplicate?: boolean; id?: string; error?: string }> {
  const sum =
    typeof input.amountMinor === "bigint"
      ? input.amountMinor
      : BigInt(Math.round(input.amountMinor));
  try {
    const cfg = config();
    if (input.direction === "CREDIT" && input.eventType === "QUOTA_TOPUP") {
      const binding = await verifyQuotaTopupBinding(input, sum);
      if (!binding.ok) return { ok: false, error: binding.error };
    }
    const key = input.idempotencyKey ?? input.providerEventId ?? `uuid_${randomUUID()}`;
    const { rows } = await getPool().query(
      `INSERT INTO economic_events
       (tenant_id,actor_id,event_type,currency,amount_minor,direction,source,provider,provider_event_id,idempotency_key,correlation_id,metadata)
       VALUES ($1,$2,$3,'USD',$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (tenant_id,idempotency_key) DO NOTHING RETURNING id`,
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
    if (rows[0]) return { ok: true, id: String(rows[0].id) };
    return { ok: false, duplicate: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("duplicate") || message.includes("uq_economic"))
      return { ok: false, duplicate: true };
    return { ok: false, error: message };
  }
}

export async function sumEconomicBalance(tenantId: string): Promise<bigint> {
  const { rows } = await getPool().query(
    `SELECT COALESCE(SUM(CASE WHEN direction='CREDIT' THEN amount_minor ELSE -amount_minor END),0)::text AS balance_minor FROM economic_events WHERE tenant_id=$1`,
    [tenantId],
  );
  return BigInt(String(rows[0]?.balance_minor ?? "0"));
}
