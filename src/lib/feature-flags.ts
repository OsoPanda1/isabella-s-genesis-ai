import { config } from "./config";

/**
 * FEATURE FLAGS (src/lib/feature-flags.ts)
 * -----------------------------------------------------------------
 * Flags seguros para capacidades experimentales. Un flag es:
 *   - server-curated (nunca definido por el cliente),
 *   - versionable,
 *   - con default fail-closed (apagado) salvo override explícito.
 */

export type FlagValue = boolean | string | number;

export interface FlagDefinition<T extends FlagValue = boolean> {
  key: string;
  default: T;
  description?: string;
  /** si true, requiere override explícito; de lo contrario se ignora. */
  requiresExplicitEnable: boolean;
}

const FLAGS = {
  "experimental.tools": {
    key: "experimental.tools",
    default: false,
    description: "Habilita ejecución de herramientas ORION.",
    requiresExplicitEnable: true,
  },
  "experimental.sandbox": {
    key: "experimental.sandbox",
    default: false,
    description: "Habilita el runtime de sandbox real (no el stub simulado).",
    requiresExplicitEnable: true,
  },
  "experimental.pqc": {
    key: "experimental.pqc",
    default: false,
    description: "Habilita firma post-cuántica si hay implementación real integrada.",
    requiresExplicitEnable: true,
  },
  "audit.record": {
    key: "audit.record",
    default: true,
    description: "Registra eventos de auditoría por operación.",
    requiresExplicitEnable: false,
  },
  "monetization.enabled": {
    key: "monetization.enabled",
    default: true,
    description: "Habilita los programas de monetización para usuarios elegibles.",
    requiresExplicitEnable: false,
  },
} satisfies Record<string, FlagDefinition>;

export type FlagKey = keyof typeof FLAGS;

export interface FeatureFlagService {
  isEnabled(key: FlagKey): boolean;
  get(key: FlagKey): FlagValue;
  all(): Record<string, FlagValue>;
}

const FILE_OVERRIDE_KEY = "ISABELLA_FEATURE_FLAGS";

function parseOverrides(): Record<string, string> {
  const raw = process.env[FILE_OVERRIDE_KEY];
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const part of raw.split(",")) {
    const [key, value] = part.split("=").map((s) => s.trim());
    if (key) out[key] = value ?? "true";
  }
  return out;
}

export function createFeatureFlagsService(
  overrides: Record<string, string> = parseOverrides(),
): FeatureFlagService {
  const cfg = config();
  const na = cfg.NODE_ENV === "production" ? parseOverrides() : overrides;

  function resolve(key: FlagKey): FlagValue {
    const def = FLAGS[key];
    const value = na[key];
    if (value === undefined) return def.default;

    // Si el flag requiere enable explícito y el override es "false", respeta el false.
    // Si requiere enable explícito y no está en overrides, queda apagado por defecto.
    if (def.requiresExplicitEnable && value === "true") return true;
    if (def.default === true && value === "false") return false;

    const base: FlagValue = def.default;
    if (typeof base === "boolean") return value === "true";
    if (typeof base === "number") {
      const n = Number(value);
      return Number.isNaN(n) ? base : n;
    }
    return value;
  }

  return {
    isEnabled(key) {
      return resolve(key) === true;
    },
    get(key) {
      return resolve(key);
    },
    all() {
      const out: Record<string, FlagValue> = {};
      for (const key of Object.keys(FLAGS) as FlagKey[]) {
        out[key] = resolve(key);
      }
      return out;
    },
  };
}

export const featureFlags: FeatureFlagService = createFeatureFlagsService();
