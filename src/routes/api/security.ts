import { createFileRoute } from "@tanstack/react-router";

const loadHandler = async (context: unknown): Promise<Response> => {
  const module = (await import(/* @vite-ignore */ "../../server-routes/api/security")) as { Route: { options: { server: { handlers: { POST: (ctx: unknown) => Promise<Response> } } } } };
  return module.Route.options.server.handlers.POST(context);
};

export const Route = createFileRoute("/api/security")({
  server: { handlers: { POST: (context) => loadHandler(context) } },
});
