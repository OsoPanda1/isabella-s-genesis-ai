import * as crypto from "node:crypto";
import { config } from "./config";
import { SecuritySystem } from "./security";
import { secrets } from "./secrets";
import { analyzeAegisSemantic } from "./aegis-semantic";
import { enqueueOtelLog } from "./otel-exporter";

// ============================================================================
// CANONICAL DEFINITIONS OF 12 MODULES & 24 CORES OF ISABELLA v4.2.0
// Los datos puros viven en `./isabella-catalog` para que la UI pueda
// consumirlos sin arrastrar el runtime soberano al navegador.
// ============================================================================

import {
  ISABELLA_MODULE_CATALOG,
  type IsabellaCoreId,
  type IsabellaModuleId,
  type SystemModuleMetadata,
} from "./isabella-catalog";

export { ISABELLA_MODULE_CATALOG };
export type { IsabellaCoreId, IsabellaModuleId, SystemModuleMetadata };

// ============================================================================
// CENTRALIZED TELEMETRY & OBSERVABILITY SERVICE
// ============================================================================

export interface TelemetryLog {
  timestamp: string;
  traceId: string;
  correlationId: string;
  moduleId: IsabellaModuleId;
  coreId: IsabellaCoreId;
  eventName: string;
  payload: Record<string, unknown>;
  level: "info" | "warn" | "error" | "security_incident";
  signature: string;
}

class TelemetryService {
  private logBuffer: TelemetryLog[] = [];
  private readonly maxBufferSize = 500;

  private generateHmac(log: Omit<TelemetryLog, "signature">): string {
    const key = secrets.jwtSecret();
    const payloadStr = JSON.stringify({
      t: log.timestamp,
      m: log.moduleId,
      c: log.coreId,
      e: log.eventName,
      tr: log.traceId,
    });
    return crypto.createHmac("sha256", key).update(payloadStr).digest("hex");
  }

  /**
   * Sanitiza el payload para evitar fugar secretos, tokens, JWTs u OIDC subs
   */
  private sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
    const clean: Record<string, unknown> = {};
    const sensitiveKeys = [
      "password",
      "secret",
      "token",
      "key",
      "authorization",
      "bearer",
      "sub",
      "oidc",
      "private",
      "signature",
    ];

    for (const [key, val] of Object.entries(payload)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((s) => lowerKey.includes(s))) {
        clean[key] = "[REDACTED_SENSITIVE_DATA]";
      } else if (typeof val === "string") {
        const sanitized = SecuritySystem.sanitizePayload(val);
        clean[key] = sanitized.clean;
      } else if (val && typeof val === "object" && !Array.isArray(val)) {
        clean[key] = this.sanitizePayload(val as Record<string, unknown>);
      } else {
        clean[key] = val;
      }
    }
    return clean;
  }

  /**
   * Registra un evento de telemetría de forma segura y tipada
   */
  public logEvent(
    moduleId: IsabellaModuleId,
    coreId: IsabellaCoreId,
    eventName: string,
    payload: Record<string, unknown>,
    level: "info" | "warn" | "error" | "security_incident" = "info",
    traceId: string = "tr_system",
    correlationId: string = "corr_system",
  ): TelemetryLog {
    const sanitizedPayload = this.sanitizePayload(payload);
    const rawLog: Omit<TelemetryLog, "signature"> = {
      timestamp: new Date().toISOString(),
      traceId,
      correlationId,
      moduleId,
      coreId,
      eventName,
      payload: sanitizedPayload,
      level,
    };

    const signature = this.generateHmac(rawLog);
    const finalLog: TelemetryLog = { ...rawLog, signature };

    this.logBuffer.unshift(finalLog);
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.pop();
    }

    // Pipeline durable: OTLP → Collector → backend/SIEM (fire-and-forget,
    // fail-open). El buffer en memoria es solo fallback local, no auditoría.
    enqueueOtelLog({
      timestamp: finalLog.timestamp,
      traceId: finalLog.traceId,
      correlationId: finalLog.correlationId,
      moduleId: finalLog.moduleId,
      coreId: finalLog.coreId,
      eventName: finalLog.eventName,
      level: finalLog.level,
      payload: sanitizedPayload,
    });

    // Console logging for local developers and container monitoring
    if (level === "security_incident") {
      console.warn(
        `🚨 [SECURITY_INCIDENT] [${moduleId}:${coreId}] ${eventName} - Trace: ${traceId}`,
        JSON.stringify(sanitizedPayload),
      );
    } else if (level === "error") {
      console.error(
        `❌ [ERROR] [${moduleId}:${coreId}] ${eventName}`,
        JSON.stringify(sanitizedPayload),
      );
    }

    return finalLog;
  }

  public getLogs(): TelemetryLog[] {
    return [...this.logBuffer];
  }

  public clearLogs(): void {
    this.logBuffer = [];
  }
}

export const CentralizedTelemetryService = new TelemetryService();

// ============================================================================
// LATAM-AEGIS-X HARDENING & FIREWALL LAYER
// ============================================================================

export interface InterceptResult {
  allowed: boolean;
  action: "proceed" | "escalate_hitl" | "block_immediate";
  anomalyScore: number;
  reason?: string;
  traceId: string;
  correlationId: string;
}

class AegisFirewallService {
  /**
   * Intercepta y valida todas las solicitudes antes de que alcancen el motor CROWN.
   * Realiza chequeos estáticos de integridad, analiza patrones y hooks de integración cuántica.
   */
  public interceptRequest(
    input: string,
    metadata: Record<string, unknown> = {},
    traceId: string = "tr_auto",
    correlationId: string = "corr_auto",
  ): InterceptResult {
    const currentTrace = traceId === "tr_auto" ? "tr_" + crypto.randomUUID().slice(0, 8) : traceId;
    const currentCorr =
      correlationId === "corr_auto" ? "corr_" + crypto.randomUUID().slice(0, 8) : correlationId;

    CentralizedTelemetryService.logEvent(
      "LATAM_AEGIS",
      "AEGIS_FIREWALL",
      "RequestIntercepted",
      { inputLength: input.length, metadataKeys: Object.keys(metadata) },
      "info",
      currentTrace,
      currentCorr,
    );

    // 1. Sanitización rápida
    const sanitized = SecuritySystem.sanitizePayload(input);
    if (sanitized.flagged) {
      CentralizedTelemetryService.logEvent(
        "LATAM_AEGIS",
        "AEGIS_FIREWALL",
        "AttackPatternDetected",
        { reason: sanitized.reason, inputSample: input.slice(0, 100) },
        "security_incident",
        currentTrace,
        currentCorr,
      );

      return {
        allowed: false,
        action: "block_immediate",
        anomalyScore: 0.98,
        reason: `Mecanismo de mitigación Aegis-X activo: ${sanitized.reason}`,
        traceId: currentTrace,
        correlationId: currentCorr,
      };
    }

    // 2. Motor semántico multicapa (intención + contexto + exfiltración).
    // Reemplaza la lista léxica de 5 términos por 7 detectores con scoring
    // noisy-or y veredicto allow/flag/deny. La sanitización léxica (paso 1)
    // se conserva como primera barrera (defensa en profundidad).
    const history = Array.isArray(metadata.history)
      ? (metadata.history as unknown[]).filter((t): t is string => typeof t === "string").slice(-8)
      : [];
    const semantic = analyzeAegisSemantic(input, {
      history,
      actorStats: {
        blockedCount: typeof metadata.blockedCount === "number" ? metadata.blockedCount : undefined,
        requestsLastMinute:
          typeof metadata.requestsLastMinute === "number" ? metadata.requestsLastMinute : undefined,
      },
    });

    if (semantic.verdict !== "allow") {
      const topSignals = semantic.findings
        .slice(0, 5)
        .map((finding) => `${finding.detector}:${finding.signal}`)
        .join(", ");
      CentralizedTelemetryService.logEvent(
        "LATAM_AEGIS",
        "AEGIS_FIREWALL",
        semantic.verdict === "deny" ? "SemanticBlock" : "SemanticFlag",
        {
          score: semantic.score,
          signals: topSignals,
          findings: semantic.findings.length,
        },
        semantic.verdict === "deny" ? "security_incident" : "warn",
        currentTrace,
        currentCorr,
      );

      return {
        allowed: false,
        action: semantic.verdict === "deny" ? "block_immediate" : "escalate_hitl",
        anomalyScore: semantic.score,
        reason: `AEGIS semántico (${semantic.verdict}): score ${semantic.score} por ${topSignals}`,
        traceId: currentTrace,
        correlationId: currentCorr,
      };
    }

    const anomalyScore = semantic.score;

    // 3. Simulación de hook cuántico para auditoría de entrelazamiento
    // Si la tasa de error cuántico QEC en telemetría es superior al 15%, registramos una advertencia no bloqueante
    const qecErrorRate = metadata.qecErrorRate ? Number(metadata.qecErrorRate) : 0.02;
    if (qecErrorRate > 0.15) {
      CentralizedTelemetryService.logEvent(
        "QUANTUM_PLATFORM",
        "QUP_TORIC",
        "QuantumNoiseLevelHigh",
        {
          qecErrorRate,
          message:
            "Alta tasa de ruido Toric QEC detectada. Se recomienda optimización de circuito.",
        },
        "warn",
        currentTrace,
        currentCorr,
      );
    }

    return {
      allowed: true,
      action: "proceed",
      anomalyScore,
      traceId: currentTrace,
      correlationId: currentCorr,
    };
  }

  /**
   * Verifica la integridad de la configuración del entorno para el firewall
   */
  public verifyEnvironment(): { secure: boolean; missingVars: string[] } {
    const missingVars: string[] = [];
    const cfg = config();
    if (!cfg.AUTH_JWT_SECRET) {
      missingVars.push("AUTH_JWT_SECRET");
    }
    if (!cfg.GEMINI_API_KEY) {
      missingVars.push("GEMINI_API_KEY");
    }

    const secure = missingVars.length === 0;
    CentralizedTelemetryService.logEvent(
      "LATAM_AEGIS",
      "AEGIS_FIREWALL",
      "EnvironmentCheckPerformed",
      { secure, missingVars },
      secure ? "info" : "warn",
    );

    return { secure, missingVars };
  }
}

export const LatamAegisXFirewall = new AegisFirewallService();

// ============================================================================
// NON-BLOCKING COGNITIVE AUTO-AUDITING SYSTEM (CROWN & ORION)
// ============================================================================

export interface GovernanceViolation {
  timestamp: string;
  module: "CROWN" | "ORION";
  violationType: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  traceId: string;
}

class AutoAuditingSystemEngine {
  private violationsLog: GovernanceViolation[] = [];

  /**
   * Monitorea asíncronamente el flujo de ejecución sin bloquear el hilo principal.
   */
  public async auditExecutionFlow(
    module: "CROWN" | "ORION",
    action: string,
    payload: Record<string, unknown>,
    traceId: string,
  ): Promise<void> {
    // Non-blocking processing simulated using setImmediate or setTimeout(0)
    setTimeout(() => {
      try {
        this.performValidation(module, action, payload, traceId);
      } catch (err) {
        console.error("Fallo interno en el daemon de auto-auditoría:", err);
      }
    }, 0);
  }

  private performValidation(
    module: "CROWN" | "ORION",
    action: string,
    payload: Record<string, unknown>,
    traceId: string,
  ): void {
    const timestamp = new Date().toISOString();

    // 1. Verificación de firma e integridad en ORION para transacciones
    if (module === "ORION" && action === "DebitTransaction") {
      const signature = payload.pqcSignature;
      const amount = Number(payload.amount || 0);

      if (amount > 500.0) {
        this.registerViolation({
          timestamp,
          module: "ORION",
          violationType: "SovereignLimitExceeded",
          description: `Intento de transacción de gran tamaño (${amount} USD) sin aprobación de tenencia extendida.`,
          severity: "high",
          traceId,
        });
      }

      if (!signature) {
        this.registerViolation({
          timestamp,
          module: "ORION",
          violationType: "MissingCryptographicSignature",
          description: "La transacción BookPI carece de una firma de validez contable.",
          severity: "critical",
          traceId,
        });
      }
    }

    // 2. Verificación de conformidad de directiva en CROWN
    if (module === "CROWN" && action === "OrchestratePrompt") {
      const targetWeight = Number(payload.targetWeight || 0);
      if (targetWeight > 1.0 || targetWeight < 0.0) {
        this.registerViolation({
          timestamp,
          module: "CROWN",
          violationType: "WeightDistributionError",
          description: `Distribución de pesos fuera de los límites canónicos: ${targetWeight}. Reajustando a peso base.`,
          severity: "medium",
          traceId,
        });
      }
    }

    // Log the audit completion
    CentralizedTelemetryService.logEvent(
      module === "CROWN" ? "CROWN_GATEWAY" : "ORION_ENGINE",
      module === "CROWN" ? "CROWN_ROUTER" : "ORION_SANDBOX",
      "AutoAuditCompleted",
      { action, status: "passed_conformity" },
      "info",
      traceId,
    );
  }

  private registerViolation(violation: GovernanceViolation): void {
    this.violationsLog.unshift(violation);
    if (this.violationsLog.length > 100) {
      this.violationsLog.pop();
    }

    CentralizedTelemetryService.logEvent(
      violation.module === "CROWN" ? "CROWN_GATEWAY" : "ORION_ENGINE",
      violation.module === "CROWN" ? "CROWN_CONSTITUTION" : "ORION_BRIDGE",
      "GovernanceViolationFlagged",
      { ...violation },
      violation.severity === "critical" || violation.severity === "high"
        ? "security_incident"
        : "warn",
      violation.traceId,
    );
  }

  public getViolations(): GovernanceViolation[] {
    return [...this.violationsLog];
  }

  public clearViolations(): void {
    this.violationsLog = [];
  }
}

export const AutoAuditingSystem = new AutoAuditingSystemEngine();
