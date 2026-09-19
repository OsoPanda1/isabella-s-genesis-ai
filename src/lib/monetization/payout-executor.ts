/**
 * PAYOUT EXECUTOR (src/lib/monetization/payout-executor.ts)
 * -----------------------------------------------------------------
 * Ejecución REAL de payouts vía Stripe Transfers (a cuentas conectadas),
 * siempre detrás del payout guard (fraud-review):
 *
 *   - Idempotency-Key de Stripe = idempotencyKey del caso (reintentos seguros).
 *   - Monto en centavos enteros, positivo, con tope operativo.
 *   - Nunca ejecuta sin guard aprobado (el llamador verifica primero).
 *   - Cliente Stripe inyectable (tests deterministas sin red).
 */

import Stripe from "stripe";
import { config } from "../config";

export const PAYOUT_MAX_CENTS = 1_000_000;

export interface PayoutExecution {
  payoutId: string;
  status: "scheduled" | "paid";
  amountCents: number;
  destination: string;
  idempotencyKey: string;
}

export interface StripeLike {
  transfers: {
    create(
      params: Record<string, unknown>,
      opts?: { idempotencyKey?: string },
    ): Promise<{ id: string; amount: number; destination: unknown }>;
  };
}

// One Stripe client per process (re-created only if the key rotates).
let cachedStripe: StripeLike | undefined;
let cachedStripeKey: string | undefined;

function defaultClient(): StripeLike {
  const key = config().STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Payout denegado: STRIPE_SECRET_KEY ausente (fail-closed).");
  }
  if (!cachedStripe || cachedStripeKey !== key) {
    cachedStripe = new Stripe(key, { apiVersion: "2022-11-15" as never }) as unknown as StripeLike;
    cachedStripeKey = key;
  }
  return cachedStripe;
}

/**
 * Ejecuta el payout. Lanza ante cualquier condición insegura; jamás
 * inventa un payoutId (el id retornado es el de Stripe).
 */
export async function executePayout(
  input: {
    amountCents: number;
    destinationAccountId: string;
    idempotencyKey: string;
    metadata?: Record<string, string>;
  },
  client?: StripeLike,
): Promise<PayoutExecution> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("Monto inválido: entero positivo en centavos.");
  }
  if (input.amountCents > PAYOUT_MAX_CENTS) {
    throw new Error(`Monto excede el tope operativo (${PAYOUT_MAX_CENTS}¢).`);
  }
  if (!/^acct_[A-Za-z0-9]+$/.test(input.destinationAccountId)) {
    throw new Error("Cuenta destino inválida (formato acct_*).");
  }
  if (!input.idempotencyKey || input.idempotencyKey.length < 8) {
    throw new Error("IdempotencyKey requerido (mínimo 8 caracteres).");
  }
  const stripe = client ?? defaultClient();
  const transfer = await stripe.transfers.create(
    {
      amount: input.amountCents,
      currency: "usd",
      destination: input.destinationAccountId,
      metadata: input.metadata ?? {},
    },
    { idempotencyKey: input.idempotencyKey },
  );
  return {
    payoutId: transfer.id,
    status: "scheduled",
    amountCents: transfer.amount,
    destination: String(transfer.destination),
    idempotencyKey: input.idempotencyKey,
  };
}

export const PAYOUT_EXECUTOR = {
  execute: executePayout,
  maxCents: PAYOUT_MAX_CENTS,
};
