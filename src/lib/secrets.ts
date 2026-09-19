import { config, type Env } from "./config";
import { EnvKMSProvider, type KMSProvider } from "./kms-provider";

/**
 * ACCESO CENTRALIZADO A SECRETOS (src/lib/secrets.ts)
 * -----------------------------------------------------------------
 * Nunca leas secretos desde `process.env` directamente: este módulo
 * centraliza su acceso y distingue secretos operativos de política.
 *
 * P0 - MIGRACIÓN A PRODUCTION SECRETS MANAGER:
 * No hay hardcoded fallback keys permitidas (ej: 'dev-fallback-secret').
 * En producción se utiliza un KMSProvider.
 */

export type SecretKind =
  "jwt" | "encryption" | "bookpi" | "ai" | "supabase-service" | "policy-signing";

export class SecretsManager {
  private readonly kms: KMSProvider;
  private readonly cachedConfig: Env;

  constructor(cfg: Env, kmsProvider?: KMSProvider) {
    this.cachedConfig = cfg;
    // Por defecto usa las variables de entorno como "KMS"
    this.kms =
      kmsProvider ?? new EnvKMSProvider(cfg as unknown as Record<string, string | undefined>);
  }

  private async getActiveSecret(
    kind: SecretKind,
    keyName: keyof Env,
    label: string,
  ): Promise<string> {
    // Si KMS lo tiene, úsalo (permitiendo rotación dinámica).
    const secretValue = (await this.kms.getSecret(keyName as string)) ?? this.cachedConfig[keyName];

    if (!secretValue || String(secretValue).trim() === "") {
      throw new Error(
        `[Zero Trust Secrets] Secreto requerido no configurado: ${label} (${kind}). No se admiten fallbacks locales.`,
      );
    }

    return String(secretValue);
  }

  private getActiveSecretSync(kind: SecretKind, keyName: keyof Env, label: string): string {
    const secretValue = this.cachedConfig[keyName];

    if (!secretValue || String(secretValue).trim() === "") {
      throw new Error(
        `[Zero Trust Secrets] Secreto requerido no configurado: ${label} (${kind}). No se admiten fallbacks locales.`,
      );
    }

    return String(secretValue);
  }

  // --- MÉTODOS SINCRÓNICOS (Usan config estática, fallan rápido) ---

  jwtSecret(): string {
    return this.getActiveSecretSync("jwt", "AUTH_JWT_SECRET", "AUTH_JWT_SECRET");
  }

  encryptionMasterKey(): string {
    return this.getActiveSecretSync(
      "encryption",
      "ENCRYPTION_MASTER_KEY",
      "ENCRYPTION_MASTER_KEY (mín. 32 caracteres)",
    );
  }

  bookpiSigningKey(): string {
    return this.getActiveSecretSync("bookpi", "BOOKPI_SIGNING_KEY", "BOOKPI_SIGNING_KEY");
  }

  aiGatewayKey(): string {
    return this.getActiveSecretSync("ai", "GEMINI_API_KEY", "GEMINI_API_KEY");
  }

  optionalProviderKey(provider: "gemini" | "groq" | "xai"): string | undefined {
    const keyName =
      provider === "gemini"
        ? "GEMINI_API_KEY"
        : provider === "groq"
          ? "GROQ_API_KEY"
          : "XAI_API_KEY";
    const value = this.cachedConfig[keyName];
    return typeof value === "string" && value.trim() ? value : undefined;
  }

  aegisAuditSecret(): string {
    return this.getActiveSecretSync("policy-signing", "AEGIS_AUDIT_SECRET", "AEGIS_AUDIT_SECRET");
  }

  apiKeyHashSecret(): string {
    // P1: Desacoplamiento de dominios criptográficos.
    return this.getActiveSecretSync("jwt", "API_KEY_HASH_SECRET", "API_KEY_HASH_SECRET");
  }

  supabaseJwtSecret(): string | undefined {
    return this.cachedConfig.SUPABASE_JWT_SECRET;
  }

  policySigningKey(): string | undefined {
    return this.cachedConfig.CROWN_POLICY_SIGNING_KEY;
  }
}

// Instancia global con el EnvKMSProvider predeterminado.
export const secrets = new SecretsManager(config());
