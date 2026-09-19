import { config, getConfigLoadError, resetConfigCache } from "./config";
import { buildManifest } from "./build-manifest";
import { capabilityRegistry } from "./capability-registry";
import { evaluateProductionAuthorities } from "./production-authority";

/**
 * INTEGRIDAD DEL RUNTIME
 * -----------------------------------------------------------------
 * Verifica versión/schema/config y el registro de capacidades ANTES
 * de arrancar. Aborta (o degrada a modo conservador) si la
 * configuración es inválida o faltan dependencias obligatorias.
 */

export type IntegrityStatus = "ok" | "degraded" | "failed";

export interface IntegrityResult {
  status: IntegrityStatus;
  mode: string;
  configError: string | null;
  manifestValid: boolean;
  requiredCapabilities: Record<string, string>;
  checkedAt: string;
}

export function verifyRuntimeIntegrity(options?: {
  strict?: boolean;
  reloadConfig?: boolean;
}): IntegrityResult {
  const strict = options?.strict ?? false;
  try {
    if (options?.reloadConfig) resetConfigCache();
    config();
  } catch {
    return {
      status: "failed",
      mode: "unknown",
      configError: getConfigLoadError() ?? "Configuración de runtime inválida.",
      manifestValid: false,
      requiredCapabilities: {},
      checkedAt: new Date().toISOString(),
    };
  }

  const cfg = config();
  const configError = getConfigLoadError();
  const mode = cfg.ISABELLA_RUNTIME_MODE;

  let status: IntegrityStatus = configError ? "failed" : "ok";

  const required = ["auth", "tenancy", "audit", "memory", "bookpi", "crown"];
  const requiredCapabilities: Record<string, string> = {};
  for (const cap of required) {
    const state = capabilityRegistry.stateOf(cap);
    requiredCapabilities[cap] = state;
    if (strict && !capabilityRegistry.isOperational(cap)) {
      status = status === "failed" ? "failed" : "degraded";
    }
  }

  const manifest = buildManifest("server");
  const manifestValid = manifest.sourceHash.length === 64;
  if (!manifestValid) status = "failed";

  try {
    const authorities = evaluateProductionAuthorities();
    if (authorities.criticalFailed) {
      status = status === "failed" ? "failed" : "degraded";
    }
  } catch {
    status = status === "failed" ? "failed" : "degraded";
  }

  return {
    status,
    mode,
    configError,
    manifestValid,
    requiredCapabilities,
    checkedAt: new Date().toISOString(),
  };
}

export function ensureRuntimeReady(strict = false): IntegrityResult {
  const result = verifyRuntimeIntegrity({ strict });
  if (result.status === "failed" && strict) {
    throw new Error(`Runtime no listo: ${result.configError ?? "capacidades faltantes"}`);
  }
  return result;
}
