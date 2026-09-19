import { runtimeModeSchema, type RuntimeMode } from "./env-schema";

/**
 * MODO DE EJECUCIÓN
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
 * Resuelve el modo de runtime.
 * Undefined conserva el default local; un valor explícitamente inválido
 * nunca se transforma silenciosamente en development, porque eso sería
 * un fail-open de seguridad.
 */
export function resolveRuntimeMode(value: string | undefined): RuntimeMode {
  if (value === undefined || value.trim() === "") return "development";
  const parsed = runtimeModeSchema.safeParse(value.trim());
  if (!parsed.success) {
    throw new Error(`Invalid ISABELLA_RUNTIME_MODE: ${JSON.stringify(value)}`);
  }
  return parsed.data;
}

export function isLockedDown(mode: RuntimeMode): boolean {
  return mode === "emergency" || mode === "maintenance";
}

export function isProductionLike(mode: RuntimeMode): boolean {
  return mode === "production" || mode === "staging";
}
