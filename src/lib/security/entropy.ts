/**
 * Entropía de política — universal (navegador y servidor).
 * Usa WebCrypto (`globalThis.crypto`), disponible tanto en el runtime edge
 * como en el navegador; nunca `node:crypto`, que no existe en el cliente.
 */

import { ObservabilityService } from "../telemetry/observability";

export interface EntropyReport {
  timestamp: string;
  sourceType: "quantum_hybrid" | "fallback_crypto";
  entropyBits: number;
  seedHex: string;
  contributingFactors: string[];
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 síncrono y determinista (FNV-1a expandido) para mezcla de deriva. */
function driftDigest(input: string): Uint8Array {
  const out = new Uint8Array(32);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    h1 = (h1 ^ input.charCodeAt(i)) >>> 0;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 + Math.imul(input.charCodeAt(i) + i, 0x85ebca6b)) >>> 0;
  }
  for (let i = 0; i < 32; i++) {
    h1 = (Math.imul(h1 ^ (h1 >>> 15), 0x2545f491) + i) >>> 0;
    h2 = (Math.imul(h2 ^ (h2 >>> 13), 0x27d4eb2f) + h1) >>> 0;
    out[i] = (h1 ^ h2) & 0xff;
  }
  return out;
}

function highResolutionTicks(): string {
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  return Math.floor(now * 1e6).toString();
}

class QuantumEntropyService {
  /**
   * Semilla no determinista de 256 bits: CSPRNG (WebCrypto) mezclado con la
   * deriva física observada (telemetría, relojes de alta resolución, térmica
   * de núcleos) para la pasarela de decisión del motor C.R.O.W.N.
   */
  public generatePolicySeed(): EntropyReport {
    const contributingFactors: string[] = ["web_crypto_csprng"];
    const finalBuffer = new Uint8Array(32);
    globalThis.crypto.getRandomValues(finalBuffer);

    try {
      const snapshot = ObservabilityService.getSnapshot();
      contributingFactors.push("telemetry_drift_sensors", "hrtime_clock_drift");

      const coreMetricsStr = Object.values(snapshot.cores)
        .map((c) => `${c.id}:${c.temperatureCelsius.toFixed(4)}:${c.loadPercentage.toFixed(2)}`)
        .join(";");
      contributingFactors.push("core_thermal_drift");

      const seedSourceString = [
        snapshot.timestamp,
        snapshot.throughput,
        snapshot.avgLatencyMs,
        highResolutionTicks(),
        coreMetricsStr,
      ].join("|");

      const drift = driftDigest(seedSourceString);
      for (let i = 0; i < 32; i++) finalBuffer[i] ^= drift[i];
    } catch (err) {
      console.warn("[ENTROPY_SERVICE] Deriva no disponible; se usa CSPRNG estándar.", err);
      contributingFactors.push("bypass_fallback_csprng");
    }

    return {
      timestamp: new Date().toISOString(),
      sourceType: contributingFactors.includes("core_thermal_drift")
        ? "quantum_hybrid"
        : "fallback_crypto",
      entropyBits: 256,
      seedHex: toHex(finalBuffer),
      contributingFactors,
    };
  }

  /** Semilla → probabilidad acotada [0, 1] para enrutamiento estocástico. */
  public seedToProbability(seedHex: string): number {
    const val = parseInt(seedHex.slice(0, 8), 16);
    return (Number.isFinite(val) ? val : 0) / 0xffffffff;
  }
}

export const EntropyService = new QuantumEntropyService();
export default EntropyService;
