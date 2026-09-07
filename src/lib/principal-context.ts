import { SecuritySystem, TokenClaims } from "./security";
import { evaluateAuthorization, type AuthorizationContext } from "./authorization";
import { type Resource, type Action } from "./permission-matrix";
import { type Role } from "./rbac";
import { ApiKeyAuthenticator } from "./api-key-authenticator";
import { repositoryFactory } from "./persistence/repository-factory";
import { config } from "./config";
import { runWithIdentity, type RequestIdentity } from "./identity-context";

function assertDevelopmentOnly(): void {
  const cfg = config();
  const nodeEnv = cfg.NODE_ENV;
  const runtimeMode = cfg.ISABELLA_RUNTIME_MODE;
  const devSessionEnabled = cfg.AUTH_DEV_SESSION_ENABLED;
  if (nodeEnv !== "development" || runtimeMode !== "development" || devSessionEnabled !== true) {
    throw new Error(
      "[SovereignGuard Violation] Intento ilícito de activar fallback de desarrollo en entorno de producción/producción-crítica.",
    );
  }
}

export class PrincipalContext {
  public readonly userId: string;
  public readonly username: string;
  public readonly tenantId: string;
  public readonly role: Role;
  public readonly scope: string;
  public readonly ip: string;
  public readonly traceId: string;
  public readonly correlationId: string;
  public readonly tenant: { id: string; slug: string; tier: string; quotaBalance: number };

  private constructor(
    claims: TokenClaims,
    tenant: { id: string; slug: string; tier: string; quotaBalance: number },
    username: string,
    ip: string,
    traceId: string,
    correlationId: string,
  ) {
    this.userId = claims.sub;
    this.username = username;
    this.tenantId = claims.tenantId;
    this.role = claims.role as Role;
    this.scope = claims.scope;
    this.ip = ip;
    this.traceId = traceId;
    this.correlationId = correlationId;
    this.tenant = tenant;
  }

  /** Identidad compacta para el request-context (P0-13: persistencia tenant-scoped). */
  public toRequestIdentity(): RequestIdentity {
    return {
      userId: this.userId,
      role: this.role,
      tenantId: this.tenantId,
      scope: this.scope,
    };
  }

  public static async authorize(
    request: Request,
    requiredScope?: string,
  ): Promise<
    { success: true; context: PrincipalContext } | { success: false; response: Response }
  > {
    const ip = SecuritySystem.resolveClientIp(request);
    const telemetry = SecuritySystem.generateTelemetry(ip, "allowed");
    const headers = SecuritySystem.injectSecureHeaders(
      new Headers({ "content-type": "application/json" }),
    );

    const limitCheck = SecuritySystem.checkRateLimit(ip);
    if (!limitCheck.allowed) {
      return {
        success: false,
        response: new Response(
          JSON.stringify({
            error: "SovereignGate Rate-Limit: Demasiadas solicitudes desde esta IP de origen.",
            traceId: telemetry.traceId,
          }),
          { status: 429, headers },
        ),
      };
    }

    const hasApiKey =
      request.headers.has("x-isabella-api-key") || request.headers.has("X-Isabella-API-Key");
    if (hasApiKey) {
      const authResult = await ApiKeyAuthenticator.authenticate(request);
      if (!authResult.success) {
        return {
          success: false,
          response: new Response(
            JSON.stringify({
              error: `Acceso Denegado API Key: Credencial inválida, expirada o revocada (${authResult.error}).`,
              traceId: telemetry.traceId,
            }),
            { status: 401, headers },
          ),
        };
      }

      const principal = authResult.principal;
      const apiKeyIdentity: RequestIdentity = {
        userId: principal.subject,
        role: principal.role,
        tenantId: principal.tenantId,
        scope: principal.scopes.join(" "),
      };
      return runWithIdentity(apiKeyIdentity, async () => {
        const tenantRecord = await repositoryFactory
          .getTenantRepository()
          .read(principal.tenantId, principal.tenantId);
        const tenant = tenantRecord
          ? {
              id: tenantRecord.id,
              slug: tenantRecord.slug,
              tier: tenantRecord.tier,
              quotaBalance: tenantRecord.quotaBalance,
            }
          : { id: principal.tenantId, slug: "", tier: "free", quotaBalance: 0 };

        if (!tenantRecord) {
          return {
            success: false,
            response: new Response(
              JSON.stringify({
                error:
                  "Aislamiento de Tenant Violado: El Tenant asignado a la API Key no está registrado.",
                traceId: telemetry.traceId,
              }),
              { status: 403, headers },
            ),
          };
        }

        if (requiredScope && !principal.scopes.includes(requiredScope)) {
          return {
            success: false,
            response: new Response(
              JSON.stringify({
                error: `Privilegios Insuficientes: Ámbito '${requiredScope}' requerido para esta API Key.`,
                traceId: telemetry.traceId,
              }),
              { status: 403, headers },
            ),
          };
        }

        const expMillis = principal.expiresAt
          ? new Date(principal.expiresAt).getTime()
          : Date.now() + 24 * 60 * 60 * 1000;

        const claims: TokenClaims = {
          iss: "isabella.sovereign.api-keys",
          sub: principal.subject,
          aud: principal.tenantId,
          exp: Math.floor(expMillis / 1000),
          tenantId: principal.tenantId,
          role: principal.role,
          scope: principal.scopes.join(" "),
        };

        const context = new PrincipalContext(
          claims,
          tenant,
          "api_key_session",
          ip,
          telemetry.traceId,
          telemetry.correlationId,
        );

        return { success: true, context };
      });
    }

    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const isGuestAllowed = (() => {
        try {
          const cfg = config() as unknown as Record<string, unknown>;
          return (
            cfg.ALLOW_GUEST_CHAT === true ||
            (cfg.NODE_ENV === "development" && cfg.AUTH_DEV_SESSION_ENABLED === true)
          );
        } catch {
          // Sin fallback a process.env (§12: config() es la única vía).
          // Si la configuración no carga, no hay invitados: fail-closed.
          return false;
        }
      })();
      const canGuest = isGuestAllowed && (!requiredScope || requiredScope === "isabella:chat");
      if (canGuest) {
        const guestClaims: TokenClaims = {
          iss: "isabella.guest",
          sub: "guest_user",
          aud: "nodo_cero_rdm",
          exp: Math.floor(Date.now() / 1000) + 3600,
          tenantId: "nodo_cero_rdm",
          role: "Guest" as Role,
          scope: "isabella:chat",
        };
        const guestTenant = {
          id: "nodo_cero_rdm",
          slug: "nodo-cero",
          tier: "sovereign",
          quotaBalance: 0,
        };
        const guestContext = new PrincipalContext(
          guestClaims,
          guestTenant as unknown as {
            id: string;
            slug: string;
            tier: string;
            quotaBalance: number;
          },
          "guest_user",
          ip,
          telemetry.traceId,
          telemetry.correlationId,
        );
        return { success: true, context: guestContext };
      }
      const isDevFallback = (() => {
        try {
          const cfg = config() as unknown as Record<string, unknown>;
          return cfg.NODE_ENV === "development" && cfg.AUTH_DEV_SESSION_ENABLED === true;
        } catch {
          // Sin fallback a process.env (§12). Config inválida = sin bypass de desarrollo.
          return false;
        }
      })();
      if (isDevFallback) {
        assertDevelopmentOnly();
        const mockClaims: TokenClaims = {
          iss: "isabella.dev",
          sub: "dev_user",
          aud: "tenant-dev",
          exp: Math.floor(Date.now() / 1000) + 3600,
          tenantId: "tenant-dev",
          role: "SovereignOwner" as Role,
          scope: "isabella:chat isabella:voice isabella:tools",
        };
        const mockTenant = { id: "tenant-dev", slug: "dev", tier: "sovereign", quotaBalance: 9999 };
        const mockContext = new PrincipalContext(
          mockClaims,
          mockTenant as unknown as { id: string; slug: string; tier: string; quotaBalance: number },
          "dev_user",
          ip,
          telemetry.traceId,
          telemetry.correlationId,
        );
        return { success: true, context: mockContext };
      }
      return {
        success: false,
        response: new Response(
          JSON.stringify({
            error:
              "No Autorizado OIDC: Falta la firma criptográfica Bearer en la cabecera o la cabecera X-Isabella-API-Key.",
            traceId: telemetry.traceId,
          }),
          { status: 401, headers },
        ),
      };
    }

    const token = authHeader.replace("Bearer ", "");
    const verification = SecuritySystem.verifyToken(token);
    if (!verification.success || !verification.claims) {
      const isGuestAllowed = (() => {
        try {
          const cfg = config() as unknown as Record<string, unknown>;
          return cfg.ALLOW_GUEST_CHAT === true;
        } catch {
          // Sin fallback a process.env (§12): fail-closed.
          return false;
        }
      })();
      if (isGuestAllowed && (!requiredScope || requiredScope === "isabella:chat")) {
        const guestClaims: TokenClaims = {
          iss: "isabella.guest",
          sub: "guest_user",
          aud: "nodo_cero_rdm",
          exp: Math.floor(Date.now() / 1000) + 3600,
          tenantId: "nodo_cero_rdm",
          role: "Guest" as Role,
          scope: "isabella:chat",
        };
        const guestTenant = {
          id: "nodo_cero_rdm",
          slug: "nodo-cero",
          tier: "sovereign",
          quotaBalance: 0,
        };
        const guestContext = new PrincipalContext(
          guestClaims,
          guestTenant as unknown as {
            id: string;
            slug: string;
            tier: string;
            quotaBalance: number;
          },
          "guest_user",
          ip,
          telemetry.traceId,
          telemetry.correlationId,
        );
        return { success: true, context: guestContext };
      }
      const isDevFallback = (() => {
        try {
          const cfg = config() as unknown as Record<string, unknown>;
          return cfg.NODE_ENV === "development" && cfg.AUTH_DEV_SESSION_ENABLED === true;
        } catch {
          // Sin fallback a process.env (§12). Config inválida = sin bypass de desarrollo.
          return false;
        }
      })();
      if (isDevFallback) {
        assertDevelopmentOnly();
        const mockClaims: TokenClaims = {
          iss: "isabella.dev",
          sub: "dev_user",
          aud: "tenant-dev",
          exp: Math.floor(Date.now() / 1000) + 3600,
          tenantId: "tenant-dev",
          role: "SovereignOwner" as Role,
          scope: "isabella:chat isabella:voice isabella:tools",
        };
        const mockTenant = { id: "tenant-dev", slug: "dev", tier: "sovereign", quotaBalance: 9999 };
        const mockContext = new PrincipalContext(
          mockClaims,
          mockTenant as unknown as { id: string; slug: string; tier: string; quotaBalance: number },
          "dev_user",
          ip,
          telemetry.traceId,
          telemetry.correlationId,
        );
        return { success: true, context: mockContext };
      }
      return {
        success: false,
        response: new Response(
          JSON.stringify({
            error: `Acceso Denegado: Credencial corrupta o adulterada. ${verification.error || ""}`,
            traceId: telemetry.traceId,
          }),
          { status: 401, headers },
        ),
      };
    }

    const claims = { ...verification.claims } as TokenClaims;
    if (claims.role === "Guest" || (claims.role as string) === "guest") {
      claims.scope = "isabella:chat";
    }

    if (requiredScope) {
      const scopeCheck = SecuritySystem.verifyApiScope(token, requiredScope);
      if (!scopeCheck.allowed) {
        return {
          success: false,
          response: new Response(
            JSON.stringify({
              error: `Privilegios Insuficientes: Ámbito '${requiredScope}' requerido en el OIDC token.`,
              traceId: telemetry.traceId,
            }),
            { status: 403, headers },
          ),
        };
      }
    }

    const identity: RequestIdentity = {
      userId: claims.sub,
      role: claims.role,
      tenantId: claims.tenantId,
      scope: claims.scope,
    };

    return runWithIdentity(identity, async () => {
      const tenantRecord = await repositoryFactory
        .getTenantRepository()
        .read(claims.tenantId, claims.tenantId);
      const tenant = tenantRecord
        ? {
            id: tenantRecord.id,
            slug: tenantRecord.slug,
            tier: tenantRecord.tier,
            quotaBalance: tenantRecord.quotaBalance,
          }
        : { id: claims.tenantId, slug: "", tier: "free", quotaBalance: 0 };

      if (!tenantRecord) {
        return {
          success: false,
          response: new Response(
            JSON.stringify({
              error:
                "Aislamiento de Tenant Violado: El Tenant asignado al token no está registrado.",
              traceId: telemetry.traceId,
            }),
            { status: 403, headers },
          ),
        };
      }

      // P0-02: validar la sesión por token_jti (claims.jti), NUNCA por comparar el
      // JWT completo contra sessions.id. La tabla SQL define id uuid y token_jti uuid.
      const jti = (claims as unknown as Record<string, unknown>).jti as string | undefined;
      const { items: sessions } = await repositoryFactory
        .getSessionRepository()
        .list(claims.tenantId, { userId: claims.sub });
      let session;
      if (jti) {
        session = sessions.find((s) => {
          const rec = s as unknown as Record<string, unknown>;
          const sessionJti = rec.tokenJti ?? rec.token_jti;
          return String(sessionJti) === jti;
        });
      }
      if (!session) {
        return {
          success: false,
          response: new Response(
            JSON.stringify({
              error:
                "Acceso Denegado: La sesión asociada al token ya no se encuentra activa en el nodo.",
              traceId: telemetry.traceId,
            }),
            { status: 401, headers },
          ),
        };
      }

      const context = new PrincipalContext(
        claims,
        tenant,
        ((session as unknown as Record<string, unknown>).username as string) ?? "",
        ip,
        telemetry.traceId,
        telemetry.correlationId,
      );

      return { success: true, context };
    });
  }
}

export function withSovereignAuth(
  resource: Resource,
  action: Action,
  handler: (context: PrincipalContext, request: Request, body?: unknown) => Promise<Response>,
) {
  return async ({ request }: { request: Request }): Promise<Response> => {
    const requiredScope =
      resource === "system" && action === "execute" ? "isabella:chat" : undefined;
    const authResult = await PrincipalContext.authorize(request, requiredScope);
    if (!authResult.success) {
      return authResult.response;
    }

    const { context } = authResult;

    // P0 deployment: in production, resynchronize the SovereignDB in-memory
    // cache from durable PostgreSQL so every request observes the latest
    // cross-instance state before any read-modify-write.
    const { SovereignDB } = await import("./sovereign-engine");
    await SovereignDB.hydrate();

    const authReq: AuthorizationContext = {
      tenant_id: context.tenantId,
      subject_id: context.userId,
      action: action,
      resource: resource,
      role: context.role,
      authenticated: true,
      context: {
        ip_address: request.headers.get("x-forwarded-for") ?? "127.0.0.1",
        user_agent: request.headers.get("user-agent") ?? "unknown",
        timestamp: new Date(),
      },
    };

    const decisionResult = await evaluateAuthorization(authReq);
    if (!decisionResult.allow) {
      const headers = SecuritySystem.injectSecureHeaders(
        new Headers({ "content-type": "application/json" }),
      );
      return new Response(
        JSON.stringify({
          error: `Acceso Denegado por Política Centralizada: Privilegios insuficientes para la operación (${resource}:${action}).`,
          traceId: context.traceId,
        }),
        { status: 403, headers },
      );
    }

    // P0-04: CROWN MANDATORY POLICY ENGINE
    // Asegurar que TODA operación de db/estado pase por CROWN, incluso para el SovereignOwner.
    const { CROWN, assessIntent, evaluatePolicy, createDefaultContext } = await import("./crown");
    const intent = assessIntent(`API Operation: ${resource}:${action}`);
    const identityAssessment = {
      authenticated: true,
      roles: [context.role],
      permissions: context.scope ? context.scope.split(" ") : [],
      dataScopes: ["territorial"] as any,
    };
    const reqContext = createDefaultContext(`API Operation: ${resource}:${action}`, {
      actorId: context.userId,
      sessionId: context.traceId,
    });

    const policyResult = evaluatePolicy(reqContext, intent, identityAssessment);

    if (policyResult.status === "denied") {
      const headers = SecuritySystem.injectSecureHeaders(
        new Headers({ "content-type": "application/json" }),
      );
      return new Response(
        JSON.stringify({
          error: `Acceso Denegado por CROWN (Constitutional Gate): Operación bloqueada por riesgo estructural.`,
          reasons: policyResult.reasons,
          traceId: context.traceId,
        }),
        { status: 403, headers },
      );
    }

    let body: unknown = null;
    if (request.method === "POST" || request.method === "PUT" || request.method === "PATCH") {
      const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
      if (contentLength > 5 * 1024 * 1024) {
        // 5MB limit
        const headers = SecuritySystem.injectSecureHeaders(
          new Headers({ "content-type": "application/json" }),
        );
        return new Response(JSON.stringify({ error: "Payload too large. Max size is 5MB." }), {
          status: 413,
          headers,
        });
      }
      try {
        if (request.headers.get("content-type")?.includes("application/json")) {
          const cloned = request.clone();
          body = await cloned.json();
        }
      } catch {
        // Ignore parsing error, handler can handle it or request may be non-json
      }
    }

    return runWithIdentity(context.toRequestIdentity(), () => handler(context, request, body));
  };
}
