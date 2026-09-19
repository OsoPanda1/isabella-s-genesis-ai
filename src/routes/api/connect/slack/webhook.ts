import { createFileRoute } from "@tanstack/react-router";
import { webhook } from "@/server-routes/api/connect";

export const Route = createFileRoute("/api/connect/slack/webhook")({
  server: { handlers: { POST: ({ request }) => webhook(request, "slack") } },
});
