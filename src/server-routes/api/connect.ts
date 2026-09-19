import { json } from "@tanstack/react-start";
import { withSovereignAuth } from "@/lib/principal-context";
import {
  beginAuthorization,
  isAuthorizationRequired,
  isConnectorProvider,
  providerRequest,
  type ConnectorProvider,
} from "@/lib/connectors/registry";

function providerFrom(request: Request): ConnectorProvider | null {
  const provider = new URL(request.url).searchParams.get("provider") ?? "";
  return isConnectorProvider(provider) ? provider : null;
}

function protectedHandler(
  operation: (
    context: Parameters<Parameters<typeof withSovereignAuth>[2]>[0],
    request: Request,
    provider: ConnectorProvider,
  ) => Promise<Response>,
) {
  return withSovereignAuth("system", "execute", async (context, request) => {
    if (context.role === "Guest") {
      return json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    }
    const provider = providerFrom(request);
    if (!provider) return json({ error: "UNSUPPORTED_CONNECTOR" }, { status: 400 });
    return operation(context, request, provider);
  });
}

export const start = protectedHandler(async (context, request, provider) => {
  try {
    const authorization = await beginAuthorization(provider, context, request);
    return json({ provider, url: authorization.url, expiresAt: authorization.expiresAt });
  } catch (error) {
    return json(
      { error: "CONNECT_AUTHORIZATION_UNAVAILABLE", retryable: isAuthorizationRequired(error) },
      { status: 503 },
    );
  }
});

export const status = protectedHandler(async (context, request, provider) => {
  try {
    const { response, token } = await providerRequest(provider, context);
    const data = await response.json().catch(() => null);
    return json(
      { provider, connected: response.ok, expiresAt: token.expiresAt, data },
      { status: response.ok ? 200 : 502 },
    );
  } catch (error) {
    return json(
      {
        provider,
        connected: false,
        error: isAuthorizationRequired(error) ? "AUTHORIZATION_REQUIRED" : "CONNECTOR_UNAVAILABLE",
      },
      { status: isAuthorizationRequired(error) ? 401 : 503 },
    );
  }
});

export async function webhook(request: Request, provider: ConnectorProvider): Promise<Response> {
  const eventId = request.headers.get("x-vercel-connect-event-id");
  if (!eventId || eventId.length > 256) {
    return json({ accepted: false, error: "CONNECT_EVENT_ID_REQUIRED" }, { status: 400 });
  }

  // Vercel Connect performs provider verification before forwarding this route.
  // Isabella records only bounded correlation metadata until an idempotent event
  // ledger is introduced; provider payloads are never echoed to the client.
  return json({ accepted: true, provider, eventId, governed: true });
}
