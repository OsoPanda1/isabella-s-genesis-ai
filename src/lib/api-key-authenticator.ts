import { ApiKeyService } from "./api-key-service";
import type { AuthenticatedPrincipal } from "./credential-types";

/**
 * AUTENTICADOR DE API KEYS PERIMETRAL
 * Extrae y valida credenciales del header X-Isabella-API-Key para construir el contexto principal.
 */
export class ApiKeyAuthenticator {
  private static readonly HEADER_NAME = "x-isabella-api-key";

  /**
   * Intenta autenticar la solicitud entrante utilizando la cabecera de API Key.
   */
  public static async authenticate(
    request: Request,
  ): Promise<{ success: true; principal: AuthenticatedPrincipal } | { success: false; error: string }> {
    const rawHeader =
      request.headers.get(this.HEADER_NAME) || request.headers.get("X-Isabella-API-Key");

    if (!rawHeader) {
      return { success: false, error: "missing_header" };
    }

    const verification = await ApiKeyService.verifyApiKey(rawHeader);
    if (!verification.success || !verification.record) {
      return { success: false, error: verification.error || "unauthorized" };
    }

    const record = verification.record;

    const principal: AuthenticatedPrincipal = {
      subject: record.owner_id,
      tenantId: record.tenant_id,
      role: record.role,
      scopes: record.scopes || [],
      credentialId: record.id,
      credentialType: "api_key",
      issuedAt: record.created_at,
      authenticationMethod: "api_key_header",
      ...(record.expires_at ? { expiresAt: record.expires_at } : {}),
    };

    return { success: true, principal };
  }
}
