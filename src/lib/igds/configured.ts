/**
 * IGDS — Firmante configurado (src/lib/igds/configured.ts)
 * -----------------------------------------------------------------
 * Construye el firmante Ed25519 desde `IGDS_SIGNING_KEY` (PEM PKCS8) respetando
 * la regla del repositorio: la configuración se lee solo vía `config()`.
 * Fail-closed: sin clave configurada no hay firmante.
 */
import { config } from "../config";
import { createEd25519Signer, type SealSigner } from "./keys";

export function createConfiguredSealSigner(): SealSigner {
  const cfg = config();
  const privateKeyPem = cfg.IGDS_SIGNING_KEY;
  if (!privateKeyPem) {
    throw new Error(
      "IGDS: IGDS_SIGNING_KEY (Ed25519 PEM PKCS8) es obligatoria para sellar documentos.",
    );
  }
  return createEd25519Signer({ privateKeyPem, keyId: cfg.IGDS_KEY_ID });
}

export function getConfiguredTsaUrl(): string | undefined {
  return config().IGDS_TSA_URL;
}
