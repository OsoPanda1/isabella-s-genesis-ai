import { getTraceId } from "./request-context";

/**
 * CONTRATO DE ERROR ESTRUCTURADO (src/lib/error-contract.ts)
 * -----------------------------------------------------------------
 * Todo error que cruza la frontera del sistema debe serializarse en
 * esta forma canónica: code, message, traceId, retryable, severity.
 */

export type ErrorSeverity = "info" | "warn" | "error" | "critical";

export interface ContractErrorPayload {
  code: string;
  message: string;
  traceId: string;
  retryable: boolean;
  severity: ErrorSeverity;
  /** contexto adicional opcional; nunca incluye secretos. */
  details?: Record<string, unknown>;
}

export class ContractError extends Error {
  readonly code: string;
  readonly traceId: string;
  readonly retryable: boolean;
  readonly severity: ErrorSeverity;
  readonly details?: Record<string, unknown>;
  readonly httpStatus: number;

  constructor(
    code: string,
    message: string,
    opts: {
      retryable?: boolean;
      severity?: ErrorSeverity;
      traceId?: string;
      details?: Record<string, unknown>;
      httpStatus?: number;
    } = {},
  ) {
    super(message);
    this.name = "ContractError";
    this.code = code;
    this.traceId = opts.traceId ?? getTraceId();
    this.retryable = opts.retryable ?? false;
    this.severity = opts.severity ?? "error";
    if (opts.details) this.details = opts.details;
    this.httpStatus = opts.httpStatus ?? 500;
  }

  toPayload(): ContractErrorPayload {
    return {
      code: this.code,
      message: this.message,
      traceId: this.traceId,
      retryable: this.retryable,
      severity: this.severity,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export function toContractError(payload: ContractErrorPayload): ContractError {
  const opts: ConstructorParameters<typeof ContractError>[2] = {
    traceId: payload.traceId,
    retryable: payload.retryable,
    severity: payload.severity,
  };
  if (payload.details) opts.details = payload.details;
  return new ContractError(payload.code, payload.message, opts);
}

/** Serializa HTTP para una respuesta de error estructurada. */
export function toHttpErrorBody(error: unknown): {
  status: number;
  body: ContractErrorPayload;
} {
  if (error instanceof ContractError) {
    return { status: error.httpStatus, body: error.toPayload() };
  }
  const message = error instanceof Error ? error.message : "Error interno";
  return {
    status: 500,
    body: {
      code: "INTERNAL_ERROR",
      message,
      traceId: getTraceId(),
      retryable: false,
      severity: "error",
    },
  };
}

/** Errores predefinidos comunes. */
export const Errors = {
  unauthorized: () =>
    new ContractError("UNAUTHORIZED", "Autenticación requerida", {
      severity: "warn",
      httpStatus: 401,
    }),
  forbidden: (detail?: string) =>
    new ContractError("FORBIDDEN", detail ?? "Sin permiso para esta operación", {
      severity: "warn",
      httpStatus: 403,
    }),
  notFound: (resource?: string) =>
    new ContractError("NOT_FOUND", resource ? `${resource} no encontrado` : "No encontrado", {
      severity: "info",
      httpStatus: 404,
    }),
  validation: (details?: Record<string, unknown>) => {
    const opts: ConstructorParameters<typeof ContractError>[2] = {
      severity: "info",
      httpStatus: 422,
    };
    if (details) opts.details = details;
    return new ContractError("VALIDATION_ERROR", "Entrada inválida", opts);
  },
  rateLimited: () =>
    new ContractError("RATE_LIMITED", "Demasiadas peticiones", {
      severity: "info",
      retryable: true,
      httpStatus: 429,
    }),
  conflict: (detail?: string) =>
    new ContractError("CONFLICT", detail ?? "Conflicto de estado", {
      severity: "warn",
      httpStatus: 409,
    }),
  badRequest: (detail?: string) =>
    new ContractError("BAD_REQUEST", detail ?? "Petición mal formada", {
      severity: "info",
      httpStatus: 400,
    }),
} as const;
