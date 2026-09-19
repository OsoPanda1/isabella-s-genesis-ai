/**
 * IGDS — Revocación (src/lib/igds/revocation.ts)
 * -----------------------------------------------------------------
 * Regla temporal: lo relevante no es si la clave está revocada HOY, sino si
 * estaba válida CUANDO se firmó. Nunca se borra una entrada Genesis: la
 * revocación es una entrada nueva firmada que apunta al objetivo original.
 */
import type {
  RevocationReason,
  RevocationScope,
  RevocationTargetType,
  TrustStatus,
  GenesisRevocationPayload,
} from "./types";
import { canonicalize } from "./canonical";
import { digestHex } from "./digests";

export const REVOCATION_REASONS: readonly RevocationReason[] = [
  "key_compromise",
  "key_loss",
  "unauthorized_use",
  "operator_request",
  "algorithm_deprecation",
  "certificate_misissuance",
  "tsa_compromise",
  "document_withdrawn",
  "policy_violation",
];

export const REVOCATION_SCOPES: readonly RevocationScope[] = [
  "all_signatures_after_effective_at",
  "target_only",
  "all_target_versions",
];

export const REVOCATION_TARGET_TYPES: readonly RevocationTargetType[] = [
  "signing_key",
  "manifest",
  "document",
  "genesis_entry",
  "watermark_profile",
  "trust_source",
  "certificate",
  "tsa_certificate",
];

export function createRevocationPayload(input: {
  revocationId: string;
  targetType: RevocationTargetType;
  targetId: string;
  reason: RevocationReason;
  scope?: RevocationScope;
  issuedBy: string;
  effectiveAt?: string;
}): GenesisRevocationPayload {
  if (!input.revocationId.trim()) throw new Error("IGDS revocation: revocationId es obligatorio.");
  if (!input.targetId.trim()) throw new Error("IGDS revocation: targetId es obligatorio.");
  return {
    revocation_id: input.revocationId,
    target_type: input.targetType,
    target_id: input.targetId,
    effective_at: input.effectiveAt ?? new Date().toISOString(),
    reason: input.reason,
    scope: input.scope ?? "all_signatures_after_effective_at",
    issued_by: input.issuedBy,
  };
}

/** Digest canónico que firma la entrada de revocación (independiente de su posición en la cadena). */
export function revocationDigest(payload: GenesisRevocationPayload): string {
  return digestHex("sha256", canonicalize(payload as unknown as Record<string, unknown>));
}

export interface TrustEvaluationInput {
  /** Instante en que se produjo la firma (si existe). */
  signatureTime: string | null;
  /** Instante efectivo de la revocación que aplica al objetivo (si existe). */
  revocationEffectiveAt: string | null;
  scope: RevocationScope | null;
  /** Resultado de verificar la firma del documento. */
  signatureValid: boolean;
  /** Resultado de validar el token RFC 3161 (si existe). */
  timestampTrusted: boolean;
}

export interface TrustEvaluation {
  status: TrustStatus;
  currentKeyStatus: "valid" | "revoked" | "unknown";
  interpretation: string;
}

function toMillis(value: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function evaluateTrust(input: TrustEvaluationInput): TrustEvaluation {
  if (!input.signatureValid) {
    return {
      status: "invalid_signature",
      currentKeyStatus: input.revocationEffectiveAt ? "revoked" : "unknown",
      interpretation: "La firma no verifica: el documento no puede considerarse auténtico.",
    };
  }
  if (!input.timestampTrusted) {
    return {
      status: "timestamp_untrusted",
      currentKeyStatus: input.revocationEffectiveAt ? "revoked" : "valid",
      interpretation:
        "La firma es válida, pero no hay un sello temporal confiable que pruebe CUÁNDO se firmó.",
    };
  }
  if (!input.revocationEffectiveAt || input.scope === null) {
    return {
      status: "valid",
      currentKeyStatus: "valid",
      interpretation: "Firma válida, timestamp confiable y sin revocaciones aplicables.",
    };
  }

  const signatureTime = toMillis(input.signatureTime);
  const revocationTime = toMillis(input.revocationEffectiveAt);
  if (signatureTime === null || revocationTime === null) {
    return {
      status: "unknown_revocation_status",
      currentKeyStatus: "revoked",
      interpretation:
        "No puede establecerse el orden entre firma y revocación: falta evidencia temporal confiable.",
    };
  }

  if (signatureTime <= revocationTime) {
    return {
      status: "valid_at_signing_time",
      currentKeyStatus: "revoked",
      interpretation:
        "La firma era válida cuando fue creada, pero la clave/objetivo ya no puede usarse para nuevas firmas.",
    };
  }
  return {
    status: "revoked_before_signing",
    currentKeyStatus: "revoked",
    interpretation:
      "La firma se creó después de la revocación efectiva: no es válida y no puede atribuirse al emisor.",
  };
}
