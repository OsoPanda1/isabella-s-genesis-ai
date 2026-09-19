import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/connect/github/callback")({
  server: {
    handlers: {
      GET: () =>
        new Response("GitHub authorization completed. You may return to Isabella.", {
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
    },
  },
});
