import { z } from "zod";

const enumish = <T extends readonly [string, ...string[]]>(values: T, def: T[number]) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.enum(values).default(def),
  );

export const runtimeModeSchema = enumish(
  ["development", "staging", "production", "emergency", "maintenance"] as const,
  "development",
);
export type RuntimeMode = z.infer<typeof runtimeModeSchema>;
const coercedInt = (def: number) => z.coerce.number().int().nonnegative().default(def);
const optionalString = () =>
  z.preprocess(
    (v) =>
      typeof v === "string" && v.trim() && !["undefined", "null"].includes(v.trim())
        ? v.trim()
        : undefined,
    z.string().optional(),
  );
const optionalMinString = (min: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined),
    z.string().min(min).optional(),
  );
const optionalUrl = () =>
  z.preprocess((v) => {
    if (typeof v !== "string" || !v.trim()) return undefined;
    try {
      new URL(v.trim());
      return v.trim();
    } catch {
      return undefined;
    }
  }, z.string().url().optional());
const bool = (def: boolean) =>
  z.preprocess(
    (v) =>
      typeof v === "boolean"
        ? v
        : typeof v === "string"
          ? v.trim().toLowerCase() === "true"
          : v.trim().toLowerCase() === "false"
            ? false
            : undefined,
    z.boolean().default(def),
  );

export const envSchema = z
  .object({
    // --- ENVIRONMENT ---
    NODE_ENV: enumish(["development", "test", "production"] as const, "development"),
    ISABELLA_RUNTIME_MODE: runtimeModeSchema,
    PUBLIC_URL: z.string().url().default("http://localhost:3000"),
    VERCEL_URL: optionalString(),
    VERCEL_GIT_COMMIT_SHA: optionalString(),
    DATABASE_URL: optionalString(),
    DATABASE_DIRECT_URL: optionalString(),
    TURSO_DATABASE_URL: optionalUrl(),
    TURSO_AUTH_TOKEN: optionalString(),
    INTERNAL_ORIGIN: optionalUrl(),
    // --- POSTGRES / SUPABASE ---
    SUPABASE_URL: optionalUrl(),
    SUPABASE_ANON_KEY: optionalString(),
    SUPABASE_SERVICE_ROLE_KEY: optionalString(),
    SUPABASE_JWT_SECRET: optionalString(),
    // --- JWT / OIDC ---
    AUTH_JWT_SECRET: optionalMinString(16),
    AUTH_ISSUER: optionalUrl(),
    AUTH_AUDIENCE: z.string().default("isabella"),
    AUTH_ACCESS_TOKEN_TTL: coercedInt(3600),
    AUTH_REFRESH_TOKEN_TTL: coercedInt(604800),
    OIDC_JWKS_URL: optionalUrl(),
    JWKS_CACHE_TTL: coercedInt(3600),
    // --- SESSIONS / COOKIES ---
    // Secreto para firmar la cookie de sesión del cliente (mín. 16 caracteres).
    // Opcional: sin él la firma deriva de AUTH_JWT_SECRET; en producción se
    // recomienda una clave dedicada para poder rotarla sin invalidar los JWT.
    SESSION_SECRET: optionalMinString(16),
    // --- DEV SESSION / PROVISIONING ---
    // Solo desarrollo: habilita el login OIDC/OAuth manual de pruebas y la acción
    // `authenticate` (NUNCA en staging/production). Fail-closed por defecto.
    AUTH_DEV_SESSION_ENABLED: z
      .preprocess(
        (val) => {
          if (typeof val !== "string") return undefined;
          const trimmed = val.trim().toLowerCase();
          if (trimmed === "" || trimmed === "undefined" || trimmed === "null") return undefined;
          return trimmed;
        },
        z.enum(["true", "false"]).default("false"),
      )
      .transform((val) => val === "true"),
    ALLOW_GUEST_CHAT: z
      .preprocess(
        (val) => {
          if (typeof val !== "string") return undefined;
          const t = val.trim().toLowerCase();
          if (t === "" || t === "undefined" || t === "null") return undefined;
          return t;
        },
        z.enum(["true", "false"]).default("false"),
      )
      .transform((val) => val === "true"),
    // Token de aprovisionamiento soberano del primer tenant/owner (bootstrap).
    // Sin este token, `provision-owner` niega la operación (fail-closed).
    PROVISION_OWNER_TOKEN: optionalString(),
    // --- CRYPTO ---
    ENCRYPTION_MASTER_KEY: optionalMinString(32),
    ENCRYPTION_ALGORITHM: z.string().default("aes-256-gcm"),
    // --- CROWN ---
    CROWN_CONSTITUTION_VERSION: z.string().min(1).default("v4.2.0-sovereign"),
    CROWN_POLICY_SIGNING_KEY: optionalString(),
    AEGIS_AUDIT_SECRET: optionalMinString(32),
    CROWN_ENFORCEMENT_MODE: enumish(["enforce", "dry-run"] as const, "enforce"),
    // --- BOOKPI ---
    BOOKPI_SIGNATURE_ALGORITHM: z.string().default("NOT_IMPLEMENTED"),
    BOOKPI_SIGNING_KEY: optionalMinString(32),
    // --- REDIS ---
    REDIS_URL: optionalString(),
    REDIS_PREFIX: z.string().default("isabella"),
    // --- RATE LIMIT ---
    RATE_LIMIT_DEFAULT_PER_MINUTE: coercedInt(120),
    RATE_LIMIT_INFERENCE_PER_MINUTE: coercedInt(40),
    RATE_LIMIT_VOICE_PER_MINUTE: coercedInt(20),
    // --- AI GATEWAY ---
    GEMINI_API_KEY: optionalString(),
    LLM_DEFAULT_MODEL: z.string().default("google/gemini-3.6-flash"),
    LLM_VOICE_MODEL: z.string().default("openai/gpt-4o-mini-tts"),
    VOICE_API_URL: optionalUrl(),
    LLM_UPSTREAM_TIMEOUT_MS: coercedInt(8500),
    // --- TELEMETRY ---
    OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl(),
    OTEL_SERVICE_NAME: z.string().default("isabella-ai"),
    // --- REDACTION ---
    REDACT_EXTRA_KEYS: z.string().default(""),
    // --- INPUT LIMITS ---
    INPUT_MAX_BODY_BYTES: coercedInt(262144),
    INPUT_MAX_MESSAGES: coercedInt(200),
    INPUT_MAX_ATTACHMENT_BYTES: coercedInt(10485760),
    INPUT_MAX_TOOLS_PER_REQUEST: coercedInt(20),
    // --- API KEYS ---
    API_KEY_HASH_SECRET: optionalMinString(16),
    API_KEY_PREFIX: z.string().default("isa_live"),
    API_KEY_DEFAULT_TTL: coercedInt(2592000), // 30 days
    API_KEY_MAX_TTL: coercedInt(31536000), // 365 days
    API_KEY_ROTATION_GRACE_SECONDS: coercedInt(300),
    // --- PERSISTENCE ---
    DURABLE_JSON_ALLOWED: z
      .preprocess((val) => {
        if (typeof val === "boolean") return val;
        if (typeof val !== "string") return undefined;
        const t = val.trim().toLowerCase();
        if (t === "true") return true;
        if (t === "false") return false;
        return undefined;
      }, z.boolean().default(false))
      .describe(
        "Allow JSON file persistence in production — must be false in prod, true only for dev/test",
      ),
    // --- QUP (Quantum Utility Protocol) ---
    QUP_ZNE_LEVEL: coercedInt(3),
    QUP_PEC_ENABLED: bool(true),
    QUP_QEC_DECODER: enumish(
      ["mwpm", "uf", "tensor-network", "neural-network"] as const,
      "tensor-network",
    ),
    QUP_STRICT_ISOLATION: bool(true),
    SANDBOX_ENABLED: bool(false),
    // --- OLLAMA ---
    OLLAMA_ENABLED: bool(false),
    OLLAMA_BASE_URL: optionalUrl(),
    OLLAMA_MODEL: optionalString(),
    // --- OPENAI COMPATIBLE ---
    OPENAI_COMPATIBLE_LOCAL_ENABLED: bool(false),
    OPENAI_COMPATIBLE_BASE_URL: optionalUrl(),
    OPENAI_COMPATIBLE_MODEL: optionalString(),
    OPENAI_COMPATIBLE_API_KEY: optionalString(),
    // --- VERCEL ---
    VERCEL: bool(false),
    // --- NATIVE COMPREHENSION ---
    NATIVE_COMPREHENSION_ENABLED: bool(false),
    // --- IGDS ---
    IGDS_SIGNING_KEY: optionalString(),
    IGDS_KEY_ID: z.string().default("isabella-ed25519-2026-01"),
    IGDS_TSA_URL: optionalUrl(),
  })
  .passthrough();

export type Env = z.infer<typeof envSchema>;
export const PUBLIC_ENV_KEYS = [] as const;
export type EnvVarCriticality = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type EnvVarVisibility = "secret" | "public";
export type EnvVarProvider =
  | "postgres"
  | "neon"
  | "supabase"
  | "stripe"
  | "gemini"
  | "openai"
  | "redis"
  | "crown"
  | "bookpi"
  | "otel"
  | "oidc"
  | "vercel"
  | "self";
export interface EnvVarDescriptor {
  name: keyof Env;
  visibility: EnvVarVisibility;
  required: RuntimeMode[];
  forbidden: RuntimeMode[];
  provider?: EnvVarProvider;
  criticality: EnvVarCriticality;
  rotation?: string;
  description?: string;
}

export const ENV_VAR_CATALOG: EnvVarDescriptor[] = [
  {
    name: "NODE_ENV",
    visibility: "public",
    required: [],
    forbidden: [],
    provider: "vercel",
    criticality: "HIGH",
  },
  {
    name: "ISABELLA_RUNTIME_MODE",
    visibility: "public",
    required: ["staging", "production"],
    forbidden: [],
    provider: "self",
    criticality: "CRITICAL",
  },
  {
    name: "PUBLIC_URL",
    visibility: "public",
    required: ["staging", "production"],
    forbidden: [],
    provider: "vercel",
    criticality: "HIGH",
  },
  {
    name: "ISABELLA_STORAGE_PROVIDER",
    visibility: "public",
    required: ["staging", "production"],
    forbidden: [],
    provider: "postgres",
    criticality: "CRITICAL",
  },
  {
    name: "DATABASE_URL",
    visibility: "secret",
    required: ["staging", "production"],
    forbidden: [],
    provider: "postgres",
    criticality: "CRITICAL",
  },
  {
    name: "AUTH_JWT_SECRET",
    visibility: "secret",
    required: ["staging", "production"],
    forbidden: [],
    provider: "self",
    criticality: "CRITICAL",
  },
  {
    name: "ENCRYPTION_MASTER_KEY",
    visibility: "secret",
    required: ["staging", "production"],
    forbidden: [],
    provider: "self",
    criticality: "CRITICAL",
  },
  {
    name: "CROWN_POLICY_SIGNING_KEY",
    visibility: "secret",
    required: ["staging", "production"],
    forbidden: [],
    provider: "crown",
    criticality: "CRITICAL",
  },
  {
    name: "AEGIS_AUDIT_SECRET",
    visibility: "secret",
    required: ["staging", "production"],
    forbidden: [],
    provider: "crown",
    criticality: "CRITICAL",
  },
  {
    name: "BOOKPI_SIGNING_KEY",
    visibility: "secret",
    required: ["staging", "production"],
    forbidden: [],
    provider: "bookpi",
    criticality: "CRITICAL",
  },
  {
    name: "GEMINI_API_KEY",
    visibility: "secret",
    required: ["staging", "production"],
    forbidden: [],
    provider: "gemini",
    criticality: "CRITICAL",
  },
  {
    name: "PROVISION_OWNER_TOKEN",
    visibility: "secret",
    required: ["staging", "production"],
    forbidden: [],
    provider: "self",
    criticality: "CRITICAL",
  },
  {
    name: "STRIPE_SECRET_KEY",
    visibility: "secret",
    required: ["staging", "production"],
    forbidden: [],
    provider: "stripe",
    criticality: "CRITICAL",
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    visibility: "secret",
    required: ["staging", "production"],
    forbidden: [],
    provider: "stripe",
    criticality: "CRITICAL",
  },
  {
    name: "AUTH_DEV_SESSION_ENABLED",
    visibility: "public",
    required: [],
    forbidden: ["staging", "production"],
    provider: "self",
    criticality: "CRITICAL",
  },
  {
    name: "ALLOW_GUEST_CHAT",
    visibility: "public",
    required: [],
    forbidden: [],
    provider: "self",
    criticality: "HIGH",
  },
  {
    name: "CROWN_ENFORCEMENT_MODE",
    visibility: "public",
    required: [],
    forbidden: ["staging", "production"],
    provider: "crown",
    criticality: "CRITICAL",
  },
  {
    name: "DURABLE_JSON_ALLOWED",
    visibility: "public",
    required: [],
    forbidden: ["staging", "production"],
    provider: "self",
    criticality: "CRITICAL",
  },
  {
    name: "SANDBOX_ENABLED",
    visibility: "public",
    required: [],
    forbidden: ["emergency", "maintenance"],
    provider: "self",
    criticality: "CRITICAL",
  },
  {
    name: "BOOKPI_SIGNATURE_ALGORITHM",
    visibility: "public",
    required: [],
    forbidden: [],
    provider: "bookpi",
    criticality: "HIGH",
  },
  {
    name: "REDIS_URL",
    visibility: "secret",
    required: [],
    forbidden: [],
    provider: "redis",
    criticality: "HIGH",
  },
  {
    name: "REDIS_TOKEN",
    visibility: "secret",
    required: [],
    forbidden: [],
    provider: "redis",
    criticality: "HIGH",
  },
  {
    name: "OTEL_EXPORTER_OTLP_ENDPOINT",
    visibility: "secret",
    required: [],
    forbidden: [],
    provider: "otel",
    criticality: "MEDIUM",
  },
  {
    name: "LLM_DEFAULT_MODEL",
    visibility: "public",
    required: [],
    forbidden: [],
    provider: "gemini",
    criticality: "HIGH",
  },
  {
    name: "LLM_UPSTREAM_TIMEOUT_MS",
    visibility: "public",
    required: [],
    forbidden: [],
    provider: "self",
    criticality: "MEDIUM",
  },
  {
    name: "RATE_LIMIT_INFERENCE_PER_MINUTE",
    visibility: "public",
    required: [],
    forbidden: [],
    provider: "self",
    criticality: "MEDIUM",
  },
  {
    name: "INPUT_MAX_BODY_BYTES",
    visibility: "public",
    required: [],
    forbidden: [],
    provider: "self",
    criticality: "MEDIUM",
  },
  {
    name: "INPUT_MAX_ATTACHMENT_BYTES",
    visibility: "public",
    required: [],
    forbidden: [],
    provider: "self",
    criticality: "MEDIUM",
  },
  {
    name: "MUX_INTRO_ASSET_ID",
    visibility: "secret",
    required: [],
    forbidden: [],
    provider: "self",
    criticality: "MEDIUM",
    description: "Mux asset provenance identifier for the cinematic introduction.",
  },
  {
    name: "MUX_PLAYBACK_ID",
    visibility: "secret",
    required: [],
    forbidden: [],
    provider: "self",
    criticality: "MEDIUM",
    description: "Canonical public playback identifier for the cinematic introduction.",
  },
  {
    name: "MUX_INTRO_FALLBACK_TYPE",
    visibility: "public",
    required: [],
    forbidden: [],
    provider: "self",
    criticality: "MEDIUM",
  },
  {
    name: "OLLAMA_ENABLED",
    visibility: "public",
    required: [],
    forbidden: [],
    provider: "self",
    criticality: "HIGH",
  },
  {
    name: "OLLAMA_BASE_URL",
    visibility: "public",
    required: [],
    forbidden: [],
    provider: "self",
    criticality: "HIGH",
  },
  {
    name: "OLLAMA_MODEL",
    visibility: "public",
    required: [],
    forbidden: [],
    provider: "self",
    criticality: "MEDIUM",
  },
  {
    name: "OPENAI_COMPATIBLE_LOCAL_ENABLED",
    visibility: "public",
    required: [],
    forbidden: [],
    provider: "self",
    criticality: "HIGH",
  },
  {
    name: "OPENAI_COMPATIBLE_BASE_URL",
    visibility: "public",
    required: [],
    forbidden: [],
    provider: "self",
    criticality: "HIGH",
  },
  {
    name: "OPENAI_COMPATIBLE_MODEL",
    visibility: "public",
    required: [],
    forbidden: [],
    provider: "self",
    criticality: "MEDIUM",
  },
  {
    name: "OPENAI_COMPATIBLE_API_KEY",
    visibility: "secret",
    required: [],
    forbidden: [],
    provider: "openai",
    criticality: "HIGH",
  },
  {
    name: "VERCEL",
    visibility: "public",
    required: [],
    forbidden: [],
    provider: "vercel",
    criticality: "LOW",
  },
  {
    name: "NATIVE_COMPREHENSION_ENABLED",
    visibility: "public",
    required: [],
    forbidden: [],
    provider: "self",
    criticality: "LOW",
  },
  {
    name: "IGDS_SIGNING_KEY",
    visibility: "secret",
    required: [],
    forbidden: [],
    provider: "bookpi",
    criticality: "HIGH",
    description: "Clave privada Ed25519 (PEM PKCS8) para el sello IGDS.",
  },
  {
    name: "IGDS_KEY_ID",
    visibility: "public",
    required: [],
    forbidden: [],
    provider: "bookpi",
    criticality: "MEDIUM",
  },
  {
    name: "IGDS_TSA_URL",
    visibility: "secret",
    required: [],
    forbidden: [],
    provider: "self",
    criticality: "MEDIUM",
    description: "Endpoint RFC 3161 para sellado temporal externo (opcional).",
  },
];

export function requiredEnvKeys(mode: RuntimeMode): Array<keyof Env> {
  return ENV_VAR_CATALOG.filter((item) => item.required.includes(mode)).map((item) => item.name);
}