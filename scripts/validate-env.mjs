#!/usr/bin/env node
/**
 * @file validate-env.mjs
 * @description Script de validación durante el inicio de la aplicación que verifica si
 * todas las variables de entorno críticas definidas en .env.example están presentes
 * y con formato válido.
 * Autoría: Edwin Oswaldo Castillo Trejo (Anubis Villaseñor)
 * Ecosistema: TAMV ONLINE NETWORK / Nodo Cero (Real del Monte, Hidalgo, México)
 */

import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const examplePath = path.resolve(rootDir, ".env.example");
const envPath = path.resolve(rootDir, ".env");

console.log("\n=======================================================");
console.log("🛡️  ISABELLA AI GENESIS — STARTUP ENVIRONMENT VALIDATOR");
console.log("    Gobernanza C.R.O.W.N. · Nodo Cero (Real del Monte)");
console.log("=======================================================\n");

if (!fs.existsSync(examplePath)) {
  console.error("❌ ERROR CRÍTICO: .env.example no fue encontrado en la raíz del proyecto.");
  process.exit(1);
}

// Cargar .env y .env.local manualmente si existen y no están poblados en process.env
function loadEnvFile(filePath) {
  if (fs.existsSync(filePath)) {
    const envContent = fs.readFileSync(filePath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const firstEq = trimmed.indexOf("=");
      if (firstEq > 0) {
        const key = trimmed.slice(0, firstEq).trim();
        let val = trimmed.slice(firstEq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (val) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFile(path.resolve(rootDir, ".env"));
loadEnvFile(path.resolve(rootDir, ".env.local"));

// Extraer variables declaradas en .env.example
const exampleContent = fs.readFileSync(examplePath, "utf-8");
const declaredVars = new Map();
let currentSection = "General";

for (const line of exampleContent.split("\n")) {
  const trimmed = line.trim();
  if (trimmed.startsWith("#")) {
    currentSection = trimmed.replace(/^#\s*/, "") || currentSection;
    continue;
  }
  if (!trimmed) continue;
  const firstEq = trimmed.indexOf("=");
  if (firstEq > 0) {
    const key = trimmed.slice(0, firstEq).trim();
    const defaultVal = trimmed.slice(firstEq + 1).trim();
    declaredVars.set(key, { section: currentSection, defaultVal });
  }
}

// Definición de reglas y formatos para variables críticas
const CRITICAL_RULES = {
  NODE_ENV: {
    critical: true,
    validate: (v) => ["development", "test", "production"].includes(v),
    message: "Debe ser 'development', 'test' o 'production'",
  },
  ISABELLA_RUNTIME_MODE: {
    critical: true,
    validate: (v) =>
      ["development", "staging", "production", "emergency", "maintenance"].includes(v),
    message: "Debe ser 'development', 'staging', 'production', 'emergency' o 'maintenance'",
  },
  PUBLIC_URL: {
    critical: true,
    validate: (v) => {
      try {
        const u = new URL(v);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    },
    message: "Debe ser una URL válida con protocolo http o https (ej. http://localhost:3000)",
  },
  ISABELLA_STORAGE_PROVIDER: {
    critical: true,
    validate: (v) => ["postgres", "neon", "supabase", "json", "memory"].includes(v?.toLowerCase()),
    message: "Debe ser 'postgres', 'neon', 'supabase', 'json' o 'memory'",
  },
  AUTH_JWT_SECRET: {
    critical: (mode) => ["staging", "production"].includes(mode),
    validate: (v) => typeof v === "string" && v.length >= 16,
    message: "Secreción criptográfica requerida con longitud mínima de 16 caracteres",
  },
  ENCRYPTION_MASTER_KEY: {
    critical: (mode) => ["staging", "production"].includes(mode),
    validate: (v) => typeof v === "string" && v.length >= 32,
    message: "Clave maestra de cifrado AES-256-GCM requerida (mínimo 32 caracteres)",
  },
  CROWN_POLICY_SIGNING_KEY: {
    critical: (mode) => ["staging", "production"].includes(mode),
    validate: (v) => typeof v === "string" && v.length >= 16,
    message: "Clave de firma constitucional C.R.O.W.N. requerida (mínimo 16 caracteres)",
  },
  BOOKPI_SIGNING_KEY: {
    critical: (mode) => ["staging", "production"].includes(mode),
    validate: (v) => typeof v === "string" && v.length >= 32,
    message: "Clave de firma para libro mayor inmutable BookPI requerida (mínimo 32 caracteres)",
  },
  BOOKPI_SIGNATURE_ALGORITHM: {
    critical: false,
    validate: (v) => ["ECDSA-P384", "RSA-SHA256", "ML-DSA-87"].includes(v),
    message: "Debe ser 'ECDSA-P384', 'RSA-SHA256' o 'ML-DSA-87'",
  },
  DATABASE_URL: {
    critical: (mode) => ["staging", "production"].includes(mode),
    validate: (v) => {
      if (!v) return false;
      try {
        const u = new URL(v);
        return ["postgres:", "postgresql:"].includes(u.protocol);
      } catch {
        return false;
      }
    },
    message: "Debe ser una URI válida de PostgreSQL (postgres://... o postgresql://...)",
  },
  REDIS_URL: {
    critical: false,
    validate: (v) => {
      if (!v) return true; // Opcional, pero si se suministra debe ser válida
      try {
        const u = new URL(v);
        return ["redis:", "rediss:", "https:", "http:"].includes(u.protocol);
      } catch {
        return false;
      }
    },
    message: "Debe ser una URL válida de Redis o Upstash REST (redis://, rediss://, https://)",
  },
  OTEL_EXPORTER_OTLP_ENDPOINT: {
    critical: false,
    validate: (v) => {
      if (!v) return true;
      try {
        const u = new URL(v);
        return ["http:", "https:"].includes(u.protocol);
      } catch {
        return false;
      }
    },
    message: "Debe ser una URL válida OTLP (ej. https://otel.example.com)",
  },
};

const mode =
  process.env.ISABELLA_RUNTIME_MODE ||
  (process.env.NODE_ENV === "production" ? "production" : "development");
const isProdLike = mode === "production" || mode === "staging";

console.log(`📡 Modo de ejecución detectado: [${mode.toUpperCase()}]`);
console.log(`📋 Total de variables declaradas en .env.example: ${declaredVars.size}\n`);

const results = {
  valid: [],
  warnings: [],
  errors: [],
};

for (const [key, meta] of declaredVars.entries()) {
  const value = process.env[key];
  const rule = CRITICAL_RULES[key];
  const isPresent = value !== undefined && value !== null && value.trim() !== "";

  const isCritical = rule
    ? typeof rule.critical === "function"
      ? rule.critical(mode)
      : Boolean(rule.critical)
    : false;

  if (!isPresent) {
    if (isCritical) {
      results.errors.push({
        key,
        section: meta.section,
        issue: "Variable crítica ausente o vacía",
        required: true,
      });
    } else {
      results.warnings.push({
        key,
        section: meta.section,
        issue: "No configurada (usando valor por defecto o fallback resiliente)",
      });
    }
    continue;
  }

  // Si está presente, validar formato si existe regla
  if (rule && rule.validate) {
    const isValid = rule.validate(value.trim());
    if (!isValid) {
      if (isCritical || isProdLike) {
        results.errors.push({
          key,
          section: meta.section,
          issue: `Formato inválido: ${rule.message}`,
          valuePreview: value.length > 8 ? `${value.slice(0, 4)}...` : "***",
        });
      } else {
        results.warnings.push({
          key,
          section: meta.section,
          issue: `Advertencia de formato: ${rule.message}`,
        });
      }
      continue;
    }
  }

  results.valid.push({ key, section: meta.section });
}

// Imprimir reporte estructurado
console.log("-------------------------------------------------------");
console.log(`✅ Variables válidas y activas: ${results.valid.length}`);
console.log(`⚠️  Variables opcionales sin configurar: ${results.warnings.length}`);
console.log(`❌ Errores críticos de formato o presencia: ${results.errors.length}`);
console.log("-------------------------------------------------------\n");

if (results.errors.length > 0) {
  console.error("🚨 SE DETECTARON DEFICIENCIAS CRÍTICAS EN VARIABLES DE ENTORNO:\n");
  for (const err of results.errors) {
    console.error(`   • [${err.section}] ${err.key}: ${err.issue}`);
  }
  console.error(
    "\n💡 Consulta .env.example para revisar la especificación y los formatos permitidos.\n",
  );

  if (isProdLike) {
    console.error(
      "🛑 FAIL-CLOSED: El inicio se interrumpe porque las variables son requeridas en modo productivo.",
    );
    process.exit(1);
  } else {
    console.warn("⚠️  MODO NO PRODUCTIVO: Iniciando con advertencias auditadas.\n");
    process.exit(0);
  }
} else {
  console.log(
    "✨ Verificación de variables críticas completada con éxito. El sistema está listo para arrancar.\n",
  );
  process.exit(0);
}
