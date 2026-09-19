import { createHash, randomUUID } from "node:crypto";

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
  return value.length > MAX_ATTR_VALUE
    ? createHash("sha256").update(value).digest("hex").slice(0, 12)
    : value;
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
