import { envSchema, requiredEnvKeys, type Env, type RuntimeMode } from "./env-schema";

/**
 * CONFIGURACIÓN TIPADA (src/lib/config.ts)
 * -----------------------------------------------------------------
 * Única vía de acceso a la configuración del sistema. Nunca leas
 * `process.env` directamente desde otro módulo.
 *
 * Carga y valida el entorno contra `envSchema` (Zod) una sola vez.
 * Si faltan variables obligatorias según el modo de ejecución, el
 * arranque se aborta (ver runtime-integrity).
 */

type RawEnv = NodeJS.ProcessEnv;

let cached: Env | undefined;
let loadError: string | null = null;

function resolveEnv(source: RawEnv): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuración de entorno inválida: ${issues}`);
  }
  return parsed.data;
}

function assertRequired(mode: RuntimeMode, source: RawEnv): void {
  const required = requiredEnvKeys(mode);
  for (const key of required) {
    const raw = source[key];
    if (raw === undefined || raw === null || raw === "") {
      throw new Error(
        `Variable de entorno obligatoria no definida en modo "${mode}": ${String(key)}`,
      );
    }
  }
}

export function loadConfig(source: RawEnv = process.env): Env {
  if (cached) return cached;

  const parsed = resolveEnv(source);
  const mode: RuntimeMode = parsed.ISABELLA_RUNTIME_MODE;

  try {
    assertRequired(mode, source);
    if (mode === "production" || mode === "staging") {
      if (parsed.DURABLE_JSON_ALLOWED) {
        throw new Error("DURABLE_JSON_ALLOWED debe ser false en modos no locales");
      }
      if (parsed.AUTH_DEV_SESSION_ENABLED || parsed.ALLOW_GUEST_CHAT) {
        throw new Error("AUTH_DEV_SESSION_ENABLED y ALLOW_GUEST_CHAT deben estar desactivados");
      }
      if (!parsed.DATABASE_URL && !(parsed.SUPABASE_URL && parsed.AUTH_JWT_SECRET)) {
        throw new Error("Se requiere autoridad durable: DATABASE_URL o Supabase con AUTH_JWT_SECRET");
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    loadError = msg;
    // Fail-Fast: Throw immediately for staging/production mode to prevent unconfigured or degraded starts
    if (mode === "production" || mode === "staging") {
      throw new Error(`[SovereignConfig Fail-Fast] ${msg}`);
    }
  }

  cached = parsed;
  return parsed;
}

/** Devuelve el error de validación de configuración (si lo hubo). */
export function getConfigLoadError(): string | null {
  return loadError;
}

/** Reinicia la caché (usado en tests). */
export function resetConfigCache(): void {
  cached = undefined;
  loadError = null;
}

/** Config validada; lanza si no se ha cargado aún. */
export function config(): Env {
  if (!cached) {
    return loadConfig();
  }
  return cached;
}

export type { Env, RuntimeMode } from "./env-schema";
