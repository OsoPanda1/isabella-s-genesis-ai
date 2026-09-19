import { useCallback } from "react";
import { z } from "zod";
import type { Attachment } from "@/lib/attachments";

// Validation schema for outgoing requests to the backend
const ChatRequestSchema = z.object({
  text: z.string().optional(),
  attachments: z.array(z.unknown()).optional(),
  context: z.record(z.string(), z.unknown()).default({ source: "isabella" }),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export function useIsabellaObservability() {
  const logLifecycleEvent = useCallback(
    (
      stage: "INIT" | "SANITIZATION" | "PAYLOAD_CONSTRUCTION" | "SEND" | "SUCCESS" | "ERROR",
      details: unknown,
    ) => {
      const timestamp = new Date().toISOString();
      // Solo desarrollo: details puede contener texto del usuario (privacidad).
      if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
        console.log(`[Isabella Observability] [${timestamp}] [${stage}]`, details);
      }

      // We can also dispatch an event to the window for telemetry panels
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("IsabellaChatLifecycleEvent", {
            detail: { stage, timestamp, details },
          }),
        );
      }
    },
    [],
  );

  const validatePayload = useCallback(
    (input: string, attachments: Attachment[]): ChatRequest | null => {
      try {
        const payload = {
          text: input,
          attachments,
          context: { source: "isabella" },
        };

        // Zod validation layer
        const validated = ChatRequestSchema.parse(payload);
        return validated;
      } catch (err) {
        console.error("[Isabella Observability] Payload validation failed:", err);
        return null;
      }
    },
    [],
  );

  return { logLifecycleEvent, validatePayload };
}
