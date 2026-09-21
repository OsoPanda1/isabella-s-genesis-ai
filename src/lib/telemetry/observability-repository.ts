/**
 * Repositorio de observabilidad — PostgreSQL directo (sin Prisma).
 * SQL parametrizado y auditable sobre `public.observability_events`.
 */

import { query } from "../db";

export interface PersistedObservabilityOverview {
  eventCount: number;
  errorCount: number;
  avgLatencyMs: number;
  throughputPerMinute: number;
  latestEventAt: string | null;
  bySource: Array<{ source: string; count: number }>;
}

export async function recordObservabilityEvent(event: {
  traceId: string;
  eventType: string;
  source: string;
  durationMs?: number;
  severity?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO public.observability_events
       (trace_id, event_type, source, duration_ms, severity, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      event.traceId,
      event.eventType,
      event.source,
      event.durationMs ?? 0,
      event.severity ?? "info",
      JSON.stringify(event.payload ?? {}),
    ],
  );
}

export async function getPersistedObservabilityOverview(): Promise<PersistedObservabilityOverview> {
  const [summary, sources] = await Promise.all([
    query<{
      event_count: string;
      error_count: string;
      avg_latency_ms: number | null;
      latest_event_at: Date | string | null;
    }>(
      `SELECT
         COUNT(*)::bigint AS event_count,
         COUNT(*) FILTER (WHERE severity IN ('error', 'critical'))::bigint AS error_count,
         COALESCE(AVG(duration_ms), 0)::float AS avg_latency_ms,
         MAX(created_at) AS latest_event_at
       FROM public.observability_events
       WHERE created_at >= now() - interval '24 hours'`,
    ),
    query<{ source: string; count: string }>(
      `SELECT source, COUNT(*)::bigint AS count
       FROM public.observability_events
       WHERE created_at >= now() - interval '24 hours'
       GROUP BY source
       ORDER BY count DESC
       LIMIT 20`,
    ),
  ]);

  const result = summary[0];
  const latest = result?.latest_event_at ?? null;
  return {
    eventCount: Number(result?.event_count ?? 0),
    errorCount: Number(result?.error_count ?? 0),
    avgLatencyMs: Number(result?.avg_latency_ms ?? 0),
    throughputPerMinute: Number(result?.event_count ?? 0) / (24 * 60),
    latestEventAt: latest ? new Date(latest).toISOString() : null,
    bySource: sources.map((row) => ({ source: row.source, count: Number(row.count) })),
  };
}
