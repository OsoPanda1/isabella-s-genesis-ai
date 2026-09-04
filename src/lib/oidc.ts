/**
 * PROVEEDOR OIDC (src/lib/oidc.ts)
 * -----------------------------------------------------------------
 * Integración con un proveedor de identidad OIDC (p. ej. Supabase,
 * Google, Auth0) para autenticación delegada.
 *
 * Realiza discovery (RFC 8414) para obtener `jwks_uri` e `issuer`,
 * y expone utilidades para producir tokens de acceso/ID. La
 * verificación de `id_token` se delega en `jwt-verifier.ts` con la
 * clave pública resuelta por `jwks-cache.ts`.
 *
 * No se almacenan secretos; solo endpoints y campos públicos de
 * discovery.
 */

import { createPublicKey } from "node:crypto";
import { JwksCache } from "./jwks-cache";
import { verifyJwt, type JwtClaims, type JwtVerifierOptions } from "./jwt-verifier";

/** Documento de discovery OIDC (RFC 8414). */
export interface OidcDiscoveryDocument {
  issuer: string;
  jwks_uri?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  userinfo_endpoint?: string;
  id_token_signing_alg_values_supported?: string[];
  scopes_supported?: string[];
  [key: string]: unknown;
}

export interface OidcProviderOptions {
  /** Emisor opcional; sobrescribe el del discovery. */
  overrides?: {
    issuer?: string;
    jwksUri?: string;
  };
  /** TTL del caché JWKS en ms. */
  jwksTtlMs?: number;
  /** Timeout de red en ms. */
  timeoutMs?: number;
}

export interface OidcProvider {
  /** Emisor resuelto. */
  readonly issuer: string;
  /** Documento de discovery (público). */
  getDiscovery(): Promise<OidcDiscoveryDocument>;
  /** Caché de claves JWKS del emisor. */
  getJwks(): JwksCache;
  /** Config de verificación para `verifyJwt` (RS256 por discovery). */
  verifierOptions(clientId?: string): JwtVerifierOptions & { oidc: true };
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Crea un proveedor OIDC desde un issuer y un documento de discovery
 * opcional. Si no se provee el documento, fuerza su descarga (única,
 * cacheada) desde `<issuer>/.well-known/openid-configuration`.
 */
export async function createOidcProvider(
  issuer: string,
  discovery?: OidcDiscoveryDocument,
  options: OidcProviderOptions = {},
): Promise<OidcProvider> {
  const baseIssuer = (options.overrides?.issuer ?? issuer).replace(/\/+$/, "");
  const document = discovery ?? (await fetchDocument(baseIssuer, options.timeoutMs));
  const effectiveIssuer = options.overrides?.issuer ?? document.issuer ?? baseIssuer;

  const jwksOptions: { ttlMs?: number; timeoutMs?: number } = {};
  if (options.jwksTtlMs !== undefined) jwksOptions.ttlMs = options.jwksTtlMs;
  if (options.timeoutMs !== undefined) jwksOptions.timeoutMs = options.timeoutMs;
  const jwks = new JwksCache(effectiveIssuer, jwksOptions);

  let cache: OidcDiscoveryDocument = document;
  let discoveryPromise: Promise<OidcDiscoveryDocument> | undefined;

  return {
    get issuer() {
      return effectiveIssuer;
    },
    async getDiscovery(): Promise<OidcDiscoveryDocument> {
      if (cache) return cache;
      if (!discoveryPromise) {
        discoveryPromise = fetchDocument(baseIssuer, options.timeoutMs).then((doc) => {
          cache = doc;
          return doc;
        });
      }
      return discoveryPromise;
    },
    getJwks(): JwksCache {
      return jwks;
    },
    verifierOptions(clientId?: string): JwtVerifierOptions & { oidc: true } {
      const audiences = clientId ? [clientId] : undefined;
      const opts: JwtVerifierOptions = {
        key: "",
        algorithm: "RS256",
        issuer: effectiveIssuer,
        ...(audiences ? { audiences } : {}),
      };
      return { ...opts, oidc: true };
    },
  };
}

async function fetchDocument(issuer: string, timeoutMs?: number): Promise<OidcDiscoveryDocument> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const url = `${issuer}/.well-known/openid-configuration`;
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`OIDC discovery HTTP ${response.status}`);
    }
    const document = (await response.json()) as OidcDiscoveryDocument;
    if (typeof document?.issuer !== "string") {
      throw new Error("OIDC discovery inválido: falta 'issuer'.");
    }
    return document;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verifica un `id_token` contra el proveedor. Resuelve la clave
 * pública por `kid` y valida firma/clams/expiración.
 */
export async function verifyIdToken(
  provider: OidcProvider,
  idToken: string,
  clientId?: string,
): Promise<JwtClaims> {
  const firstSegment = idToken.split(".");
  const headerSegment = firstSegment[0];
  if (!headerSegment) {
    throw new Error("id_token: formato inválido.");
  }
  let kid: string | undefined;
  try {
    const normalized = headerSegment.replace(/-/g, "+").replace(/_/g, "/");
    const header = JSON.parse(Buffer.from(normalized, "base64").toString("utf-8")) as {
      kid?: string;
    };
    kid = header.kid;
  } catch {
    throw new Error("id_token: cabecera no decodificable.");
  }

  const key = await provider.getJwks().keyByKid(kid);
  const opts = provider.verifierOptions(clientId);
  const result = verifyJwt(idToken, { ...opts, key: jwkToPem(key) });
  if (!result.ok) {
    throw new Error(`id_token inválido: ${result.reason}`);
  }
  return result.payload;
}

/** Convierte un JWK RSA público a formato PEM/SPKI para `createPublicKey`. */
export function jwkToPem(jwk: { kty: string; n?: string; e?: string }): string {
  if (jwk.kty !== "RSA" || !jwk.n || !jwk.e) {
    throw new Error("Solo se admite conversión de JWK RSA.");
  }
  const key = createPublicKey({
    key: { kty: "RSA", n: jwk.n, e: jwk.e },
    format: "jwk",
  }) as KeyExporter;
  return key.export({ format: "pem", type: "spki" });
}

interface KeyExporter {
  export(parameters: { format: "pem"; type: "spki" }): string;
}

export const OIDC = {
  createProvider: createOidcProvider,
  verifyIdToken,
  jwkToPem,
};
