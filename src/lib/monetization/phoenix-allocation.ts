export interface PhoenixAllocation {
  netProfitCents: number;
  phoenixFundCents: number;
  infrastructureCents: number;
  creatorPartnersCents: number;
}

export function calculatePhoenixAllocation(netProfitCents: number): PhoenixAllocation {
  if (!Number.isSafeInteger(netProfitCents) || netProfitCents < 0)
    throw new Error("netProfitCents must be a non-negative safe integer");
  const phoenixFundCents = Math.floor(netProfitCents / 5);
  const infrastructureCents =
    Math.floor(netProfitCents / 10) * 3 + Math.floor(((netProfitCents % 10) * 3) / 10);
  const creatorPartnersCents = netProfitCents - phoenixFundCents - infrastructureCents;
  return {
    netProfitCents,
    phoenixFundCents,
    infrastructureCents,
    creatorPartnersCents,
  };
}
