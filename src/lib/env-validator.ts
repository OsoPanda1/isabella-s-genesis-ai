/**
 * @file env-validator.ts
 * @description Validador de arranque de variables de entorno críticas según .env.example
 * Autoría: Edwin Oswaldo Castillo Trejo (Anubis Villaseñor)
 * Ecosistema: TAMV ONLINE NETWORK / Nodo Cero (Real del Monte, Hidalgo, México)
 */

import { config } from "./config";
import { ENV_VAR_CATALOG, type RuntimeMode } from "./env-schema";

export interface EnvValidationResult {
  valid: boolean;
  mode: RuntimeMode;
  criticalMissing: string[];
  invalidFormat: Array<{ key: string; error: string }>;
  warnings: string[];
  timestamp: string;
}

export function validateStartupEnvironment(): EnvValidationResult {
  let cfg;
  try {
    cfg = config();
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      mode: "development",
      criticalMissing: [errorMsg],
      invalidFormat: [],
      warnings: [],
      timestamp: new Date().toISOString(),
    };
  }

  const mode = cfg.ISABELLA_RUNTIME_MODE as RuntimeMode;
  const criticalMissing: string[] = [];
  const invalidFormat: Array<{ key: string; error: string }> = [];
  const warnings: string[] = [];

  for (const descriptor of ENV_VAR_CATALOG) {
    const value = cfg[descriptor.name];
    const isRequired = descriptor.required.includes(mode);

    if (isRequired && (value === undefined || value === null || value === "")) {
      criticalMissing.push(String(descriptor.name));
      continue;
    }

    // Comprobaciones de formato
    if (value !== undefined && value !== null && value !== "") {
      const strVal = String(value);

      // Verificación de URLs
      if (
        descriptor.name === "PUBLIC_URL" ||
        descriptor.name === "DATABASE_URL" ||
        descriptor.name === "OTEL_EXPORTER_OTLP_ENDPOINT"
      ) {
        try {
          const u = new URL(strVal);
          if (!["http:", "https:", "postgres:", "postgresql:"].includes(u.protocol)) {
            invalidFormat.push({
              key: String(descriptor.name),
              error: "Protocolo URL no soportado",
            });
          }
        } catch {
          invalidFormat.push({
            key: String(descriptor.name),
            error: "Sintaxis de URL inválida",
          });
        }
      }

      // Verificación de longitudes criptográficas mínimas
      if (descriptor.name === "AUTH_JWT_SECRET" && strVal.length < 16) {
        invalidFormat.push({
          key: "AUTH_JWT_SECRET",
          error: "Longitud insuficiente (< 16 caracteres)",
        });
      }
      if (
        (descriptor.name === "ENCRYPTION_MASTER_KEY" ||
          descriptor.name === "BOOKPI_SIGNING_KEY" ||
          descriptor.name === "AEGIS_AUDIT_SECRET") &&
        strVal.length < 32
      ) {
        invalidFormat.push({
          key: String(descriptor.name),
          error: "Longitud criptográfica insuficiente (< 32 caracteres)",
        });
      }
    }
  }

  const isProdLike = mode === "production" || mode === "staging";
  const valid = isProdLike ? criticalMissing.length === 0 && invalidFormat.length === 0 : true;

  return {
    valid,
    mode,
    criticalMissing,
    invalidFormat,
    warnings,
    timestamp: new Date().toISOString(),
  };
}
