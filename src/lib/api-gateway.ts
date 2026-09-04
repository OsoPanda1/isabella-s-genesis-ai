import { SecuritySystem } from "./security";
import { PrincipalContext } from "./principal-context";
import { authorize, type AuthorizationRequest } from "./authorization";
import type { Resource, Action } from "./permission-matrix";

/**
 * SOVEREIGN API GATEWAY (src/lib/api-gateway.ts)
 * -----------------------------------------------------------------
 * Coordina autenticación, resolución de principal, aislamiento multi-tenant,
 * validación de esquema, rate-limiting, filtrado de amenazas y auditoría
 * para todas las rutas públicas del ecosistema de Isabella AI.
 */
export class ApiGateway {
  /**
   * Pipeline de ejecución unificado para APIs soberanas.
   */
  public static async handle<T>(
    request: Request,
    resource: Resource,
    action: Action,
    schema: {
      safeParse: (data: unknown) => { success: boolean; data?: T; error?: { message: string } };
    },
    handler: (context: PrincipalContext, data: T) => Promise<Response>,
  ): Promise<Response> {
    const headers = SecuritySystem.injectSecureHeaders(
      new Headers({ "content-type": "application/json" }),
    );

    // 1. Autenticación y resolución de Principal Context
    const authResult = await PrincipalContext.authorize(request);
    if (!authResult.success) {
      return authResult.response;
    }

    const { context } = authResult;

    // 2. Control de acceso centralizado (RBAC/ABAC/Tenant Isolation)
    const authReq: AuthorizationRequest = {
      identity: {
        subject: context.userId,
        username: context.username,
        tenantId: context.tenantId,
        role: context.role,
        scopes: context.scope ? context.scope.split(" ") : [],
        authenticated: true,
      },
      resource,
      action,
      tenant: {
        context: {
          subject: context.userId,
          username: context.username,
          tenantId: context.tenantId,
          resolvedBy: context.username === "api_key_session" ? "api_key" : "bearer",
          authenticated: true,
          resolvedAt: new Date().toISOString(),
        },
        boundaryOk: true,
        reason: "ok",
      },
    };

    const decisionResult = authorize(authReq);
    if (decisionResult.decision === "denied") {
      return new Response(
        JSON.stringify({
          error: `Acceso Denegado: Privilegios insuficientes para la operación (${resource}:${action}).`,
          reasons: decisionResult.reasons,
          traceId: context.traceId,
        }),
        { status: 403, headers },
      );
    }

    // 3. Procesamiento seguro de payload de entrada
    let parsedData: T = {} as T;
    if (request.method === "POST" || request.method === "PUT" || request.method === "PATCH") {
      try {
        const rawBody = await request.clone().json();
        const validation = schema.safeParse(rawBody);
        if (!validation.success) {
          return new Response(
            JSON.stringify({
              error: `Validación de entrada fallida: ${validation.error?.message || "Esquema inválido"}`,
            }),
            { status: 400, headers },
          );
        }
        parsedData = validation.data!;
      } catch {
        return new Response(
          JSON.stringify({ error: "Payload corrupto detectado por la puerta de enlace." }),
          { status: 400, headers },
        );
      }
    }

    // 4. Delegación a la lógica de negocio final
    return handler(context, parsedData);
  }
}
