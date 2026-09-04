import { config } from "./config";
import { secrets } from "./secrets";

/**
 * REDACTOR DE SECRETOS (src/lib/secret-redactor.ts)
 * -----------------------------------------------------------------
 * Elimina tokens y secretos de los logs de forma determinista.
 * Todo log que pueda incluir entrada de usuario o errores debe pasar
 * por `redact()` antes de escribirse.
 */

const BUILTIN_KEYS = [
  "GEMINI_API_KEY",
  "AUTH_JWT_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_JWT_SECRET",
  "ENCRYPTION_MASTER_KEY",
  "BOOKPI_SIGNING_KEY",
  "CROWN_POLICY_SIGNING_KEY",
];

export interface Redactor {
  redact(input: string): string;
  redactObject(input: unknown): unknown;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Regex de patrones de credenciales en texto: claves, tokens, bearer,
 * secretos y strings largos tras "=" en contextos sensibles.
 */
function buildSecretPatterns(values: string[]): RegExp {
  const seeded = values.filter((v) => v && v.length >= 8).map(escapeRegExp);
  const literals = seeded.join("|");

  const generic =
    /(\b(?:api[_-]?key|secret|token|password|passwd|auth|bearer|authorization)\b\s*[:=]\s*["']?)([A-Za-z0-9_\-.+=/]{12,})(["']?)/gi;
  const bearer = /(\bBearer\s+)[A-Za-z0-9_\-.+=/]{20,}/gi;
  const iv = /(iv|nonce)=["']?[A-Za-z0-9+=/]{12,}["']?/gi;

  const parts = [generic.source, bearer.source, iv.source];
  if (literals) {
    parts.push(`(?:${literals})`);
  }
  return new RegExp(parts.join("|"), "gi");
}

export function createRedactor(extraValues: string[] = []): Redactor {
  const cfg = config();
  const extraKeys = cfg.REDACT_EXTRA_KEYS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const dynamicValues: string[] = [];
  for (const key of [...BUILTIN_KEYS, ...extraKeys]) {
    const value = process.env[key];
    if (value) dynamicValues.push(value);
  }
  // Añade valores cargados vía secrets/config (degradación segura si faltan).
  try {
    for (const v of [secrets.jwtSecret(), secrets.aiGatewayKey(), secrets.encryptionMasterKey()]) {
      if (v) dynamicValues.push(v);
    }
  } catch {
    // Sin secretos configurados (p.ej. desarrollo): solo patrones genéricos.
  }

  const pattern = buildSecretPatterns([...dynamicValues, ...extraValues]);
  const patternKeys = new RegExp(
    `("?(?:${BUILTIN_KEYS.concat(extraKeys).map(escapeRegExp).join("|")})"?\\s*:\\s*")[^"]{4,}(")`,
    "gi",
  );

  function redact(input: string): string {
    let out = input.replace(pattern, (_match, prefix = "") => `${prefix}[REDACTED]`);
    out = out.replace(patternKeys, "$1[REDACTED]$2");
    return out;
  }

  function redactObject(input: unknown): unknown {
    if (typeof input === "string") return redact(input);
    if (Array.isArray(input)) return input.map(redactObject);
    if (input && typeof input === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (typeof value === "string" && isSensitiveKey(key)) {
          out[key] = "[REDACTED]";
        } else {
          out[key] = redactObject(value);
        }
      }
      return out;
    }
    return input;
  }

  return { redact, redactObject };
}

function isSensitiveKey(key: string): boolean {
  return /(secret|token|password|passwd|api[_-]?key|jwt|signing|encryption|bearer|credential)/i.test(
    key,
  );
}

export const redactor: Redactor = createRedactor();
export const redact = (input: string): string => redactor.redact(input);
export const redactObject = (input: unknown): unknown => redactor.redactObject(input);
