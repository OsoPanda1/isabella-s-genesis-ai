/**
 * Telemetría neutral — universal (navegador y runtime edge).
 * Usa WebCrypto; `node:crypto` no existe en el cliente.
 */

/** Huella corta y estable para acotar valores largos (no criptográfica). */
function shortFingerprint(value: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x27d4eb2f;
  for (let i = 0; i < value.length; i++) {
    h1 = Math.imul(h1 ^ value.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + value.charCodeAt(i) + i, 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 12);
}

function randomUUID(): string {
  return globalThis.crypto.randomUUID();
}

export type MetricKind = "request" | "inference" | "policy" | "security" | "error";
export interface OTelEvent {
  traceId: string;
  kind: MetricKind;
  name: string;
  durationMs?: number;
  status: "ok" | "error" | "denied" | "degraded";
  attributes: Record<string, string | number | boolean>;
  timestamp: string;
}
const ALLOWED_KEYS = new Set([
  "route",
  "method",
  "runtime",
  "model",
  "locale",
  "decision",
  "error_code",
  "tenant_class",
]);
const MAX_ATTR_VALUE = 64;
function bucket(value: string | number | boolean): string | number | boolean {
  if (typeof value !== "string") return value;
  return value.length > MAX_ATTR_VALUE ? shortFingerprint(value) : value;
}
export function createTraceId(): string {
  return randomUUID().replaceAll("-", "");
}
export function normalizeAttributes(
  input: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([key]) => ALLOWED_KEYS.has(key))
      .map(([key, value]) => [key, bucket(value)]),
  );
}
export function createOTelEvent(
  input: Omit<OTelEvent, "timestamp" | "attributes"> & {
    attributes?: Record<string, string | number | boolean>;
  },
): OTelEvent {
  return {
    ...input,
    traceId: input.traceId || createTraceId(),
    attributes: normalizeAttributes(input.attributes ?? {}),
    timestamp: new Date().toISOString(),
  };
}
export function toOTelLog(event: OTelEvent): string {
  return JSON.stringify({
    time: event.timestamp,
    trace_id: event.traceId,
    event: event.name,
    kind: event.kind,
    duration_ms: event.durationMs,
    status: event.status,
    attributes: event.attributes,
  });
}
