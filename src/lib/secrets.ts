import { config } from "./config";

/**
 * ACCESO CENTRALIZADO A SECRETOS (src/lib/secrets.ts)
 * -----------------------------------------------------------------
 * Nunca leas secretos desde `process.env` directamente: este módulo
 * centraliza su acceso y distingue secretos operativos de política.
 *
 * En producción los secretos deberían provenir de un KMS/secret store;
 * este módulo es el punto único a sustituir por esa integración.
 */

export type SecretKind =
  "jwt" | "encryption" | "bookpi" | "ai" | "supabase-service" | "policy-signing";

function requireSecret(kind: SecretKind, value: string | undefined, label: string): string {
  if (!value || value.length === 0) {
    throw new Error(`Secreto requerido no configurado: ${label} (${kind})`);
  }
  return value;
}

export interface Secrets {
  jwtSecret(): string;
  encryptionMasterKey(): string;
  bookpiSigningKey(): string;
  aiGatewayKey(): string;
  supabaseJwtSecret(): string | undefined;
  policySigningKey(): string | undefined;
  apiKeyHashSecret(): string;
}

/** Resolver de secretos ligado a config(). */
export function createSecrets(cfg = config): Secrets {
  return {
    jwtSecret() {
      return requireSecret("jwt", cfg().AUTH_JWT_SECRET, "AUTH_JWT_SECRET (ver .env.example)");
    },
    encryptionMasterKey() {
      return requireSecret(
        "encryption",
        cfg().ENCRYPTION_MASTER_KEY,
        "ENCRYPTION_MASTER_KEY (mín. 32 caracteres)",
      );
    },
    bookpiSigningKey() {
      const alg = cfg().BOOKPI_SIGNATURE_ALGORITHM;
      if (alg === "NOT_IMPLEMENTED") return "";
      return requireSecret("bookpi", cfg().BOOKPI_SIGNING_KEY, "BOOKPI_SIGNING_KEY");
    },
    aiGatewayKey() {
      // Puerta de IA: se prefiere Lovable AI Gateway; Gemini directo queda como alternativa.
      return (
        process.env["LOVABLE_API_KEY"] ||
        cfg().GEMINI_API_KEY ||
        requireSecret("ai", undefined, "LOVABLE_API_KEY o GEMINI_API_KEY")
      );
    },
    supabaseJwtSecret() {
      return cfg().SUPABASE_JWT_SECRET;
    },
    policySigningKey() {
      return cfg().CROWN_POLICY_SIGNING_KEY;
    },
    apiKeyHashSecret() {
      // Fail-closed: nunca usar un valor por defecto hardcodeado. Si no hay
      // clave huésped para el hash de API keys, el sistema niega la operación.
      return requireSecret(
        "jwt",
        cfg().API_KEY_HASH_SECRET || cfg().AUTH_JWT_SECRET,
        "API_KEY_HASH_SECRET o AUTH_JWT_SECRET",
      );
    },
  };
}

export const secrets: Secrets = createSecrets();
