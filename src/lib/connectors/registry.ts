import {
  getTokenResponse,
  startAuthorization,
  UserAuthorizationRequiredError,
  type ConnectTokenResponse,
} from "@vercel/connect";

import type { PrincipalContext } from "@/lib/principal-context";
import { config } from "@/lib/config";

export type ConnectorProvider = "github" | "slack" | "linear";

type ConnectorDefinition = {
  uid: string;
  label: string;
  scopes: string[];
  apiUrl: string;
};

const CONNECTORS: Record<ConnectorProvider, ConnectorDefinition> = {
  github: {
    uid: "github/real-del-monte-digital-hub-c327091a",
    label: "GitHub",
    scopes: ["read:user", "repo"],
    apiUrl: "https://api.github.com/user",
  },
  slack: {
    uid: "slack/isabella-slack-user-connector",
    label: "Slack",
    scopes: ["search:read"],
    apiUrl: "https://slack.com/api/auth.test",
  },
  linear: {
    uid: "linear/isabella-ai-genesis",
    label: "Linear",
    scopes: ["read"],
    apiUrl: "https://api.linear.app/graphql",
  },
};

export function getConnectorDefinition(provider: ConnectorProvider): ConnectorDefinition {
  return CONNECTORS[provider];
}

function subject(context: PrincipalContext) {
  return { type: "user" as const, id: context.userId, issuer: "isabella" };
}

function origin(request: Request): string {
  const environment = config() as typeof config extends () => infer T
    ? T & Record<string, string | undefined>
    : never;
  if (environment.NODE_ENV !== "production" && environment.V0_RUNTIME_URL) {
    return environment.V0_RUNTIME_URL;
  }
  if (environment.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${environment.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (environment.VERCEL_URL) return `https://${environment.VERCEL_URL}`;
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (!forwardedHost) throw new Error("CONNECT_ORIGIN_UNAVAILABLE");
  return `${forwardedProto}://${forwardedHost}`;
}

export async function beginAuthorization(
  provider: ConnectorProvider,
  context: PrincipalContext,
  request: Request,
) {
  const definition = getConnectorDefinition(provider);
  return startAuthorization(
    definition.uid,
    { subject: subject(context), scopes: definition.scopes },
    { callbackUrl: `${origin(request)}/api/connect/${provider}/callback` },
  );
}

export async function providerToken(
  provider: ConnectorProvider,
  context: PrincipalContext,
): Promise<ConnectTokenResponse> {
  const definition = getConnectorDefinition(provider);
  return getTokenResponse(definition.uid, {
    subject: subject(context),
    scopes: definition.scopes,
  });
}

export async function providerRequest(
  provider: ConnectorProvider,
  context: PrincipalContext,
): Promise<{ response: Response; token: ConnectTokenResponse }> {
  const definition = getConnectorDefinition(provider);
  const token = await providerToken(provider, context);
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${token.token}`,
  });
  if (provider === "linear") headers.set("content-type", "application/json");
  const response = await fetch(definition.apiUrl, {
    method: provider === "linear" ? "POST" : "GET",
    headers,
    body:
      provider === "linear"
        ? JSON.stringify({ query: "query Viewer { viewer { id name email } }" })
        : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  return { response, token };
}

export function isAuthorizationRequired(error: unknown): boolean {
  return error instanceof UserAuthorizationRequiredError;
}

export function isConnectorProvider(value: string): value is ConnectorProvider {
  return value === "github" || value === "slack" || value === "linear";
}
