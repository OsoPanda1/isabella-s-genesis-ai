import { createFileRoute } from "@tanstack/react-router";
import { SecuritySystem } from "@/lib/security";
import { checkEconomicIntegrity } from "../../server-routes/api/economic-integrity";

// Autoridad única de routing: la lógica canónica vive en
// src/server-routes/api/economic-integrity.ts. Este archivo solo
// delega (ver ADR-001-source-of-truth).
function json(headers: Headers, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...Object.fromEntries(SecuritySystem.injectSecureHeaders(new Headers()).entries()),
      "content-type": "application/json",
    },
  });
}

export const Route = createFileRoute("/api/economic-integrity")({
  async loader() {
    const headers = new Headers({ "content-type": "application/json" });
    const report = await checkEconomicIntegrity();
    return json(headers, { status: report.status, checks: report.checks }, report.httpStatus);
  },
});
