import { createFileRoute } from "@tanstack/react-router";
import { withSovereignAuth } from "@/lib/principal-context";
import { handleNativeComprehension } from "@/lib/isabella-native-gateway";

export const Route = createFileRoute("/api/isabella/native")({
  server: {
    handlers: {
      POST: withSovereignAuth("system", "execute", async (context, request) =>
        handleNativeComprehension(
          {
            ip: context.ip,
            traceId: context.traceId,
            correlationId: context.correlationId,
            tenantId: context.tenantId,
          },
          request,
        ),
      ),
    },
  },
});
