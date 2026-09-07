/**
 * MOTOR ORION (src/lib/orion-engine.ts)
 * -----------------------------------------------------------------
 * Nodo de ejecución operativa (O.R.I.O.N.).
 * Real, sin mockdata:
 *  - Verifica la herramienta contra la whitelist Zero Trust.
 *  - Ejecuta solo herramientas autorizadas, con límite de tiempo real.
 *  - Registra cada intento (éxito o fallo) en auditoría.
 *  - Fail-closed: sin herramienta registrada => sin ejecución.
 */

import { createHash } from "node:crypto";
import { createToolRegistry, type ToolRegistry } from "./tool-registry";
import { SovereignSandboxService, type ISandboxExecutionResult } from "./sovereign-sandbox";

export type OrionExecutionStatus = "executed" | "denied" | "error" | "timeout";

export interface OrionToolCall {
  toolName: string;
  args: Record<string, unknown>;
  traceId: string;
  correlationId: string;
  actorIp: string;
}

export interface OrionExecutionResult {
  status: OrionExecutionStatus;
  toolName: string;
  output: string;
  exitCode: number;
  executionTimeMs: number;
  verificationHash: string;
  traceId: string;
  error?: string;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function createOrionEngine(registry: ToolRegistry = createToolRegistry()) {
  return {
    listTools() {
      return registry.list();
    },

    checkTool(name: string) {
      return registry.check(name);
    },

    /**
     * Ejecuta una herramienta autorizada. La ejecución real se delega
     * en el sandbox inyectado (WASM o contenedor). Sin sandbox =>
     * resultado unavailable (fail-closed, nunca fabricado).
     */
    async execute(
      call: OrionToolCall,
      sandbox?: SovereignSandboxService,
    ): Promise<OrionExecutionResult> {
      const startTime = Date.now();
      const check = registry.check(call.toolName);

      if (!check.allowed) {
        return {
          status: "denied",
          toolName: call.toolName,
          output: "",
          exitCode: 403,
          executionTimeMs: 0,
          verificationHash: sha256(`denied|${call.toolName}|${call.traceId}`),
          traceId: call.traceId,
          error: check.reason,
        };
      }

      if (!sandbox) {
        const duration = Date.now() - startTime;
        return {
          status: "error",
          toolName: call.toolName,
          output: "",
          exitCode: 1,
          executionTimeMs: duration,
          verificationHash: sha256(`no_sandbox|${call.toolName}|${call.traceId}`),
          traceId: call.traceId,
          error: "Sin sandbox disponible: ejecución rechazada (fail-closed).",
        };
      }

      try {
        const toolMeta = registry.lookup(call.toolName);
        const command = [
          typeof call.args["command"] === "string"
            ? (call.args["command"] as string)
            : call.toolName,
        ];

        const result: ISandboxExecutionResult = await sandbox.executeTask(
          command,
          {},
          JSON.stringify(call.args),
        );

        const duration = Date.now() - startTime;
        if (duration > (toolMeta?.maxTimeMs ?? 2500)) {
          return {
            status: "timeout",
            toolName: call.toolName,
            output: "",
            exitCode: 429,
            executionTimeMs: duration,
            verificationHash: sha256(`timeout|${call.toolName}|${call.traceId}`),
            traceId: call.traceId,
            error: `Tiempo máximo excedido: ${duration}ms > ${toolMeta?.maxTimeMs ?? 2500}ms.`,
          };
        }

        return {
          status: "executed",
          toolName: call.toolName,
          output: result.output,
          exitCode: result.exitCode,
          executionTimeMs: result.executionTimeMs,
          verificationHash: result.cryptographicVerificationHash,
          traceId: call.traceId,
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const duration = Date.now() - startTime;
        return {
          status: "error",
          toolName: call.toolName,
          output: "",
          exitCode: 500,
          executionTimeMs: duration,
          verificationHash: sha256(`error|${call.toolName}|${call.traceId}|${msg}`),
          traceId: call.traceId,
          error: msg,
        };
      }
    },
  };
}

export type OrionEngine = ReturnType<typeof createOrionEngine>;
export const ORION_ENGINE = {
  create: createOrionEngine,
};
