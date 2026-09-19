import { createFileRoute } from "@tanstack/react-router";
import { start, status } from "@/server-routes/api/connect";

export const Route = createFileRoute("/api/connect/linear")({
  server: {
    handlers: {
      GET: ({ request }) =>
        start({
          request: new Request(
            `${request.url}${request.url.includes("?") ? "&" : "?"}provider=linear`,
            request,
          ),
        }),
      POST: ({ request }) =>
        status({
          request: new Request(
            `${request.url}${request.url.includes("?") ? "&" : "?"}provider=linear`,
            request,
          ),
        }),
    },
  },
});
