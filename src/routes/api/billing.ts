import { createFileRoute } from "@tanstack/react-router";

const loadHandler = async (method: string, context: unknown): Promise<Response> => {
  const module = (await import(/* @vite-ignore */ "../../server-routes/api/billing")) as {
    Route: { options: { server: { handlers: Record<string, (ctx: unknown) => Promise<Response>> } } };
  };
  return module.Route.options.server.handlers[method](context);
};

export const Route = createFileRoute("/api/billing")({
  server: { handlers: {
    GET: (context) => loadHandler("GET", context),
    POST: (context) => loadHandler("POST", context),
  } },
});
