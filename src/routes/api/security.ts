import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SecuritySystem } from "@/lib/security";
import { withSovereignAuth } from "@/lib/principal-context";
import { secrets } from "@/lib/secrets";
import { config } from "@/lib/config";
import { spawn } from "node:child_process";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { repositoryFactory } from "@/lib/persistence/repository-factory";

async function auditSecurity(traceId: string, tenantId: string, action: string, severity: "S0" | "S1" | "S2" | "S3", details: string): Promise<void> {
  try {
    await repositoryFactory.getAuditRepository().audit({
      id: crypto.randomUUID(),
      tenantId,
      traceId,
      timestamp: new Date().toISOString(),
      action,
      resource: "security",
      severity,
      actor: "system",
      result: severity === "S1" || severity === "S0" ? "failure" : "success",
      details: { details },
    });
  } catch {}
}

// Enum matching Python domain
const EventTypeSchema = z.enum([
  "authentication",
  "api_request",
  "data_access",
  "file_operation",
  "network_flow",
  "admin_action",
]);

const securityEventSchema = z.object({
  event_id: z.string().min(8).max(128),
  event_type: EventTypeSchema,
  actor: z.string().min(1).max(512),
  source: z.string().min(1).max(512),
  action: z.string().min(1).max(256),
  resource_class: z.string().min(1).max(128),
  features: z.record(z.number()).default({}),
  metadata: z.record(z.unknown()).default({}),
  timestamp: z.string().optional(),
});

// TypeScript equivalent scoring and level mapping matching python's pipeline.py
function calculateTsAegisResponse(event: z.infer<typeof securityEventSchema>) {
  const hashSecret = secrets.apiKeyHashSecret(); // Resolved safely from secret provider

  // Hash helper: HMAC-SHA256 criptográfico (nunca FNV), truncado para redacción.
  const stableHash = (val: string, secret: string): string => {
    return SecuritySystem.hmacSha256(val, secret).slice(0, 16);
  };

  const sanitizedActor = `hash_actor_${stableHash(event.actor, hashSecret)}`;
  const sanitizedSource = `hash_src_${stableHash(event.source, hashSecret)}`;

  // Rule matching
  const reasons: string[] = [];
  if (event.action === "bulk_export") reasons.push("bulk_data_export");
  if (event.resource_class === "credential_store" || event.resource_class === "private_keys") {
    reasons.push("sensitive_resource_access");
  }
  if (event.metadata.secret_pattern_detected === true) reasons.push("credential_exfiltration");
  if (event.metadata.mass_download === true) reasons.push("mass_download");

  // Feature scores (anomaly_rate, volume_ratio)
  const anomaly_rate = event.features.anomaly_rate ?? 0.0;
  const volume_ratio = event.features.volume_ratio ?? 0.0;
  const baseScore = (anomaly_rate + volume_ratio) / 2;
  let finalScore = baseScore;

  // Rules overrides
  const criticalRules = ["credential_exfiltration", "sensitive_resource_access"];
  const isCritical = reasons.some((r) => criticalRules.includes(r));

  if (isCritical) {
    finalScore = Math.max(finalScore, 0.99);
  } else if (reasons.length > 0) {
    finalScore = Math.max(finalScore, 0.85);
  }

  // Aegis Levels: 0=OPEN, 1=WATCH, 2=CONTAIN, 3=ISOLATE, 4=VAULT, 5=LOCKDOWN
  let aegis_level = 0;
  if (reasons.includes("audit_tampering")) {
    aegis_level = 5; // LOCKDOWN
  } else if (isCritical) {
    aegis_level = 4; // VAULT
  } else if (finalScore >= 0.9) {
    aegis_level = 3; // ISOLATE
  } else if (finalScore >= 0.82) {
    aegis_level = 2; // CONTAIN
  } else if (finalScore >= 0.6) {
    aegis_level = 1; // WATCH
  }

  // Decisions
  let decision: "allow" | "observe" | "challenge" | "quarantine" | "block" = "allow";
  if (finalScore >= 0.95) {
    decision = "block";
  } else if (finalScore >= 0.82) {
    decision = "quarantine";
  } else if (finalScore >= 0.6) {
    decision = "challenge";
  } else if (finalScore >= 0.3) {
    decision = "observe";
  }

  return {
    event_id: event.event_id,
    score: parseFloat(finalScore.toFixed(2)),
    decision,
    aegis_level,
    reasons,
    model_version: "aegis-4l-v2.0-ts-redundant",
    learning_mode: aegis_level >= 2 ? "incident_memory" : "normal",
    sanitizedActor,
    sanitizedSource,
    redactedMetadata: { ...event.metadata, original_resource: event.resource_class },
  };
}

export const Route = createFileRoute("/api/security")({
  server: {
    handlers: {
      POST: withSovereignAuth("system", "execute", async (context, request) => {
        const headers = SecuritySystem.injectSecureHeaders(
          new Headers({ "content-type": "application/json" }),
        );

        // --- LAYER 2: Rate Limiting ---
        const rateLimit = SecuritySystem.checkRateLimit(context.ip, 40);
        if (!rateLimit.allowed) {
          return new Response(
            JSON.stringify({
              error: "Límite de solicitudes de análisis de eventos de seguridad excedido (40/min).",
            }),
            { status: 429, headers },
          );
        }

        // Parse Request Body safely
        let rawBody;
        try {
          rawBody = await request.json();
        } catch {
          return new Response(
            JSON.stringify({ error: "Inyección o payload corrupto detectado." }),
            {
              status: 400,
              headers,
            },
          );
        }

        // --- LAYER 1: Input Integrity Validation ---
        const validation = SecuritySystem.validateInput(securityEventSchema, rawBody);
        if (!validation.success) {
          return new Response(JSON.stringify({ error: validation.error }), {
            status: 400,
            headers,
          });
        }

        const event = { ...validation.data, metadata: validation.data.metadata ?? {}, features: validation.data.features ?? {} };

        // Try Python run pipeline via shell bridge with PYTHONPATH configured
        return new Promise<Response>((resolve) => {
          const cliScript = path.join(
            process.cwd(),
            "latam-aegis-x",
            "src",
            "latam_aegis",
            "run_pipeline.py",
          );
          const pythonPath = path.join(process.cwd(), "latam-aegis-x", "src");

          // Entorno restringido: solo variables necesarias, sin shell, sin interpolación.
          const processEnv: NodeJS.ProcessEnv = {
            PATH: process.env.PATH ?? "",
            LANG: process.env.LANG ?? "C.UTF-8",
            LC_ALL: process.env.LC_ALL ?? "C.UTF-8",
            PYTHONPATH: pythonPath,
            AEGIS_HASH_SECRET: config().API_KEY_HASH_SECRET || secrets.apiKeyHashSecret(),
            AEGIS_AUDIT_SECRET: config().CROWN_POLICY_SIGNING_KEY || secrets.jwtSecret(),
          };

          const inputJson = JSON.stringify(event);

          const child = spawn("python3", ["-u", cliScript], {
            env: processEnv,
            stdio: ["pipe", "pipe", "pipe"],
          });

          const maxStdoutBytes = 1_048_576;
          const maxStderrBytes = 262_144;
          const maxRuntimeMs = 8_000;
          let stdout = "";
          let stderr = "";
          let settled = false;
          const finish = (response: Response) => {
            if (settled) return;
            settled = true;
            resolve(response);
          };
          const timer = setTimeout(() => {
            child.kill("SIGKILL");
            finish(new Response(JSON.stringify({ error: "AEGIS runtime timeout." }), { status: 504, headers }));
          }, maxRuntimeMs);

          child.stdout.on("data", (chunk: Buffer) => {
            if (Buffer.byteLength(stdout) + chunk.byteLength > maxStdoutBytes) {
              child.kill("SIGKILL");
              return;
            }
            stdout += chunk.toString();
          });
          child.stderr.on("data", (chunk: Buffer) => {
            if (Buffer.byteLength(stderr) + chunk.byteLength <= maxStderrBytes) stderr += chunk.toString();
          });

          child.on("error", () => {
            clearTimeout(timer);
            const tsResult = calculateTsAegisResponse(event);
            void auditSecurity(context.traceId, context.tenantId, "aegis.fallback", tsResult.aegis_level >= 2 ? "S1" : "S3", `Análisis completado mediante motor de redundancia seguro por falta de dependencias Python. Decisión: ${tsResult.decision.toUpperCase()}. Score: ${tsResult.score}.`);
              clearTimeout(timer);
              finish(new Response(JSON.stringify(tsResult), { headers }));
          });

          child.on("close", (code) => {
            if (code !== 0) {
              const tsResult = calculateTsAegisResponse(event);
              void auditSecurity(context.traceId, context.tenantId, "aegis.fallback", tsResult.aegis_level >= 2 ? "S1" : "S3", `Análisis completado mediante motor de redundancia seguro por falta de dependencias Python. Decisión: ${tsResult.decision.toUpperCase()}. Score: ${tsResult.score}. Stderr: ${stderr.slice(0, 200)}`);
              clearTimeout(timer);
              return finish(new Response(JSON.stringify(tsResult), { headers }));
            }
            try {
              const pyResult = JSON.parse(stdout);
              const finalResult = {
                ...pyResult,
                sanitizedActor: `hash_actor_${pyResult.actor || "hashed"}`,
                sanitizedSource: `hash_src_${pyResult.source || "hashed"}`,
                redactedMetadata: { ...event.metadata, original_resource: event.resource_class },
              };
              void auditSecurity(context.traceId, context.tenantId, "aegis.python_core", finalResult.aegis_level >= 2 ? "S1" : "S3", `Análisis exitoso mediante motor nativo Python. Decisión: ${finalResult.decision.toUpperCase()}. Score: ${finalResult.score}.`);
              clearTimeout(timer);
              return finish(new Response(JSON.stringify(finalResult), { headers }));
            } catch {
              const tsResult = calculateTsAegisResponse(event);
              clearTimeout(timer);
              return finish(new Response(JSON.stringify(tsResult), { headers }));
            }
          });

          child.stdin.write(inputJson);
          child.stdin.end();
        });
      }),
    },
  },
});
