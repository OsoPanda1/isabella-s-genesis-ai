import { SecuritySystem } from "./security";
import { PrincipalContext } from "./principal-context";
import { evaluateAuthorization, type AuthorizationContext } from "./authorization";
import type { Resource, Action } from "./permission-matrix";
import { runWithIdentity } from "./identity-context";

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
      safeParse: (data: unknown) => {
        success: boolean;
        data?: T;
        error?: { message: string };
      };
    },
    handler: (context: PrincipalContext, data: T) => Promise<Response>,
  ): Promise<Response> {
    const headers = SecuritySystem.injectSecureHeaders(
      new Headers({ "content-type": "application/json" }),
    );
    const method = request.method.toUpperCase();
    const bodyMethods = new Set(["POST", "PUT", "PATCH"]);
    const maxBodyBytes = 512 * 1024;
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (bodyMethods.has(method) && Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
      return new Response(JSON.stringify({ error: "Payload excede el límite permitido." }), {
        status: 413,
        headers,
      });
    }

    // 1. Autenticación y resolución de Principal Context
    const authResult = await PrincipalContext.authorize(request);
    if (!authResult.success) {
      return authResult.response;
    }

    const { context } = authResult;

    // 2. Control de acceso centralizado (RBAC/ABAC/Tenant Isolation)
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
      return new Response(
        JSON.stringify({
          error: `Acceso Denegado: Privilegios insuficientes para la operación (${resource}:${action}).`,
          traceId: context.traceId,
        }),
        { status: 403, headers },
      );
    }

    // 3. Procesamiento seguro de payload de entrada
    let parsedData: T = {} as T;
    if (bodyMethods.has(method)) {
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
          JSON.stringify({
            error: "Payload corrupto detectado por la puerta de enlace.",
          }),
          { status: 400, headers },
        );
      }
    }

    // 4. Delegación a la lógica de negocio final (con identidad en request-context)
    return runWithIdentity(context.toRequestIdentity(), () => handler(context, parsedData));
  }
}
