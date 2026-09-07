import { createHash, randomUUID } from "node:crypto";

// ============================================================================
// DOMINIO DE AUDITORÍA (src/lib/domains/audit-event.ts)
// ----------------------------------------------------------------------------
// Auditoría transaccional, append-only, con hash chaining (FASE 2.3).
// Cada evento se encadena criptográficamente con el anterior (SHA-256).
// ============================================================================

export type AuditSeverity = "S0" | "S1" | "S2" | "S3";
export type AuditResult = "success" | "failure" | "denied";

export interface AuditEventDomain {
  action: string;
  resource: string;
  actor: string;
  actorIp?: string;
  result: AuditResult;
  details: Record<string, unknown>;
  tenantId: string;
  severity: AuditSeverity;
  timestamp: Date;
}

export interface AuditEventRow {
  id: string;
  tenant_id: string;
  event: string;
  actor: string;
  actor_ip: string | null;
  details: string;
  result: string;
  severity: string;
  verification_hash: string;
  previous_log_hash: string | null;
  timestamp: string;
}

/** Construye la carga canónica que se firma con SHA-256. */
export function auditPayload(event: AuditEventDomain, previousHash: string | null): string {
  return JSON.stringify({
    action: event.action,
    resource: event.resource,
    actor: event.actor,
    result: event.result,
    details: event.details,
    tenantId: event.tenantId,
    severity: event.severity,
    timestamp: event.timestamp.toISOString(),
    previous_log_hash: previousHash,
  });
}

/** Calcula el hash de verificación del evento (con encadenado). */
export function computeVerificationHash(
  event: AuditEventDomain,
  previousHash: string | null,
): string {
  return createHash("sha256").update(auditPayload(event, previousHash)).digest("hex");
}

/** Mapea el evento de dominio a la fila persistible (snake_case). */
export function mapAuditEventToRow(
  event: AuditEventDomain,
  previousHash: string | null,
): AuditEventRow {
  const verificationHash = computeVerificationHash(event, previousHash);
  return {
    id: event.resource ? `audit_${randomUUID().slice(0, 8)}` : randomUUID(),
    tenant_id: event.tenantId,
    event: event.action,
    actor: event.actor,
    actor_ip: event.actorIp ?? null,
    details: JSON.stringify(event.details),
    result: event.result,
    severity: event.severity,
    verification_hash: verificationHash,
    previous_log_hash: previousHash,
    timestamp: event.timestamp.toISOString(),
  };
}

/** Mapea una fila persistida de vuelta al dominio. */
export function mapAuditRowToDomain(row: AuditEventRow): AuditEventDomain {
  const domain: AuditEventDomain = {
    action: row.event,
    resource: row.event,
    actor: row.actor,
    result: (row.result as AuditResult) ?? "success",
    details: safeParseDetails(row.details),
    tenantId: row.tenant_id,
    severity: (row.severity as AuditSeverity) ?? "S1",
    timestamp: new Date(row.timestamp),
  };
  if (row.actor_ip) domain.actorIp = row.actor_ip;
  return domain;
}

function safeParseDetails(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : { value: raw };
  } catch {
    return { raw };
  }
}
