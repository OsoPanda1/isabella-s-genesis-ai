/**
 * Client env guard (scripts/check-client-env.mjs)
 * -----------------------------------------------------------------
 * Vite inlina al bundle del navegador TODA variable `VITE_*` presente
 * en el entorno de build. Un secreto con prefijo VITE_* termina
 * expuesto públicamente. Este gate falla el build ante patrones de
 * secreto y advierte ante vars VITE_* no declaradas en la allowlist.
 *
 * Uso: prebuild (corre antes de `vite build` en local y en Vercel).
 */

const SECRET_LIKE = /(SECRET|PRIVATE|PASSWORD|PASSWD|SIGNING|MASTER[_-]?KEY)/i;
const KEY_LIKE = /(_KEY|KEY_)/i;

// Vars VITE_* explícitamente seguras para el navegador (públicas por diseño).
// Vacía por defecto: el repo no usa ninguna; agregar solo con justificación.
const BROWSER_SAFE_ALLOWLIST = new Set([
  // "VITE_PUBLIC_APP_URL", // pública por diseño, hoy sin uso en código
]);

// Prefijos del sistema (los inyecta la plataforma, no el operador;
// públicas por diseño: URLs, IDs y metadatos del deployment).
// Se silencian para no ahogar el warning real. Cualquier secreto
// con estos prefijos seguiría siendo un error de configuración.
const SYSTEM_PREFIXES = ["VITE_VERCEL_"];

export function auditClientEnv(env = process.env) {
  const errors = [];
  const warnings = [];
  for (const key of Object.keys(env)) {
    if (!key.startsWith("VITE_")) continue;
    if (BROWSER_SAFE_ALLOWLIST.has(key)) continue;
    if (SYSTEM_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    if (SECRET_LIKE.test(key)) {
      errors.push(
        `${key}: patrón de secreto con prefijo VITE_* → se inliniaría al bundle público. ` +
          `Renombrar sin prefijo VITE_ o eliminar la variable.`,
      );
    } else if (KEY_LIKE.test(key)) {
      errors.push(
        `${key}: parece clave con prefijo VITE_* → se inliniaría al bundle público. ` +
          `Mover a secreto server-side o justificar en BROWSER_SAFE_ALLOWLIST.`,
      );
    } else {
      warnings.push(`${key}: VITE_* no declarada en allowlist (se expondrá al navegador).`);
    }
  }
  return { errors, warnings };
}

const invokedAsMain =
  typeof process.argv[1] === "string" && process.argv[1].endsWith("check-client-env.mjs");
if (invokedAsMain) {
  const { errors, warnings } = auditClientEnv();
  for (const warning of warnings) console.warn(`⚠️  client-env: ${warning}`);
  if (errors.length > 0) {
    for (const error of errors) console.error(`❌ client-env: ${error}`);
    process.exit(1);
  }
  console.log("✅ client-env: sin secretos expuestos al bundle del navegador.");
}
