import { createFileRoute } from "@tanstack/react-router";
<<<<<<< Updated upstream
import { Route as ServerRoute } from "../../server-routes/api/security";
=======
import { z } from "zod";
import { SecuritySystem } from "@/lib/security";
import { withSovereignAuth } from "@/lib/principal-context";
import { secrets } from "@/lib/secrets";
import { spawn } from "node:child_process";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { repositoryFactory } from "@/lib/persistence/repository-factory";
>>>>>>> Stashed changes

// Canonical handler lives in server-routes/api/security.ts. Keep the public
// route as a typed delegation boundary so future edits cannot silently widen
// the endpoint to an untyped/unauthenticated handler.
type ServerRequestContext = { request: Request };
type ServerHandlers = {
  POST: (context: ServerRequestContext) => Promise<Response>;
};

const server = ServerRoute.options.server;
if (!server?.handlers) throw new Error("Ruta servidora sin handlers.");
const handlers = server.handlers as unknown as ServerHandlers;

export const Route = createFileRoute("/api/security")({
  server: {
    handlers: {
<<<<<<< Updated upstream
      POST: ({ request }) => handlers.POST({ request }),
=======
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

        const event = {
          ...validation.data,
          metadata: validation.data.metadata ?? {},
          features: validation.data.features ?? {},
        };

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
          const aegisAuditSecret = secrets.policySigningKey();
          if (!aegisAuditSecret) {
            throw new Error("CROWN_POLICY_SIGNING_KEY requerida como AEGIS_AUDIT_SECRET (fail-closed).");
          }
          const processEnv: NodeJS.ProcessEnv = {
            PATH: process.env.PATH ?? "",
            LANG: process.env.LANG ?? "C.UTF-8",
            LC_ALL: process.env.LC_ALL ?? "C.UTF-8",
            PYTHONPATH: pythonPath,
            AEGIS_HASH_SECRET: secrets.apiKeyHashSecret(),
            AEGIS_AUDIT_SECRET: aegisAuditSecret,
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
            finish(
              new Response(JSON.stringify({ error: "AEGIS runtime timeout." }), {
                status: 504,
                headers,
              }),
            );
          }, maxRuntimeMs);

          child.stdout.on("data", (chunk: Buffer) => {
            if (Buffer.byteLength(stdout) + chunk.byteLength > maxStdoutBytes) {
              child.kill("SIGKILL");
              return;
            }
            stdout += chunk.toString();
          });
          child.stderr.on("data", (chunk: Buffer) => {
            if (Buffer.byteLength(stderr) + chunk.byteLength <= maxStderrBytes)
              stderr += chunk.toString();
          });

          child.on("error", () => {
            clearTimeout(timer);
            const tsResult = calculateTsAegisResponse(event);
            void auditSecurity(
              context.traceId,
              context.tenantId,
              "aegis.fallback",
              tsResult.aegis_level >= 2 ? "S1" : "S3",
              `Análisis completado mediante motor de redundancia seguro por falta de dependencias Python. Decisión: ${tsResult.decision.toUpperCase()}. Score: ${tsResult.score}.`,
            );
            clearTimeout(timer);
            finish(new Response(JSON.stringify(tsResult), { headers }));
          });

          child.on("close", (code) => {
            if (code !== 0) {
              const tsResult = calculateTsAegisResponse(event);
              void auditSecurity(
                context.traceId,
                context.tenantId,
                "aegis.fallback",
                tsResult.aegis_level >= 2 ? "S1" : "S3",
                `Análisis completado mediante motor de redundancia seguro por falta de dependencias Python. Decisión: ${tsResult.decision.toUpperCase()}. Score: ${tsResult.score}. Stderr: ${stderr.slice(0, 200)}`,
              );
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
              void auditSecurity(
                context.traceId,
                context.tenantId,
                "aegis.python_core",
                finalResult.aegis_level >= 2 ? "S1" : "S3",
                `Análisis exitoso mediante motor nativo Python. Decisión: ${finalResult.decision.toUpperCase()}. Score: ${finalResult.score}.`,
              );
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
>>>>>>> Stashed changes
    },
  },
});
