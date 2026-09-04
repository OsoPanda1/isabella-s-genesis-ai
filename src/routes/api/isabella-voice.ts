import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SecuritySystem } from "@/lib/security";
import { secrets } from "@/lib/secrets";
import { withSovereignAuth } from "@/lib/principal-context";
import { config } from "@/lib/config";

const bodySchema = z.object({
  text: z.string().min(1).max(4000),
  voice: z.string().min(1).max(40).default("alloy"),
});

export const Route = createFileRoute("/api/isabella-voice")({
  server: {
    handlers: {
      POST: withSovereignAuth("system", "execute", async (context, request) => {
        // --- LAYER 2: Rate Limiting ---
        const rateLimit = SecuritySystem.checkRateLimit(context.ip, 20); // Voice is heavier, lower limit (20/min)
        if (!rateLimit.allowed) {
          const headers = SecuritySystem.injectSecureHeaders(
            new Headers({ "content-type": "application/json" }),
          );
          return new Response(
            JSON.stringify({
              error: "Límite de solicitudes de síntesis de voz excedido (20/min).",
            }),
            { status: 429, headers },
          );
        }

        // --- LAYER 3: Sovereign API Key check ---
        let apiKey: string;
        try {
          apiKey = secrets.aiGatewayKey();
        } catch {
          apiKey = "";
        }
        if (!apiKey) {
          const headers = SecuritySystem.injectSecureHeaders(
            new Headers({ "content-type": "application/json" }),
          );
          return new Response(
            JSON.stringify({ error: "El núcleo de síntesis vocal no está configurado." }),
            { status: 500, headers },
          );
        }

        // Parse Request Body safely
        let rawBody;
        try {
          rawBody = await request.json();
        } catch {
          const headers = SecuritySystem.injectSecureHeaders(
            new Headers({ "content-type": "application/json" }),
          );
          return new Response(JSON.stringify({ error: "Percepción vocal corrupta." }), {
            status: 400,
            headers,
          });
        }

        // --- LAYER 1: Input Integrity Validation ---
        const validation = SecuritySystem.validateInput(bodySchema, rawBody);
        if (!validation.success) {
          const headers = SecuritySystem.injectSecureHeaders(
            new Headers({ "content-type": "application/json" }),
          );
          return new Response(JSON.stringify({ error: validation.error }), {
            status: 400,
            headers,
          });
        }

        const { text, voice } = validation.data;

        // --- LAYER 7: Hostile Content Filtering ---
        const sanitizedText = SecuritySystem.sanitizePayload(text);
        if (sanitizedText.flagged) {
          const headers = SecuritySystem.injectSecureHeaders(
            new Headers({ "content-type": "application/json" }),
          );
          return new Response(
            JSON.stringify({ error: `Filtro de Contenido Hostil Activo: ${sanitizedText.reason}` }),
            { status: 403, headers },
          );
        }

        // --- LAYER 6: Auditable Telemetry ---
        const telemetry = SecuritySystem.generateTelemetry(context.ip, "allowed");

        // --- LAYER 5: Upstream Safe Fallback & Circuit Breaker — edge-tts soberano (Lovable eliminado) ---
        try {
          const voiceApiUrl = config().VOICE_API_URL;
          if (!voiceApiUrl) {
            throw new Error("VOICE_API_URL is not configured");
          }
          const upstream = await SecuritySystem.fetchSafeUpstream(
            `${voiceApiUrl.replace(/\/$/, "")}/v1/audio/speech`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
              },
              body: JSON.stringify({
                input: sanitizedText.clean,
                voice,
                instructions:
                  "Habla en español de México con voz femenina serena, cálida y sofisticada; ritmo pausado y presencia elegante.",
                stream_format: "sse",
                response_format: "pcm",
              }),
            },
          );

          if (!upstream.ok || !upstream.body) {
            const detail = await upstream.text().catch(() => "");
            console.error(`Isabella voice error [${upstream.status}]: ${detail}`);
            const message =
              upstream.status === 429
                ? "Límite de síntesis vocal alcanzado. Reintenta en unos instantes."
                : upstream.status === 402
                  ? "Créditos de IA agotados en el espacio de trabajo."
                  : `Fallo del núcleo vocal [${upstream.status}].`;

            const headers = SecuritySystem.injectSecureHeaders(
              new Headers({ "content-type": "application/json" }),
            );
            return new Response(JSON.stringify({ error: message }), {
              status: upstream.status,
              headers,
            });
          }

          // --- LAYER 4: Hardened OWASP Secure Headers ---
          const headers = SecuritySystem.injectSecureHeaders(
            new Headers({
              "content-type": "text/event-stream",
              "cache-control": "no-cache",
              "x-isabella-trace-id": telemetry.traceId,
              "x-isabella-correlation-id": telemetry.correlationId,
              "x-isabella-rate-remaining": rateLimit.remaining.toString(),
            }),
          );

          return new Response(upstream.body, { headers });
        } catch (err) {
          console.error("Critical voice gateway failure:", err);
          const headers = SecuritySystem.injectSecureHeaders(
            new Headers({ "content-type": "application/json" }),
          );
          return new Response(
            JSON.stringify({
              error: "Fallo crítico en el túnel de comunicación del gateway de voz.",
            }),
            { status: 502, headers },
          );
        }
      }),
    },
  },
});
