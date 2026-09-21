import { createFileRoute } from "@tanstack/react-router";

/**
 * Frontera de delegación: la lógica canónica vive en `@/server-routes/api/catalog`
 * (ver ADR-001-source-of-truth). El módulo servidor se carga de forma
 * perezosa dentro del handler para que el grafo del navegador nunca lo
 * alcance; en el cliente estos handlers se eliminan en build.
 */
type Handlers = Record<string, (ctx: unknown) => Promise<Response>>;

async function resolveHandlers(): Promise<Handlers> {
  const { Route: ServerRoute } = await import("@/server-routes/api/catalog");
  const server = ServerRoute.options.server;
  if (!server?.handlers) throw new Error("Ruta servidora sin handlers.");
  return server.handlers as unknown as Handlers;
}

export const Route = createFileRoute("/api/catalog")({
  server: {
    handlers: {
      GET: async (context) => resolveHandlers().then((h) => h.GET(context)),
      POST: async (context) => resolveHandlers().then((h) => h.POST(context)),
    },
  },
});
