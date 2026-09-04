/**
 * BOOKPI — MOTOR DEL LIBRO MAYOR (src/lib/bookpi.ts)
 * -----------------------------------------------------------------
 * Núcleo operativo del libro mayor inmutable. Real, sin mockdata:
 *  - Desacopla el motor de negocio de la autorización (quiénes pueden
 *    escribir) del repositorio de persistencia.
 *  - Conversión real de costos a centavos y validación de entrada.
 *  - Expone integridad criptográfica y consultas por tenant.
 *
 * Este motor NUNCA decide autorización de identidad; delega persistencia
 * a `BookpiRepository` y deja la autorización a `authorization.ts`.
 */

import {
  createBookpiRepository,
  type BlockPIBlock,
  type BookpiRepository,
  type LedgerCategory,
} from "./repositories/bookpi-repository";

export interface BookpiWriteRequest {
  tenantId: string;
  userId: string;
  operation: string;
  category: LedgerCategory;
  cost: number;
  tokens: number;
}

export interface BookpiRefundRequest {
  index: number;
  tenantId: string;
}

/**
 * Crea el motor BookPI con un repositorio inyectable (para test/aislamiento).
 */
export function createBookpiEngine(repository: BookpiRepository = createBookpiRepository()) {
  return {
    list(tenantId: string): BlockPIBlock[] {
      return repository.list(tenantId);
    },

    record(request: BookpiWriteRequest): { success: boolean; error?: string; block?: BlockPIBlock } {
      if (!request.tenantId) return { success: false, error: "Tenant requerido." };
      if (!request.userId) return { success: false, error: "Usuario requerido." };
      if (request.cost < 0) return { success: false, error: "Costo negativo no admitido." };
      const write = repository.append({
        tenantId: request.tenantId,
        userId: request.userId,
        operation: request.operation,
        category: request.category,
        cost: request.cost,
        tokens: request.tokens,
      });
      if (!write.success) return { success: false, error: write.error };
      return { success: true, block: write.block };
    },

    refund(request: BookpiRefundRequest): { success: boolean; error?: string } {
      return repository.refund(request.index, request.tenantId);
    },

    verifyIntegrity(): { success: boolean; error?: string; corruptedIndex?: number } {
      return repository.verifyIntegrity();
    },
  };
}

export type BookpiEngine = ReturnType<typeof createBookpiEngine>;

export const BOOKPI_ENGINE = {
  create: createBookpiEngine,
};
