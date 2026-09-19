import { createFileRoute } from "@tanstack/react-router";
import { getAIGovernanceProfile } from "@/lib/ai-governance";
import { SecuritySystem } from "@/lib/security";

export const Route = createFileRoute("/api/ai/transparency")({
  server: {
    handlers: {
      GET: async () => {
        const headers = SecuritySystem.injectSecureHeaders(
          new Headers({
            "content-type": "application/json; charset=utf-8",
            "cache-control": "public, max-age=300, s-maxage=300",
            "x-isabella-governance-schema": "isabella.ai.governance.v1",
          }),
        );
        return new Response(JSON.stringify(getAIGovernanceProfile()), { status: 200, headers });
      },
    },
  },
});
