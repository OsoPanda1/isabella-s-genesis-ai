import { randomUUID } from "node:crypto";

export interface TraceContext {
  traceId: string;
  correlationId: string;
  actorId: string;
  tenantId: string;
  timestamp: string;
}

/**
 * Injects traceId, correlationId, and actorId into the request context.
 * Propagates headers across the Cognitive Orchestra and C.R.O.W.N layers.
 */
export function injectTelemetry<T extends (...args: unknown[]) => unknown>(handler: T) {
  return async (req: Request, ...args: Parameters<T>) => {
    const traceId = req.headers.get("x-trace-id") || randomUUID();
    const correlationId = req.headers.get("x-correlation-id") || randomUUID();
    const actorId = req.headers.get("x-actor-id") || "anonymous";
    const tenantId = req.headers.get("x-tenant-id") || "default-tenant";

    // Create a new Request object with the injected headers
    const headers = new Headers(req.headers);
    headers.set("x-trace-id", traceId);
    headers.set("x-correlation-id", correlationId);
    headers.set("x-actor-id", actorId);
    headers.set("x-tenant-id", tenantId);

    const reqWithTelemetry = new Request(req.url, {
      method: req.method,
      headers: headers,
      body: req.body,
      duplex: "half", // required for node fetch with body streams
    } as RequestInit & { duplex: "half" });

    return handler(reqWithTelemetry, ...args);
  };
}
