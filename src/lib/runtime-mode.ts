import { runtimeModeSchema, type RuntimeMode } from "./env-schema";

/**
 * MODO DE EJECUCIÓN (src/lib/runtime-mode.ts)
 * -----------------------------------------------------------------
 * Modos: development | staging | production | emergency | maintenance.
 * Determina exigencias de configuración, comportamiento de políticas
 * y capacidades disponibles.
 */

export type { RuntimeMode } from "./env-schema";

export const RUNTIME_MODES: readonly RuntimeMode[] = [
  "development",
  "staging",
  "production",
  "emergency",
  "maintenance",
];

export function isRuntimeMode(value: unknown): value is RuntimeMode {
  return runtimeModeSchema.safeParse(value).success;
}

/**
 * Normaliza un valor de entorno a un RuntimeMode conocido,
 * fallback por defecto a "development".
 */
export function resolveRuntimeMode(value: string | undefined): RuntimeMode {
  if (!value) return "development";
  const parsed = runtimeModeSchema.safeParse(value);
  return parsed.success ? parsed.data : "development";
}

/** Indica si el modo impone un uso conservador (sin herramientas nuevas). */
export function isLockedDown(mode: RuntimeMode): boolean {
  return mode === "emergency" || mode === "maintenance";
}

/** Indica si el modo es de producción/staging (exige infraestructura real). */
export function isProductionLike(mode: RuntimeMode): boolean {
  return mode === "production" || mode === "staging";
}
