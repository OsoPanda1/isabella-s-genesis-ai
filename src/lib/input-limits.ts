import { config } from "./config";

/**
 * LÍMITES GLOBALES DE ENTRADA (src/lib/input-limits.ts)
 * -----------------------------------------------------------------
 * Límites de body, mensajes, adjuntos, headers, memoria y herramientas.
 * Todas las entradas externas se validan contra estos límites en la
 * capa de transporte (server.ts) y en el request-schema.
 */

export interface InputLimits {
  maxBodyBytes: number;
  maxMessages: number;
  maxAttachmentBytes: number;
  maxToolsPerRequest: number;
  maxHeaderBytes: number;
  maxTimeoutMs: number;
}

export function getInputLimits(): InputLimits {
  const cfg = config();
  return {
    maxBodyBytes: cfg.INPUT_MAX_BODY_BYTES,
    maxMessages: cfg.INPUT_MAX_MESSAGES,
    maxAttachmentBytes: cfg.INPUT_MAX_ATTACHMENT_BYTES,
    maxToolsPerRequest: cfg.INPUT_MAX_TOOLS_PER_REQUEST,
    maxHeaderBytes: 16 * 1024,
    maxTimeoutMs: cfg.LLM_UPSTREAM_TIMEOUT_MS,
  };
}

export function assertBodyWithinLimits(length: number): void {
  if (length > getInputLimits().maxBodyBytes) {
    throw new LimitError("BODY_TOO_LARGE", getInputLimits().maxBodyBytes, length);
  }
}

export function assertMessagesWithinLimits(count: number): void {
  if (count > getInputLimits().maxMessages) {
    throw new LimitError("TOO_MANY_MESSAGES", getInputLimits().maxMessages, count);
  }
}

export function assertAttachmentWithinLimits(bytes: number): void {
  if (bytes > getInputLimits().maxAttachmentBytes) {
    throw new LimitError("ATTACHMENT_TOO_LARGE", getInputLimits().maxAttachmentBytes, bytes);
  }
}

export function assertToolsWithinLimits(count: number): void {
  if (count > getInputLimits().maxToolsPerRequest) {
    throw new LimitError("TOO_MANY_TOOLS", getInputLimits().maxToolsPerRequest, count);
  }
}

export class LimitError extends Error {
  readonly code: string;
  readonly limit: number;
  readonly actual: number;

  constructor(code: string, limit: number, actual: number) {
    super(`${code}: límite ${limit}, recibido ${actual}`);
    this.name = "LimitError";
    this.code = code;
    this.limit = limit;
    this.actual = actual;
  }
}
