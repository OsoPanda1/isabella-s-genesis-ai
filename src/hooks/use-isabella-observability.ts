import { useCallback } from "react";
import { z } from "zod";
import type { Attachment } from "@/lib/attachments";

// Validation schema for outgoing requests to the backend
const ChatRequestSchema = z.object({
  text: z.string().optional(),
  attachments: z.array(z.any()).optional(),
  context: z.string().default("isabella"),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export function useIsabellaObservability() {
  const logLifecycleEvent = useCallback(
    (stage: "INIT" | "SANITIZATION" | "PAYLOAD_CONSTRUCTION" | "SEND" | "SUCCESS" | "ERROR", details: any) => {
      const timestamp = new Date().toISOString();
      console.log(`[Isabella Observability] [${timestamp}] [${stage}]`, details);
      
      // We can also dispatch an event to the window for telemetry panels
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("IsabellaChatLifecycleEvent", {
            detail: { stage, timestamp, details },
          })
        );
      }
    },
    []
  );

  const validatePayload = useCallback(
    (input: string, attachments: Attachment[]): ChatRequest | null => {
      try {
        const payload = {
          text: input,
          attachments,
          context: "isabella", // Ensuring 'isabella' context is correctly included
        };
        
        // Zod validation layer
        const validated = ChatRequestSchema.parse(payload);
        return validated;
      } catch (err) {
        console.error("[Isabella Observability] Payload validation failed:", err);
        return null;
      }
    },
    []
  );

  return { logLifecycleEvent, validatePayload };
}
