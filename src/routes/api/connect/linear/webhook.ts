import { createFileRoute } from "@tanstack/react-router";
import { webhook } from "@/server-routes/api/connect";

export const Route = createFileRoute("/api/connect/linear/webhook")({
  server: { handlers: { POST: ({ request }) => webhook(request, "linear") } },
});
