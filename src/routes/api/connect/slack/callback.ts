import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/connect/slack/callback")({
  server: {
    handlers: {
      GET: () =>
        new Response("Slack authorization completed. You may return to Isabella.", {
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
    },
  },
});
