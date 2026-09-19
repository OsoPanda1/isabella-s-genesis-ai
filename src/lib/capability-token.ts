import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";

export interface CapabilityTokenClaims {
  jti: string;
  tool: string;
  actorId: string;
  tenantId: string;
  expiresAt: number;
  nonce: string;
}

const MAX_TTL_MS = 5 * 60_000;
const consumed = new Map<string, number>();

function secret(): string {
  const value = config().ENCRYPTION_MASTER_KEY ?? config().AUTH_JWT_SECRET;
  if (!value || value.length < 32) throw new Error("capability_token_secret_unavailable");
  return value;
}
function mac(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}
function cleanup(now: number): void {
  for (const [jti, expiresAt] of consumed) if (expiresAt <= now) consumed.delete(jti);
}

export function issueCapabilityToken(
  input: Omit<CapabilityTokenClaims, "jti" | "nonce" | "expiresAt"> & {
    ttlMs?: number;
  },
): string {
  const now = Date.now();
  const ttl = Math.min(Math.max(input.ttlMs ?? 60_000, 1_000), MAX_TTL_MS);
  const claims: CapabilityTokenClaims = {
    tool: input.tool,
    actorId: input.actorId,
    tenantId: input.tenantId,
    expiresAt: now + ttl,
    jti: randomBytes(18).toString("base64url"),
    nonce: randomBytes(18).toString("base64url"),
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${payload}.${mac(payload)}`;
}

export function consumeCapabilityToken(
  token: string,
  expected: { tool: string; actorId: string; tenantId: string },
): CapabilityTokenClaims {
  cleanup(Date.now());
  const [payload, signature] = token.split(".");
  if (!payload || !signature) throw new Error("capability_token_invalid");
  const expectedSignature = mac(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("capability_token_invalid");
  let claims: CapabilityTokenClaims;
  try {
    claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as CapabilityTokenClaims;
  } catch {
    throw new Error("capability_token_invalid");
  }
  if (
    !claims.jti ||
    !claims.nonce ||
    claims.tool !== expected.tool ||
    claims.actorId !== expected.actorId ||
    claims.tenantId !== expected.tenantId
  )
    throw new Error("capability_token_scope_mismatch");
  if (!Number.isFinite(claims.expiresAt) || claims.expiresAt <= Date.now())
    throw new Error("capability_token_expired");
  if (consumed.has(claims.jti)) throw new Error("capability_token_replayed");
  consumed.set(claims.jti, claims.expiresAt);
  return claims;
}
