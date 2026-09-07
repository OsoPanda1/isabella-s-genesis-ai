/**
 * REPOSITORIO DE AUDITORÍA (src/lib/repositories/audit-repository.ts)
 * -----------------------------------------------------------------
 * Registro de auditoría append-only con cadena criptográfica real.
 * Sin mockdata:
 *  - Cada evento encadena con el hash del anterior (anti-tampering).
 *  - Persistencia real en disco (`node:fs`).
 *  - Nunca se edita ni elimina un evento ya registrado.
 *
 * Este repositorio es la única autoridad de persistencia de auditoría;
 * la decisión de qué se audita la determina el pipeline soberano.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

export type AuditSeverity = "S0" | "S1" | "S2" | "S3";

export interface AuditEvent {
  id: string;
  timestamp: string;
  traceId: string;
  correlationId: string;
  actorIp: string;
  event: string;
  severity: AuditSeverity;
  details: string;
  remediated: boolean;
  verificationHash: string;
  previousLogHash: string;
}

export interface AuditStoreFile {
  events: AuditEvent[];
  genesisPreviousHash: string;
}

const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";
const STORE_PATH = path.join(process.cwd(), "isabella_audit_store.json");

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Crea un repositorio de auditoría ligado a una ruta opcional (inyectable).
 */
export function createAuditRepository(storePath: string = STORE_PATH) {
  function loadStore(): AuditStoreFile {
    if (!fs.existsSync(storePath)) {
      return { events: [], genesisPreviousHash: GENESIS_HASH };
    }
    try {
      const raw = fs.readFileSync(storePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<AuditStoreFile>;
      const events = Array.isArray(parsed.events) ? (parsed.events as AuditEvent[]) : [];
      return {
        events,
        genesisPreviousHash:
          typeof parsed.genesisPreviousHash === "string"
            ? parsed.genesisPreviousHash
            : GENESIS_HASH,
      };
    } catch {
      return { events: [], genesisPreviousHash: GENESIS_HASH };
    }
  }

  function saveStore(store: AuditStoreFile): void {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf-8");
  }

  return {
    /** Registra un evento de auditoría, encadenado al anterior. */
    append(input: {
      traceId: string;
      correlationId: string;
      actorIp: string;
      event: string;
      severity: AuditSeverity;
      details: string;
      remediated?: boolean;
    }): AuditEvent {
      const store = loadStore();
      const prev = store.events[0];
      const previousLogHash = prev?.verificationHash ?? store.genesisPreviousHash;
      const id = `evt_${crypto.randomUUID()}`;
      const timestamp = new Date().toISOString();
      const remediated = input.remediated ?? (input.severity === "S1" || input.severity === "S2");
      const payload = `${id}|${timestamp}|${input.traceId}|${input.correlationId}|${input.actorIp}|${input.event}|${input.severity}|${input.details}|${remediated ? "true" : "false"}|${previousLogHash}`;
      const verificationHash = sha256(payload);
      const event: AuditEvent = {
        id,
        timestamp,
        traceId: input.traceId,
        correlationId: input.correlationId,
        actorIp: input.actorIp,
        event: input.event,
        severity: input.severity,
        details: input.details,
        remediated,
        verificationHash,
        previousLogHash,
      };
      store.events.unshift(event);
      saveStore(store);
      return event;
    },

    list(limit = 200): AuditEvent[] {
      return loadStore().events.slice(0, limit);
    },

    /** Verifica la integridad cronológica de la cadena. */
    verifyChain(): { success: boolean; error?: string; corruptedId?: string } {
      const store = loadStore();
      const logs = [...store.events].reverse();
      let prev = store.genesisPreviousHash;
      for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        if (!log) return { success: false, error: "Evento ausente.", corruptedId: "unknown" };
        const expectedPrev =
          i === 0 ? store.genesisPreviousHash : (logs[i - 1]?.verificationHash ?? "");
        if (log.previousLogHash !== expectedPrev) {
          return { success: false, error: "Cadena de auditoría rota.", corruptedId: log.id };
        }
        const payload = `${log.id}|${log.timestamp}|${log.traceId}|${log.correlationId}|${log.actorIp}|${log.event}|${log.severity}|${log.details}|${log.remediated ? "true" : "false"}|${log.previousLogHash}`;
        if (sha256(payload) !== log.verificationHash) {
          return { success: false, error: "Evento alterado.", corruptedId: log.id };
        }
        prev = log.verificationHash;
      }
      void prev;
      return { success: true };
    },
  };
}

export type AuditRepository = ReturnType<typeof createAuditRepository>;
export const AUDIT_REPOSITORY = {
  create: createAuditRepository,
};
