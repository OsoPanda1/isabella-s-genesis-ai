import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/connect/linear/callback")({
  server: {
    handlers: {
      GET: () =>
        new Response("Linear authorization completed. You may return to Isabella.", {
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
    },
  },
});
