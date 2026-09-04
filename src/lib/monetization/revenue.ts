import { PLATFORM_FEE_BASIS_POINTS, USER_SCHARE_BASIS_POINTS, type RevenueSplit } from "./types";

/**
 * DESGLOSE DE REPARTO (src/lib/monetization/revenue.ts)
 * -----------------------------------------------------------------
 * Modelo económico de Isabella: el 100% de la monetización que genera
 * un usuario se reparte en 85% para el usuario y 15% para plataforma
 * (soporte de infraestructura). La suscripción activa desbloquea la
 * monetización; no reduce el reparto.
 *
 * La reserva antirreembolso (refundReserve) se retiene temporalmente
 * y se libera al pasar el periodo de maduración.
 */

export interface RevenueComputationInput {
  grossAmountCents: number;
  /** 0..1, qué fracción del total se reserva para reembolsos/contracargos */
  refundReserveRatio?: number;
  /** fracción comunitaria (0..1) para contenidos comunitarios, si aplica */
  communityShareRatio?: number;
}

export function splitRevenue(input: RevenueComputationInput): RevenueSplit {
  const { grossAmountCents } = input;
  if (grossAmountCents < 0) throw new Error("grossAmountCents no puede ser negativo");

  const refundReserveCents = Math.round(grossAmountCents * (input.refundReserveRatio ?? 0));
  const communityShareCents = Math.round(grossAmountCents * (input.communityShareRatio ?? 0));

  // Base tras reservas y comunidad
  const distributable = grossAmountCents - refundReserveCents - communityShareCents;
  if (distributable < 0) throw new Error("Las reservas no pueden exceder el monto bruto");

  const platformFeeCents = Math.round((distributable * PLATFORM_FEE_BASIS_POINTS) / 10_000);
  const netAmountCents = distributable - platformFeeCents;

  return {
    grossAmountCents,
    platformFeeCents,
    refundReserveCents,
    communityShareCents,
    netAmountCents,
  };
}

/** Verifica la invariante de reparto: bruto = plataforma + usuario + reservas + comunidad. */
export function verifyRevenueSplit(split: RevenueSplit): boolean {
  return (
    split.grossAmountCents ===
    split.platformFeeCents +
      split.netAmountCents +
      split.refundReserveCents +
      split.communityShareCents
  );
}

export { PLATFORM_FEE_BASIS_POINTS, USER_SCHARE_BASIS_POINTS };
