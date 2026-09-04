import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * CONTEXTO ÚNICO POR REQUEST (src/lib/request-context.ts)
 * -----------------------------------------------------------------
 * Propaga un contexto inmutable por request (traceId, correlationId,
 * tiempos, origen) mediante AsyncLocalStorage para observabilidad y
 * auditoría correlacionable. Creado en server.ts (correlación) antes
 * de cualquier lógica de handler.
 */

export interface RequestContextData {
  traceId: string;
  correlationId: string;
  requestId: string;
  startedAt: number;
  clientIp?: string;
  method?: string;
  path?: string;
  route?: string;
}

export const requestStore = new AsyncLocalStorage<RequestContextData>();

function genId(): string {
  return randomUUID().replace(/-/g, "");
}

export function createRequestContext(
  partial: Partial<Pick<RequestContextData, "clientIp" | "method" | "path" | "route">> = {},
): RequestContextData {
  return {
    traceId: genId(),
    correlationId: genId(),
    requestId: genId(),
    startedAt: Date.now(),
    ...partial,
  };
}

/**
 * Ejecuta la función dentro del contexto de request (AsyncLocalStorage.run).
 * Todo lo que se ejecute dentro (repositorios, audit, ledgers) podrá
 * recuperar el contexto con `getRequestContext()`.
 */
export function withRequestContext<T>(
  ctx: RequestContextData,
  fn: () => T | Promise<T>,
): Promise<T> {
  return requestStore.run(ctx, () => Promise.resolve(fn()));
}

export function getRequestContext(): RequestContextData | null {
  return requestStore.getStore() ?? null;
}

export function getOrCreateRequestContext(): RequestContextData {
  return getRequestContext() ?? createRequestContext();
}

export function getTraceId(): string {
  return getRequestContext()?.traceId ?? "no-trace";
}

export function getCorrelationId(): string {
  return getRequestContext()?.correlationId ?? "no-correlation";
}

export function elapsedMs(ctx: RequestContextData): number {
  return Date.now() - ctx.startedAt;
}
