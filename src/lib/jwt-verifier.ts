/**
 * VERIFICADOR / EMISOR JWT (src/lib/jwt-verifier.ts)
 * -----------------------------------------------------------------
 * Verificación criptográfica independiente de tokens JWT (RFC 7519)
 * con soporte HS256 (HMAC-SHA256, clave secreta compartida) y RS256
 * (RSA-SHA256, clave pública — p. ej. de un JWKS OIDC). Incluye un
 * emisor HS256 para expedición operativa de tokens de sesión.
 *
 * Objetivos de seguridad:
 *  - Nunca confía en el payload hasta verificar la firma.
 *  - Validación estricta de algoritmo (rechaza `alg: none`).
 *  - Expiración y "not-before" con tolerancia de reloj configurable.
 *  - Issuer y audience verificables.
 *
 * Uso real: ninguna llave/secret se lee de `process.env` aquí; el
 * llamador inyecta las claves resueltas por `config()`/`jwks-cache`.
 */

import { createHmac, createPublicKey, verify, timingSafeEqual } from "node:crypto";

/** Algoritmos admitidos. */
export type JwtAlgorithm = "HS256" | "RS256";

export interface JwtVerifierOptions {
  /** Clave simétrica (HMAC) o PEM/SPKI pública (RSA). */
  key: string;
  algorithm: JwtAlgorithm;
  /** Tenant/servidor emisor esperado. */
  issuer?: string;
  /** Públicos permitidos (aud). */
  audiences?: readonly string[];
  /** Tolerancia de reloj en segundos (default 30). */
  clockToleranceSeconds?: number;
}

export interface JwtHeader {
  alg: string;
  typ?: string;
  kid?: string;
}

export interface JwtClaims {
  sub: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  iss?: string;
  aud?: string | string[];
  [claim: string]: unknown;
}

export type JwtVerifyResult =
  { ok: true; payload: JwtClaims; header: Partial<JwtHeader> } | { ok: false; reason: string };

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const CLOCK_TOLERANCE_DEFAULT = 30;

function base64UrlEncode(data: Buffer): string {
  return data.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(segment: string): string {
  if (!BASE64URL.test(segment)) {
    throw new Error("Segmento JWT no es base64url válido");
  }
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64").toString("utf-8");
}

function jsonParse<T>(segment: string): T {
  return JSON.parse(base64UrlDecode(segment)) as T;
}

/** Decodifica la cabecera; devuelve una cabecera vacía si no es válida. */
function decodeOptionalHeader(segment: string): Partial<JwtHeader> {
  try {
    return jsonParse<JwtHeader>(segment);
  } catch {
    return {};
  }
}

/** Decodifica un segmento base64url a Buffer sin lanzar por padding. */
function base64UrlDecodeToBuffer(segment: string): Buffer {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64");
}

function createHmacSig(data: string, secret: string): Buffer {
  return createHmac("sha256", Buffer.from(secret, "utf-8")).update(data).digest();
}

/**
 * Emite un token JWT firmado con HS256. `extra` permite claims
 * adicionales sin secretos. Devuelve el token codificado.
 */
export function signJwtHs256(
  payload: JwtClaims,
  secret: string,
  options: { algorithm?: "HS256"; header?: Partial<JwtHeader> } = {},
): string {
  const header: JwtHeader = { alg: "HS256", typ: "JWT", ...options.header };
  const headerB64 = base64UrlEncode(Buffer.from(JSON.stringify(header), "utf-8"));
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf-8"));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = base64UrlEncode(createHmacSig(signingInput, secret));
  return `${signingInput}.${signature}`;
}

/**
 * Verifica criptográficamente un token JWT contra una clave.
 * Devuelve resultado estructurado; nunca lanza por token inválido.
 */
export function verifyJwt(token: string, options: JwtVerifierOptions): JwtVerifyResult {
  if (!token || typeof token !== "string") {
    return { ok: false, reason: "Token ausente." };
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, reason: "Formato JWT inválido (se esperan 3 segmentos)." };
  }
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];
  const header = decodeOptionalHeader(headerB64);

  let payload: JwtClaims;
  try {
    payload = jsonParse<JwtClaims>(payloadB64);
  } catch {
    return { ok: false, reason: "Payload JWT no decodificable." };
  }

  if (!header.alg || header.alg === "none") {
    return { ok: false, reason: "Algoritmo 'none' no admitido (fail-closed)." };
  }
  if (header.alg !== options.algorithm) {
    return { ok: false, reason: `Algoritmo '${header.alg}' no coincide con el esperado.` };
  }

  const tolerance = options.clockToleranceSeconds ?? CLOCK_TOLERANCE_DEFAULT;
  const now = Math.floor(Date.now() / 1000);

  if (typeof payload.exp === "number" && now > payload.exp + tolerance) {
    return { ok: false, reason: "Token expirado." };
  }
  if (typeof payload.nbf === "number" && now < payload.nbf - tolerance) {
    return { ok: false, reason: "Token aún no válido (nbf)." };
  }
  if (options.issuer !== undefined && payload.iss !== options.issuer) {
    return { ok: false, reason: "Issuer no coincide." };
  }
  if (options.audiences !== undefined && options.audiences.length > 0) {
    const aud = payload.aud;
    const match = Array.isArray(aud)
      ? aud.some((a) => options.audiences!.includes(a))
      : options.audiences.includes(String(aud));
    if (!match) {
      return { ok: false, reason: "Audience no admitida." };
    }
  }

  if (!payload.sub || typeof payload.sub !== "string") {
    return { ok: false, reason: "Falta el claim 'sub'." };
  }

  const signingInput = `${headerB64}.${payloadB64}`;
  let signature: Buffer;
  try {
    signature = base64UrlDecodeToBuffer(signatureB64);
  } catch {
    return { ok: false, reason: "Firma JWT no decodificable." };
  }

  let valid = false;
  try {
    valid =
      header.alg === "HS256"
        ? verifyHmac(signingInput, signature, options.key)
        : verifyRsa(signingInput, signature, options.key);
  } catch {
    return { ok: false, reason: "Fallo en la verificación criptográfica." };
  }

  if (!valid) {
    return { ok: false, reason: "Firma JWT inválida." };
  }
  return { ok: true, payload, header };
}

function verifyHmac(data: string, signature: Buffer, secret: string): boolean {
  const expected = createHmacSig(data, secret);
  return signature.length === expected.length && timingSafeEqual(signature, expected);
}

function verifyRsa(data: string, signature: Buffer, publicKeyPem: string): boolean {
  const key = createPublicKey(publicKeyPem);
  return verify(
    "sha256",
    Buffer.from(data, "utf-8"),
    key as ReturnType<typeof createPublicKey>,
    signature,
  );
}

export const JWT_VERIFIER = {
  verify: verifyJwt,
  signHs256: signJwtHs256,
};
