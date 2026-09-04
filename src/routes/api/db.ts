import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import * as nodeCrypto from "node:crypto";
import { SovereignDB, COGNITIVE_HEADS } from "@/lib/sovereign-engine";
import { SecuritySystem } from "@/lib/security";
import { withSovereignAuth } from "@/lib/principal-context";
import { SovereignSandboxService } from "@/lib/sovereign-sandbox";
import { config } from "@/lib/config";

const addLedgerSchema = z.object({
  operation: z.string().min(1).max(200),
  category: z.enum(["inference", "processing", "apis", "skills", "other"]),
  cost: z.number().min(0).max(1000),
  tokens: z.number().nonnegative().default(0),
});

const executeToolSchema = z.object({
  expression: z.string().min(1).max(1000),
  variables: z.record(z.unknown()).optional(),
  useWasmSim: z.boolean().optional().default(false),
});

const provisionOwnerSchema = z.object({
  tenantId: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9_-]+$/i),
  tenantName: z.string().min(1).max(128),
  ownerId: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/),
  ownerUsername: z.string().min(1).max(64),
});

// ============================================================================
// OAuth manual (solo desarrollo) — códigos de un solo uso y validación de origen
// ============================================================================

const OAUTH_CODE_TTL_MS = 120_000;

interface OAuthCodeEntry {
  userId: string;
  redirectUri: string;
  expiresAt: number;
}

// Almacén en memoria de códigos de autorización de un solo uso.
const oauthCodes = new Map<string, OAuthCodeEntry>();

/**
 * Fail-closed: sesiones de desarrollo solo se habilitan cuando AMBAS condiciones
 * se cumplen — NODE_ENV === "development" Y AUTH_DEV_SESSION_ENABLED === true.
 * Si falta cualquiera de las dos, la puerta queda cerrada.
 */
function isDevSessionEnabled(): boolean {
  return config().NODE_ENV === "development" && config().AUTH_DEV_SESSION_ENABLED === true;
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return nodeCrypto.timingSafeEqual(aBuf, bBuf);
}

function isSameOrigin(requestUrl: URL, redirectUri: string): boolean {
  try {
    const target = new URL(redirectUri);
    return target.origin === requestUrl.origin;
  } catch {
    return false;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function auditAccessAttempt(
  traceId: string,
  ip: string,
  event: string,
  details: string,
  severity: "S0" | "S1" | "S2" | "S3" = "S1",
): void {
  SovereignDB.appendAuditLog(traceId, `corr_${traceId}`, ip, event, severity, details);
}

export const Route = createFileRoute("/api/db")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const action = url.searchParams.get("action") || "session";

        if (action === "session") {
          return withSovereignAuth("system", "read", async (context) => {
            const headers = SecuritySystem.injectSecureHeaders(
              new Headers({ "content-type": "application/json" }),
            );
            return new Response(
              JSON.stringify({
                session: {
                  userId: context.userId,
                  username: context.username,
                  tenantId: context.tenantId,
                  role: context.role,
                  oidcSub: `sub_oidc_${context.userId}`,
                },
                tenant: context.tenant,
              }),
              { headers },
            );
          })({ request });
        }

        if (action === "ledger") {
          return withSovereignAuth("ledger", "read", async (context) => {
            const headers = SecuritySystem.injectSecureHeaders(
              new Headers({ "content-type": "application/json" }),
            );
            const ledger = SovereignDB.getLedger(context.tenantId);
            return new Response(JSON.stringify({ ledger }), { headers });
          })({ request });
        }

        if (action === "verify-ledger") {
          return withSovereignAuth("ledger", "verify", async (context) => {
            const headers = SecuritySystem.injectSecureHeaders(
              new Headers({ "content-type": "application/json" }),
            );
            const result = SovereignDB.verifyLedgerIntegrity();
            if (result.success) {
              SovereignDB.appendAuditLog(
                context.traceId,
                context.correlationId,
                context.ip,
                "Auditoría Forense del Ledger Exitosa",
                "S3",
                "Integridad del libro de transacciones validada con éxito.",
              );
            } else {
              SovereignDB.appendAuditLog(
                `trc_ledger_corrupt_${result.corruptedIndex}`,
                context.correlationId,
                context.ip,
                "¡BRECHA DE SEGURIDAD DETECTADA EN LEDGER!",
                "S0",
                `Fallo de integridad en Ledger: ${result.error}`,
              );
            }
            return new Response(JSON.stringify(result), { headers });
          })({ request });
        }

        if (action === "verify-audit-chain") {
          return withSovereignAuth("audit", "verify", async (context) => {
            const headers = SecuritySystem.injectSecureHeaders(
              new Headers({ "content-type": "application/json" }),
            );
            const result = SovereignDB.verifyAuditChain();
            if (result.success) {
              SovereignDB.appendAuditLog(
                context.traceId,
                context.correlationId,
                context.ip,
                "Verificación de Cadena de Auditoría Exitosa",
                "S3",
                "La integridad criptográfica de la cadena de logs de auditoría (SHA-256) está intacta.",
              );
            } else {
              SovereignDB.appendAuditLog(
                `trc_audit_corrupt_${result.corruptedId || "unknown"}`,
                context.correlationId,
                context.ip,
                "¡INTEGRIDAD DE REGISTROS DE AUDITORÍA VIOLADA!",
                "S0",
                `Fallo en validación de cadena: ${result.error}`,
              );
            }
            return new Response(JSON.stringify(result), { headers });
          })({ request });
        }

        if (action === "test") {
          return withSovereignAuth("system", "execute", async (context) => {
            const headers = SecuritySystem.injectSecureHeaders(
              new Headers({ "content-type": "application/json" }),
            );
            const { runSecurityTestSuite } = await import("../../../test/security/security-runner");
            const testResults = runSecurityTestSuite();

            if (testResults.success) {
              SovereignDB.appendAuditLog(
                context.traceId,
                context.correlationId,
                context.ip,
                "Auditoría de Sistemas Automatizada Exitosa",
                "S3",
                `Paso exitoso de todas las pruebas automatizadas del criptosistema (${testResults.results.length} de ${testResults.results.length} aprobadas).`,
              );
            } else {
              SovereignDB.appendAuditLog(
                context.traceId,
                context.correlationId,
                context.ip,
                "CRITICAL: Fallo en Auditoría de Sistemas",
                "S0",
                "Las pruebas del criptosistema de seguridad han fallado.",
              );
            }

            return new Response(JSON.stringify(testResults), { headers });
          })({ request });
        }

        if (action === "audit") {
          return withSovereignAuth("audit", "read", async () => {
            const headers = SecuritySystem.injectSecureHeaders(
              new Headers({ "content-type": "application/json" }),
            );
            const auditLogs = SovereignDB.getAuditLogs();
            return new Response(JSON.stringify({ auditLogs }), { headers });
          })({ request });
        }

        if (action === "heads") {
          return withSovereignAuth("system", "read", async () => {
            const headers = SecuritySystem.injectSecureHeaders(
              new Headers({ "content-type": "application/json" }),
            );
            return new Response(JSON.stringify({ heads: COGNITIVE_HEADS }), { headers });
          })({ request });
        }

        if (action === "list-api-keys") {
          return withSovereignAuth("system", "read", async (context) => {
            const headers = SecuritySystem.injectSecureHeaders(
              new Headers({ "content-type": "application/json" }),
            );
            const { ApiKeyService } = await import("@/lib/api-key-service");
            const list = await ApiKeyService.listApiKeys(context.tenantId);
            return new Response(JSON.stringify({ keys: list }), { headers });
          })({ request });
        }

        // --- LAYER 3.2: Manual OAuth Endpoints (solo desarrollo / fail-closed) ---
        if (action === "oauth-url") {
          const headers = SecuritySystem.injectSecureHeaders(
            new Headers({ "content-type": "application/json" }),
          );
          if (!isDevSessionEnabled()) {
            auditAccessAttempt(
              `trc_oauth_${nodeCrypto.randomUUID().slice(0, 8)}`,
              SecuritySystem.resolveClientIp(request),
              "oauth.url_denied",
              "Flujo OAuth manual deshabilitado fuera del modo desarrollo.",
            );
            return new Response(
              JSON.stringify({
                error: "El flujo OAuth manual está deshabilitado en este modo.",
              }),
              { status: 403, headers },
            );
          }
          const rawRedirect = url.searchParams.get("redirect_uri") || "";
          if (rawRedirect && !isSameOrigin(url, rawRedirect)) {
            return new Response(
              JSON.stringify({ error: "redirect_uri debe pertenecer al mismo origen." }),
              { status: 400, headers },
            );
          }
          const redirectUri = rawRedirect || `${url.origin}/api/db?action=oauth-callback`;
          const clientId = url.searchParams.get("client_id") || "isabella_oauth_client";

          const providerUrl = `${url.origin}/api/db?action=oauth-provider&redirect_uri=${encodeURIComponent(redirectUri)}&client_id=${encodeURIComponent(clientId)}`;
          return new Response(JSON.stringify({ url: providerUrl }), { headers });
        }

        if (action === "oauth-provider") {
          if (!isDevSessionEnabled()) {
            return new Response("Flujo OAuth manual deshabilitado en este modo.", {
              status: 403,
              headers: SecuritySystem.injectSecureHeaders(
                new Headers({ "content-type": "text/plain" }),
              ),
            });
          }
          const redirectUri = url.searchParams.get("redirect_uri") || "";
          if (!isSameOrigin(url, redirectUri)) {
            return new Response("redirect_uri inválido: debe pertenecer al mismo origen.", {
              status: 400,
            });
          }
          const clientId = url.searchParams.get("client_id") || "isabella_oauth_client";
          const sessions = SovereignDB.getSessions();

          const html = `
            <!DOCTYPE html>
            <html lang="es">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Isabella Sovereign IDP — Conexión OAuth 2.0</title>
              <style>
                body {
                  background-color: #0b0c10;
                  color: #e2e8f0;
                  font-family: system-ui, -apple-system, sans-serif;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  min-height: 100vh;
                  margin: 0;
                  padding: 20px;
                  box-sizing: border-box;
                }
                .card {
                  background: rgba(17, 20, 28, 0.9);
                  border: 1px solid rgba(112, 102, 249, 0.3);
                  box-shadow: 0 10px 40px 0 rgba(112, 102, 249, 0.2);
                  border-radius: 16px;
                  padding: 32px;
                  max-width: 440px;
                  width: 100%;
                  text-align: center;
                }
                h1 {
                  color: #7066f9;
                  font-size: 22px;
                  margin-top: 12px;
                  margin-bottom: 8px;
                }
                .subtitle {
                  color: #94a3b8;
                  font-size: 13px;
                  margin-bottom: 24px;
                }
                .scope-box {
                  background: rgba(255, 255, 255, 0.03);
                  border: 1px solid rgba(255, 255, 255, 0.08);
                  border-radius: 8px;
                  padding: 12px;
                  text-align: left;
                  margin-bottom: 20px;
                  font-size: 12px;
                }
                .scope-item {
                  display: flex;
                  align-items: center;
                  gap: 8px;
                  margin-bottom: 6px;
                }
                .scope-item:last-child {
                  margin-bottom: 0;
                }
                .scope-bullet {
                  color: #10b981;
                  font-weight: bold;
                }
                select {
                  width: 100%;
                  background: #1e293b;
                  border: 1px solid rgba(255, 255, 255, 0.15);
                  color: #f8fafc;
                  padding: 10px;
                  border-radius: 8px;
                  font-size: 14px;
                  outline: none;
                  margin-bottom: 24px;
                  cursor: pointer;
                }
                .btn {
                  width: 100%;
                  background: #7066f9;
                  color: white;
                  border: none;
                  padding: 12px;
                  border-radius: 8px;
                  font-size: 14px;
                  font-weight: 600;
                  cursor: pointer;
                  transition: background 0.2s;
                }
                .btn:hover {
                  background: #5a50e5;
                }
                .footer {
                  margin-top: 20px;
                  font-size: 11px;
                  color: #64748b;
                }
              </style>
            </head>
            <body>
              <div class="card">
                <div style="font-size: 40px; margin-bottom: 8px;">🌸</div>
                <h1>Isabella Sovereign IDP</h1>
                <div class="subtitle">La identidad OIDC determina su rol de acceso mediante control estricto RBAC.</div>
                
                <form action="/api/db?action=oauth-authorize-action" method="POST">
                  <input type="hidden" name="redirect_uri" value="${encodeURIComponent(redirectUri)}">
                  <input type="hidden" name="client_id" value="${encodeURIComponent(clientId)}">
                  
                  <div class="scope-box">
                    <div style="font-weight: 600; margin-bottom: 8px; color: #f1f5f9;">Permisos Solicitados:</div>
                    <div class="scope-item"><span class="scope-bullet">✔</span> openid (Identidad de sesión única)</div>
                    <div class="scope-item"><span class="scope-bullet">✔</span> profile (Perfil soberano en Nodo Cero)</div>
                    <div class="scope-item"><span class="scope-bullet">✔</span> isabella:chat (Diálogo interactivo)</div>
                  </div>
                  
                  <div style="text-align: left; margin-bottom: 8px; font-size: 12px; color: #94a3b8; font-weight: 500;">Seleccionar Cuenta Soberana:</div>
                  <select name="userId">
                    ${sessions
                      .map(
                        (s) =>
                          `<option value="${s.userId}">${escapeHtml(s.username)} (${s.role})</option>`,
                      )
                      .join("")}
                  </select>
                  
                  <button type="submit" class="btn">Autorizar Acceso Seguro</button>
                </form>
                
                <div class="footer">
                  Seguridad C.R.O.W.N. • Real del Monte, Hidalgo, MX
                </div>
              </div>
            </body>
            </html>
          `;
          return new Response(html, {
            headers: new Headers({ "content-type": "text/html" }),
          });
        }

        if (action === "oauth-callback") {
          const ip = SecuritySystem.resolveClientIp(request);
          if (!isDevSessionEnabled()) {
            return new Response("Flujo OAuth manual deshabilitado en este modo.", {
              status: 403,
              headers: SecuritySystem.injectSecureHeaders(
                new Headers({ "content-type": "text/plain" }),
              ),
            });
          }
          const code = url.searchParams.get("code") || "";
          const entry = oauthCodes.get(code);
          oauthCodes.delete(code); // Consumir código de un solo uso inmediatamente

          if (!entry) {
            auditAccessAttempt(
              `trc_oauth_cb_${nodeCrypto.randomUUID().slice(0, 8)}`,
              ip,
              "oauth.callback_invalid_code",
              "Código de autorización inválido, expirado o ya utilizado.",
            );
            return new Response(
              "Error: Código de autorización inválido, expirado o ya utilizado.",
              { status: 400 },
            );
          }
          if (Date.now() > entry.expiresAt) {
            auditAccessAttempt(
              `trc_oauth_cb_${nodeCrypto.randomUUID().slice(0, 8)}`,
              ip,
              "oauth.callback_expired_code",
              "Código de autorización expirado.",
            );
            return new Response("Error: Código de autorización expirado.", { status: 400 });
          }
          if (!isSameOrigin(url, entry.redirectUri)) {
            auditAccessAttempt(
              `trc_oauth_cb_${nodeCrypto.randomUUID().slice(0, 8)}`,
              ip,
              "oauth.callback_origin_mismatch",
              "Origen de redirección inconsistente con el emitido.",
            );
            return new Response("Error: Origen de redirección inválido.", { status: 400 });
          }

          const session = SovereignDB.getSessions().find((s) => s.userId === entry.userId);
          if (!session) {
            auditAccessAttempt(
              `trc_oauth_cb_${nodeCrypto.randomUUID().slice(0, 8)}`,
              ip,
              "oauth.callback_user_missing",
              "Usuario solicitado no registrado en el nodo.",
            );
            return new Response("Error: Usuario no encontrado en base de datos.", { status: 400 });
          }

          const scope = "isabella:chat isabella:ledger:write isabella:sandbox:run";
          const userToken = SecuritySystem.generateSovereignToken(
            session.userId,
            session.role,
            session.tenantId,
            scope,
          );

          auditAccessAttempt(
            `trc_oidc_cb_${nodeCrypto.randomUUID().slice(0, 8)}`,
            ip,
            "oauth.callback_success",
            `Sesión OIDC emitida para ${session.username} (${session.role}).`,
            "S3",
          );

          // Valores únicamente de servidor, serializados como literales JS seguros.
          const targetOriginJson = JSON.stringify(url.origin);
          const userTokenJson = JSON.stringify(userToken);
          const sessionUserIdJson = JSON.stringify(session.userId);
          const sessionUsernameJson = JSON.stringify(session.username);
          const sessionRoleJson = JSON.stringify(session.role);

          const callbackHtml = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>Conexión Exitosa</title>
              <style>
                body {
                  background: #0b0c10;
                  color: #e2e8f0;
                  font-family: system-ui, sans-serif;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  height: 100vh;
                  margin: 0;
                  text-align: center;
                }
                .msg {
                  background: rgba(16, 185, 129, 0.1);
                  border: 1px solid rgba(16, 185, 129, 0.3);
                  padding: 24px;
                  border-radius: 12px;
                  max-width: 380px;
                }
              </style>
            </head>
            <body>
              <div class="msg">
                <div style="font-size: 32px; margin-bottom: 12px;">✔</div>
                <h3 style="margin: 0 0 8px 0; color: #10b981;">Autenticación Completa</h3>
                <p style="margin: 0; font-size: 13px; color: #94a3b8;">La conexión con Isabella se ha verificado criptográficamente. Esta ventana se cerrará...</p>
              </div>
              <script>
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'OAUTH_AUTH_SUCCESS',
                    token: ${userTokenJson},
                    userId: ${sessionUserIdJson},
                    username: ${sessionUsernameJson},
                    role: ${sessionRoleJson}
                  }, ${targetOriginJson});
                  setTimeout(() => { window.close(); }, 800);
                } else {
                  window.location.href = '/';
                }
              </script>
            </body>
            </html>
          `;
          return new Response(callbackHtml, {
            headers: new Headers({ "content-type": "text/html" }),
          });
        }

        const headers = SecuritySystem.injectSecureHeaders(
          new Headers({ "content-type": "application/json" }),
        );
        return new Response(JSON.stringify({ error: "Acción desconocida." }), {
          status: 400,
          headers,
        });
      },

      POST: async ({ request }) => {
        const ip = SecuritySystem.resolveClientIp(request);
        const url = new URL(request.url);
        const action = url.searchParams.get("action");
        const headers = SecuritySystem.injectSecureHeaders(
          new Headers({ "content-type": "application/json" }),
        );

        try {
          if (action === "oauth-authorize-action") {
            if (!isDevSessionEnabled()) {
              auditAccessAttempt(
                `trc_oauth_${nodeCrypto.randomUUID().slice(0, 8)}`,
                ip,
                "oauth.dev_flow_denied",
                "Intento de usar el flujo OAuth manual fuera del modo desarrollo.",
              );
              return new Response(
                JSON.stringify({ error: "Flujo OAuth manual deshabilitado en este modo." }),
                { status: 403, headers },
              );
            }
            const formData = await request.formData();
            const redirectUriEnc = formData.get("redirect_uri") as string;
            const userId = formData.get("userId") as string;

            const redirectUri = decodeURIComponent(redirectUriEnc);
            if (!isSameOrigin(url, redirectUri)) {
              return new Response(
                JSON.stringify({ error: "redirect_uri inválido: mismo origen requerido." }),
                { status: 400, headers },
              );
            }
            if (SovereignDB.getSessions().find((s) => s.userId === userId) === undefined) {
              return new Response(
                JSON.stringify({ error: "Usuario no registrado en el nodo." }),
                { status: 400, headers },
              );
            }

            const code = `authcode_${nodeCrypto.randomBytes(24).toString("hex")}`;
            oauthCodes.set(code, {
              userId,
              redirectUri,
              expiresAt: Date.now() + OAUTH_CODE_TTL_MS,
            });

            const targetUrl = `${redirectUri}${redirectUri.includes("?") ? "&" : "?"}code=${encodeURIComponent(code)}`;
            return new Response("", {
              status: 303,
              headers: new Headers({ Location: targetUrl }),
            });
          }

          // 1. Provisionamiento soberano del primer tenant/owner (bootstrap).
          //    NO es un endpoint de autenticación: requiere PROVISION_OWNER_TOKEN.
          if (action === "provision-owner") {
            const expectedToken = config().PROVISION_OWNER_TOKEN;
            const suppliedToken = (request.headers.get("x-isabella-api-key") || "").trim();

            if (!expectedToken || suppliedToken.length === 0) {
              auditAccessAttempt(
                `trc_prov_${nodeCrypto.randomUUID().slice(0, 8)}`,
                ip,
                "provision.owner_denied",
                "Provisionamiento soberano intentado sin token de bootstrap.",
              );
              return new Response(
                JSON.stringify({ error: "Provisionamiento de owner no autorizado." }),
                { status: 403, headers },
              );
            }

            if (!timingSafeEqualStrings(expectedToken, suppliedToken)) {
              auditAccessAttempt(
                `trc_prov_${nodeCrypto.randomUUID().slice(0, 8)}`,
                ip,
                "provision.owner_invalid_token",
                "Token de bootstrap inválido para aprovisionar owner.",
              );
              return new Response(
                JSON.stringify({ error: "Token de bootstrap inválido." }),
                { status: 403, headers },
              );
            }

            let provBody: unknown;
            try {
              provBody = await request.json();
            } catch {
              return new Response(
                JSON.stringify({ error: "Payload JSON inválido." }),
                { status: 400, headers },
              );
            }
            const parsedOwner = provisionOwnerSchema.safeParse(provBody);
            if (!parsedOwner.success) {
              return new Response(
                JSON.stringify({ error: "Esquema de provisión inválido." }),
                { status: 400, headers },
              );
            }
            const { tenantId, tenantName, ownerId, ownerUsername } = parsedOwner.data;

            if (SovereignDB.getTenant(tenantId)) {
              return new Response(
                JSON.stringify({ error: "El tenant ya existe." }),
                { status: 409, headers },
              );
            }

            SovereignDB.upsertTenant({
              id: tenantId,
              name: tenantName,
              region: "MX-HGO",
              quotaBalance: 0,
              tier: "Sovereign",
            });
            SovereignDB.upsertSession({
              userId: ownerId,
              username: ownerUsername,
              tenantId,
              role: "SovereignOwner",
              oidcSub: `provision|${ownerId}`,
            });

            auditAccessAttempt(
              `trc_prov_${nodeCrypto.randomUUID().slice(0, 8)}`,
              ip,
              "provision.owner_success",
              `Owner [${ownerId}] aprovisionado para tenant [${tenantId}].`,
              "S3",
            );

            return new Response(
              JSON.stringify({ success: true, tenantId, ownerId }),
              { headers },
            );
          }

          // [ELIMINADO] action "authenticate" era una puerta trasera: acuñaba un JWT
          // para cualquier userId sin credencial. Sustituido por provision-owner
          // (bootstrap con token) y el flujo OAuth manual (dev, código de un solo
          // uso). No reintroducir sin acreditar la identidad.

          // --- DEV SESSION: mock user para desarrollo local ---
          // Fail-closed: solo funciona cuando NODE_ENV=development Y
          // AUTH_DEV_SESSION_ENABLED=true. En staging/production esta acción
          // responde 403 y nunca emite tokens.
          if (action === "dev-session") {
            if (!isDevSessionEnabled()) {
              auditAccessAttempt(
                `trc_dev_${nodeCrypto.randomUUID().slice(0, 8)}`,
                ip,
                "dev.session_denied",
                "Sesión de desarrollo solicitada fuera del modo desarrollo.",
              );
              return new Response(
                JSON.stringify({ error: "Sesión de desarrollo no disponible en este modo." }),
                { status: 403, headers },
              );
            }

            // Mock user: solo se usa para desarrollo local sin OAuth real.
            const DEV_USER = {
              userId: "dev_user_local",
              username: "Dev Admin",
              role: "SovereignOwner" as const,
              tenantId: "nodo-cero",
            };

            const devToken = SecuritySystem.generateSovereignToken(
              DEV_USER.userId,
              DEV_USER.role,
              DEV_USER.tenantId,
              "isabella:chat isabella:ledger:write isabella:sandbox:run",
            );

            auditAccessAttempt(
              `trc_dev_${nodeCrypto.randomUUID().slice(0, 8)}`,
              ip,
              "dev.session_issued",
              `Sesión de desarrollo emitida para ${DEV_USER.username} (${DEV_USER.role}).`,
              "S3",
            );

            return new Response(
              JSON.stringify({
                success: true,
                token: devToken,
                userId: DEV_USER.userId,
                username: DEV_USER.username,
                role: DEV_USER.role,
              }),
              { headers },
            );
          }

          // 2. Enforce verified centralized Authorization Wrapper for ledger & tool execution actions
          if (action === "ledger-add") {
            return withSovereignAuth("ledger", "write", async (context, req, body) => {
              const val = addLedgerSchema.safeParse(body);
              if (!val.success) {
                return new Response(
                  JSON.stringify({ error: "Esquema inválido para transacciones." }),
                  { status: 400, headers },
                );
              }

              const block = SovereignDB.appendLedgerBlock(
                context.tenantId,
                context.userId,
                val.data.operation,
                val.data.category,
                val.data.cost,
                val.data.tokens,
              );

              SovereignDB.appendAuditLog(
                `trc_tx_${block.index}`,
                context.correlationId,
                context.ip,
                "Transacción Ledger Registrada",
                "S3",
                `Costo: $${block.costDecimal} debitado para el tenant aislado ${context.tenantId}`,
              );

              return new Response(JSON.stringify({ success: true, block }), { headers });
            })({ request });
          }

          if (action === "ledger-refund") {
            return withSovereignAuth("ledger", "admin", async (context, req, body) => {
              const { index } = (body ?? {}) as { index?: unknown };
              if (typeof index !== "number") {
                return new Response(JSON.stringify({ error: "Índice del bloque requerido." }), {
                  status: 400,
                  headers,
                });
              }

              const res = SovereignDB.appendRefundEvent(index, context.tenantId);
              if (!res.success) {
                return new Response(JSON.stringify({ error: res.error }), { status: 400, headers });
              }

              SovereignDB.appendAuditLog(
                `trc_rf_${index}`,
                context.correlationId,
                context.ip,
                "Reembolso Ledger Procesado",
                "S2",
                `Transacción index ${index} reembolsada para ${context.tenantId}`,
              );

              return new Response(JSON.stringify({ success: true }), { headers });
            })({ request });
          }

          if (action === "execute-tool") {
            return withSovereignAuth("sandbox", "execute", async (context, req, body) => {
              const val = executeToolSchema.safeParse(body);
              if (!val.success) {
                return new Response(
                  JSON.stringify({ error: "Fórmula matemática o parámetros corruptos." }),
                  { status: 400, headers },
                );
              }

              let result;
              if (val.data.useWasmSim) {
                const sandbox = new SovereignSandboxService(context.traceId);
                await sandbox.provisionInstance(context.traceId);
                result = await sandbox.executeTask(
                  ["wasm-process", "math-expr"],
                  { TENANT_ID: context.tenantId },
                  JSON.stringify({ formula: val.data.expression, vars: val.data.variables || {} }),
                );
                await sandbox.deprovisionInstance();
              } else {
                const { SovereignSandbox } = await import("@/lib/sovereign-engine");
                result = SovereignSandbox.executeTool(
                  val.data.expression,
                  val.data.variables || {},
                );
              }

              SovereignDB.appendAuditLog(
                context.traceId,
                context.correlationId,
                context.ip,
                "Herramienta Ejecutada en Sandbox",
                result.success ? "S3" : "S1",
                `Fórmula: [${val.data.expression}]. Simulación WASM: ${val.data.useWasmSim ? "Habilitada" : "Deshabilitada"}.`,
              );

              return new Response(JSON.stringify(result), { headers });
            })({ request });
          }

          if (action === "create-api-key") {
            return withSovereignAuth("system", "write", async (context, req, body: unknown) => {
              const { name, role, scopes, expiresInSeconds } = (body || {}) as {
                name?: string;
                role?: string;
                scopes?: string[];
                expiresInSeconds?: number;
              };
              if (!name || !role || !scopes) {
                return new Response(
                  JSON.stringify({
                    error: "Faltan parámetros obligatorios (name, role, scopes).",
                  }),
                  { status: 400, headers },
                );
              }
              const { ApiKeyService } = await import("@/lib/api-key-service");
              const result = await ApiKeyService.createApiKey(
                context.tenantId,
                context.userId,
                name,
                role,
                scopes,
                expiresInSeconds,
              );
              return new Response(JSON.stringify({ success: true, key: result }), { headers });
            })({ request });
          }

          if (action === "revoke-api-key") {
            return withSovereignAuth("system", "write", async (context, req, body: unknown) => {
              const { id } = (body || {}) as { id?: string };
              if (!id) {
                return new Response(JSON.stringify({ error: "ID de llave requerido." }), {
                  status: 400,
                  headers,
                });
              }
              const { ApiKeyService } = await import("@/lib/api-key-service");
              const success = await ApiKeyService.revokeApiKey(id, context.tenantId);
              return new Response(JSON.stringify({ success }), { headers });
            })({ request });
          }

          if (action === "rotate-api-key") {
            return withSovereignAuth("system", "write", async (context, req, body: unknown) => {
              const { id } = (body || {}) as { id?: string };
              if (!id) {
                return new Response(JSON.stringify({ error: "ID de llave requerido." }), {
                  status: 400,
                  headers,
                });
              }
              const { ApiKeyService } = await import("@/lib/api-key-service");
              const result = await ApiKeyService.rotateApiKey(id, context.tenantId);
              if (!result.success) {
                return new Response(JSON.stringify({ error: result.error }), {
                  status: 400,
                  headers,
                });
              }
              return new Response(JSON.stringify({ success: true, key: result.newKey }), {
                headers,
              });
            })({ request });
          }

          return new Response(JSON.stringify({ error: "Acción de escritura desconocida." }), {
            status: 400,
            headers,
          });
        } catch (e: unknown) {
          const errMessage =
            e instanceof Error ? e.message : "Error en el pipeline transaccional de base de datos.";
          return new Response(JSON.stringify({ error: errMessage }), { status: 500, headers });
        }
      },
    },
  },
});
