import { createFileRoute } from "@tanstack/react-router";
import { config } from "@/lib/config";
import { SecuritySystem } from "@/lib/security";
import { getSigningAlgorithm, isSimulatedAlgorithm } from "@/lib/crypto/bookpi-signer";

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

    // Signer disponible (sin exponer secretos).
    let signerAvailable = true;
    let simulated = false;
    try {
      const algorithm = getSigningAlgorithm();
      simulated = isSimulatedAlgorithm(algorithm);
      if (simulated) signerAvailable = false; // simulación ≠ autoridad criptográfica
    } catch {
      signerAvailable = false;
    }

    // Cadena BookPI válida (si la DB canónica está disponible).
    let bookpi = { available: false, valid: false };
    try {
      const { createBookpiPostgresRepository } = await import("@/lib/repositories/bookpi-postgres-repository");
      const repo = createBookpiPostgresRepository();
      const integrity = await repo.verifyIntegrity();
      bookpi = { available: true, valid: integrity.success };
    } catch {
      bookpi = { available: false, valid: false };
    }

    // Proyección consistente — solo si economic_events está disponible.
    let projection = { available: false, rebuildable: false };
    try {
      const { Pool } = await import("pg");
      const url = config().DATABASE_URL;
      if (url) {
        const pool = new Pool({ connectionString: url, max: 1 });
        try {
          await pool.query("SELECT 1");
          projection = { available: true, rebuildable: bookpi.valid };
        } finally {
          await pool.end();
        }
      }
    } catch {
      projection = { available: false, rebuildable: false };
    }

    // Fail-closed (§16): escribe económicas solo si TODO está ok.
    const status = signerAvailable && bookpi.valid && projection.available && projection.rebuildable;

    return json(
      headers,
      {
        status: status ? "ok" : "economic_integrity_failure",
        checks: {
          signerAvailable,
          signatureSimulated: simulated,
          bookpi: { available: bookpi.available, chainValid: bookpi.valid },
          projection: { available: projection.available, rebuildable: projection.rebuildable },
        },
      },
      status ? 200 : 503,
    );
  },
});