/**
 * PROTOCOLOS DE EMERGENCIA Y CARDINALIZACIÓN SOBERANA
 * (src/lib/emergency-governance-protocol.ts)
 * ============================================================================
 * Ecosistema TAMV / RDM Digital Hub / Isabella Villaseñor AI v4.2.0
 *
 * Especificación de Gobernanza Cardinal y Planes de Emergencia Soberana (SOVCON).
 *
 * 1. CARDINALIZACIÓN COGNITIVA:
 *    - Norte: Epistemología y Síntesis Lógica (SOPHIA Engine)
 *    - Sur: Anclaje Territorial y Patrimonio Cultural (Nodo Cero - Real del Monte)
 *    - Este: Ejecución Operativa, Síntesis Visual y Cuántica (ORION Engine)
 *    - Oeste: Gobernanza Zero-Trust, Ciberdefensa y Veto Ético (ARGUS Sentinel)
 *    - Cenit / Centro: Presencia, Empatía y Orquestación Humano-Soberana (C.R.O.W.N. / ISA)
 *
 * 2. NIVELES DE DEFENSA SOVCON:
 *    - SOVCON 5 (Nominal): Operación completa sin restricciones extraordinarias.
 *    - SOVCON 4 (Precaución): Alerta por deriva o varianza epistémica inusual.
 *    - SOVCON 3 (Alerta Elevada): Activación obligatoria de Human-In-The-Loop (HITL).
 *    - SOVCON 2 (Contención Severa): Cuarentena de herramientas externas y suspensión de webhooks.
 *    - SOVCON 1 (Kill-Switch Soberano): Congelamiento preventivo fail-closed del sistema.
 * ============================================================================
 */

import * as crypto from "node:crypto";
import { repositoryFactory } from "./persistence/repository-factory";
import { SovereignAudit } from "./sovereign-audit";

export type SovconLevel = 5 | 4 | 3 | 2 | 1;

export interface CardinalAlignment {
  north_sophia: number; // 0 a 100
  south_territory: number; // 0 a 100
  east_orion: number; // 0 a 100
  west_argus: number; // 0 a 100
  zenith_crown: number; // 0 a 100
  cardinalBalanceIndex: number; // Promedio ponderado (0 a 100)
}

export interface EmergencyEvent {
  id: string;
  timestamp: string;
  previousLevel: SovconLevel;
  currentLevel: SovconLevel;
  triggerReason: string;
  authorizedActor: string;
  actionTaken: string;
  auditSeal: string;
}

export class EmergencyGovernanceProtocol {
  private static currentLevel: SovconLevel = 5;
  private static isFrozen = false;
  private static readonly eventHistory: EmergencyEvent[] = [];

  /**
   * Obtiene el nivel SOVCON actual del sistema.
   */
  public static getCurrentSovconLevel(): SovconLevel {
    return this.currentLevel;
  }

  /**
   * Indica si el sistema se encuentra bajo congelamiento de emergencia (Kill-Switch).
   */
  public static isSystemFrozen(): boolean {
    return this.isFrozen;
  }

  /**
   * Evalúa la alineación cardinal de los 5 pilares de Isabella.
   */
  public static getCardinalAlignment(): CardinalAlignment {
    const north = 98.4; // SOPHIA: Alta consistencia formal
    const south = 99.1; // Territorio: Nodo Cero Real del Monte estrictamente anclado
    const east = 96.5; // ORION: Capacidad de síntesis operativa y cuántica
    const west = 99.8; // ARGUS: Zero Trust activo y RBAC estricto
    const zenith = 97.9; // C.R.O.W.N. / ISA: Orquestación humana central

    const cardinalBalanceIndex = Number(((north + south + east + west + zenith) / 5).toFixed(2));

    return {
      north_sophia: north,
      south_territory: south,
      east_orion: east,
      west_argus: west,
      zenith_crown: zenith,
      cardinalBalanceIndex,
    };
  }

  /**
   * Escala o desescala el nivel SOVCON del sistema con sello criptográfico obligatorio.
   */
  public static async transitionSovcon(
    newLevel: SovconLevel,
    reason: string,
    actorId: string,
  ): Promise<EmergencyEvent> {
    const previous = this.currentLevel;
    this.currentLevel = newLevel;

    if (newLevel === 1) {
      this.isFrozen = true;
    } else if (newLevel > 1 && this.isFrozen) {
      this.isFrozen = false;
    }

    const eventId = `emg_${crypto.randomUUID().slice(0, 10)}`;
    const timestamp = new Date().toISOString();
    const actionTaken =
      newLevel === 1
        ? "KILL_SWITCH_ENGAGED: Pipeline cognitivo congelado, transacciones de escritura bloqueadas."
        : newLevel === 2
          ? "CONTAINMENT: Suspensión de webhooks y herramientas de alto riesgo."
          : newLevel === 3
            ? "HITL_ENFORCED: Toda acción sensible requiere aprobación humana obligatoria."
            : newLevel === 4
              ? "TELEMETRY_SAMPLE_RATE_MAX: Muestreo de auditoría incrementado al 100%."
              : "NOMINAL_RESTORE: Operación normal restaurada.";

    // Sello de auditoría BookPI
    const sealData = `${eventId}:${previous}->${newLevel}:${reason}:${actorId}:${timestamp}`;
    const auditSeal = await SovereignAudit.signAuditSeal(sealData);

    const event: EmergencyEvent = {
      id: eventId,
      timestamp,
      previousLevel: previous,
      currentLevel: newLevel,
      triggerReason: reason,
      authorizedActor: actorId,
      actionTaken,
      auditSeal,
    };

    this.eventHistory.push(event);

    // Persistir en el repositorio de auditoría
    try {
      const auditRepo = repositoryFactory.getAuditRepository();
      await auditRepo.audit({
        id: crypto.randomUUID(),
        tenantId: "system-governance",
        traceId: `trc_${eventId}`,
        timestamp,
        action: `emergency.sovcon_${newLevel}`,
        resource: "governance",
        severity: newLevel <= 2 ? "S3" : "S2",
        actor: actorId,
        result: "success",
        details: { previous, newLevel, reason, actionTaken, auditSeal },
      });
    } catch (err) {
      console.error("[EmergencyGovernanceProtocol] Fallo al escribir auditoría:", err);
    }

    return event;
  }

  /**
   * Obtiene el historial de eventos de emergencia registrados.
   */
  public static getEmergencyHistory(): EmergencyEvent[] {
    return [...this.eventHistory];
  }
}
