/**
 * CACHÉ DE CLAVES JWKS (src/lib/jwks-cache.ts)
 * -----------------------------------------------------------------
 * Obtiene y cachea el conjunto de claves públicas de un emisor OIDC
 * (JWKS) para la verificación RS256 (`jwt-verifier.ts`).
 *
 * Comportamiento:
 *  - Resuelve la clave por `kid` del token.
 *  - Cachea con TTL (por defecto 300 s) para no martillar el emisor.
 *  - Ante un `kid` desconocido fuerza un refresco único y reintenta,
 *    cubriendo rotaciones de claves recientes.
 *  - Falla de forma segura: una red caída devuelve error, nunca una
 *    clave falsificada.
 */

/** Clave JWK tal como la publica un emisor OIDC. */
export interface JwkKey {
  kty: string;
  kid?: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
  x?: string;
  y?: string;
  crv?: string;
  [key: string]: unknown;
}

export interface JwksDocument {
  keys: JwkKey[];
}

export interface JwksCacheOptions {
  /** TTL del caché en ms (default 300 000). */
  ttlMs?: number;
  /** Timeout de red en ms (default 10 000). */
  timeoutMs?: number;
}

interface CachedEntry {
  document: JwksDocument;
  fetchedAt: number;
}

const DEFAULT_TTL_MS = 300_000;
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Caché de JWKS con soporte de refresco. No conserva claves antiguas
 * para reutilizarlas; solo sirve las que publica el emisor.
 */
export class JwksCache {
  private readonly issuer: string;
  private readonly options: Required<JwksCacheOptions>;
  private entry: CachedEntry | undefined;
  private inFlight: Promise<JwksDocument> | undefined;

  constructor(issuer: string, options: JwksCacheOptions = {}) {
    this.issuer = issuer.replace(/\/+$/, "");
    this.options = {
      ttlMs: options.ttlMs ?? DEFAULT_TTL_MS,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
  }

  private get jwksUrl(): string {
    return `${this.issuer}/.well-known/jwks.json`;
  }

  private isFresh(): boolean {
    if (!this.entry) return false;
    return Date.now() - this.entry.fetchedAt < this.options.ttlMs;
  }

  private async fetchDocument(): Promise<JwksDocument> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.doFetch()
      .then((doc) => {
        this.entry = { document: doc, fetchedAt: Date.now() };
        return doc;
      })
      .finally(() => {
        this.inFlight = undefined;
      });
    return this.inFlight;
  }

  private async doFetch(): Promise<JwksDocument> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await fetch(this.jwksUrl, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`JWKS fetch HTTP ${response.status}`);
      }
      const document = (await response.json()) as JwksDocument;
      if (!Array.isArray(document?.keys)) {
        throw new Error("JWKS inválido: falta 'keys'.");
      }
      return document;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Devuelve la clave con el `kid` dado, refrescando si es necesario. */
  async keyByKid(kid: string | undefined): Promise<JwkKey> {
    let document = this.isFresh() ? this.entry!.document : await this.fetchDocument();
    const found = findByKid(document, kid);
    if (found) return found;
    // kid desconocido: fuerza un refresco único (posible rotación).
    document = await this.fetchDocument();
    const retry = findByKid(document, kid);
    if (retry) return retry;
    throw new Error(`No se halló clave JWKS para kid '${kid ?? "(ausente)"}'.`);
  }

  /** Limpia el caché (p. ej. ante un error de verificación). */
  reset(): void {
    this.entry = undefined;
  }

  /** Estado del caché para telemetría (sin claves secretas). */
  status(): { issuer: string; cached: boolean; ageMs: number | null } {
    return {
      issuer: this.issuer,
      cached: this.entry !== undefined,
      ageMs: this.entry ? Date.now() - this.entry.fetchedAt : null,
    };
  }
}

function findByKid(document: JwksDocument, kid: string | undefined): JwkKey | undefined {
  if (kid === undefined || kid === "") {
    // Un único `keys` admite omisión de kid; uso de firma como fallback.
    return document.keys.length === 1 ? document.keys[0] : undefined;
  }
  return document.keys.find((key) => key.kid === kid);
}

/** Utilitario para construir un emisor configurado desde `config()`. */
export function createJwksCache(issuer: string, options?: JwksCacheOptions): JwksCache {
  return new JwksCache(issuer, options);
}

export const JWKS_CACHE = {
  create: createJwksCache,
};
