/**
 * IGDS — Sellado temporal (src/lib/igds/tsa.ts)
 * -----------------------------------------------------------------
 * Interfaz de autoridad de sellado temporal. El transporte RFC 3161 real vive
 * en `rfc3161.ts`; esta interfaz permite inyectar TSAs manuales/HSM y testear
 * sin red. La validación criptográfica del token (firma de la TSA + cadena
 * X.509) se delega en un `TsaVerifier`; sin verificador, el token NUNCA se
 * considera confiable.
 */
import { digestHex } from "./digests";
import type { TimestampToken } from "./types";

export interface TsaClient {
  timestamp(digestValue: string): Promise<TimestampToken>;
}

export interface TsaVerifier {
  /** Debe devolver `true` solo si el token cubre exactamente el digest dado. */
  verify(token: TimestampToken, digestValue: string): Promise<boolean>;
}

export const RFC3161_OID = "1.2.840.113549.1.9.16.1.4" as const;
export const SHA256_OID = "2.16.840.1.101.3.4.2.1" as const;

/** Cliente de sello manual: útil para operaciones offline y pruebas. */
export function createStaticTsaClient(token: TimestampToken): TsaClient {
  return {
    timestamp() {
      return Promise.resolve(token);
    },
  };
}

export function buildTimestampToken(input: {
  digestValue: string;
  policy?: string;
  generatedAt?: string;
  encodedToken?: string;
}): TimestampToken {
  return {
    protocol: "RFC3161",
    status: "granted",
    policy: input.policy ?? "isabella-tsa-policy-v1",
    gen_time: input.generatedAt ?? new Date().toISOString(),
    serial_number: digestHex("sha256", input.digestValue).slice(0, 32),
    message_imprint: { algorithm: "sha256", value: input.digestValue },
    tsa_certificate_chain: [],
    encoded_timestamp_token: input.encodedToken ?? "",
  };
}
