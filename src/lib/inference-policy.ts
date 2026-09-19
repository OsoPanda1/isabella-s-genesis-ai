/**
 * POLÍTICA DE INFERENCIA (src/lib/inference-policy.ts)
 * -----------------------------------------------------------------
 * PRODUCTION_NORMAL → proveedor cognitivo real o FALLO explícito.
 * El fallback nativo (clasificador determinista, NO generativo) NUNCA
 * sustituye inferencia en producción; solo desarrollo lo admite y
 * siempre declarado (`provider: native-fallback, degraded: true`).
 */

export type InferenceMode = "PRODUCTION_NORMAL" | "MAINTENANCE" | "NATIVE_DECLARED";

export interface InferenceDecision {
  mode: InferenceMode;
  provider: "gemini" | "none" | "native-fallback";
  degraded: boolean;
  httpStatus: 200 | 503;
  errorCode?: "inference_unavailable";
  message?: string;
}

/**
 * Decide el modo de inferencia. Pura y testeable: sin I/O.
 *  - Sin proveedor + producción → MAINTENANCE (503 explícito).
 *  - Sin proveedor + desarrollo → NATIVE_DECLARED (200 degradado).
 *  - Con proveedor → PRODUCTION_NORMAL.
 */
export function resolveInferencePolicy(input: {
  productionLike: boolean;
  hasProvider: boolean;
}): InferenceDecision {
  if (input.hasProvider) {
    return {
      mode: "PRODUCTION_NORMAL",
      provider: "gemini",
      degraded: false,
      httpStatus: 200,
    };
  }
  if (input.productionLike) {
    return {
      mode: "MAINTENANCE",
      provider: "none",
      degraded: true,
      httpStatus: 503,
      errorCode: "inference_unavailable",
      message:
        "Proveedor cognitivo no configurado en producción. Sin fallback generativo: la inferencia requiere proveedor real o escalación humana.",
    };
  }
  return {
    mode: "NATIVE_DECLARED",
    provider: "native-fallback",
    degraded: true,
    httpStatus: 200,
    message: "Clasificador local determinista (no LLM). Solo desarrollo.",
  };
}

/** Falla de upstream en curso: producción → mantenimiento, dev → nativo declarado. */
export function resolveUpstreamFailure(input: { productionLike: boolean }): InferenceDecision {
  if (input.productionLike) {
    return {
      mode: "MAINTENANCE",
      provider: "gemini",
      degraded: true,
      httpStatus: 503,
      errorCode: "inference_unavailable",
      message:
        "Proveedor cognitivo no disponible. Reintente o escale a un humano; no se generó inferencia sustituta.",
    };
  }
  return {
    mode: "NATIVE_DECLARED",
    provider: "native-fallback",
    degraded: true,
    httpStatus: 200,
    message: "Upstream caído en desarrollo: clasificador local declarado.",
  };
}

export const INFERENCE_POLICY = {
  resolve: resolveInferencePolicy,
  upstreamFailure: resolveUpstreamFailure,
};
