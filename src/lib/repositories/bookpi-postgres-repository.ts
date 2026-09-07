import { Pool } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { config } from "../config";
import { canonicalBookPiPayload } from "../bookpi/canonical-payload";
import {
  getSigningAlgorithm,
  isSimulatedAlgorithm,
  signBlockHash,
  verifyBlockSignature,
  type BookPiSignatureAlgorithm,
} from "../crypto/bookpi-signer";
import type { BlockPIBlock, LedgerCategory, LedgerStatus } from "./bookpi-repository";

const GENESIS_PREVIOUS_HASH = "0".repeat(64);

let pool: Pool | null = null;
function getPool(url: string) {
  if (!pool) {
    if (!url) {
      throw new Error("CRITICAL: DATABASE_URL is missing. BookPI Ledger requires a valid PostgreSQL connection.");
    }
    pool = new Pool({ connectionString: url });
    pool.on('error', (err) => {
      console.error('Unexpected error on idle BookPI database client', err);
      process.exit(-1);
    });
  }
  return pool;
}

/**
 * Hash CANÓNICO del bloque (§6.1-§6.3): usa `canonicalBookPiPayload`, que
 * excluye firmas/campos derivados y serializa el MISMO timestamp persistido.
 * Nunca debe repetirse inline en append()/verifyIntegrity(): estás dos fases
 * deben producir el mismo hash (por eso existe canonical-payload.ts).
 */
function hashBlock(block: Omit<BlockPIBlock, "blockHash">): string {
  return createHash("sha256").update(canonicalBookPiPayload(block)).digest("hex");
}

function mapRow(row: Record<string, unknown>): BlockPIBlock {
  return {
    index: Number(row.block_index ?? row.index),
    timestamp: new Date(String(row.created_at ?? row.timestamp)).toISOString(),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    operation: String(row.operation),
    category: String(row.category) as LedgerCategory,
    costDecimal: String(row.cost_decimal),
    tokensConsumed: Number(row.tokens_consumed ?? row.tokens),
    previousHash: String(row.previous_hash),
    blockHash: String(row.block_hash ?? row.hash),
    pqcSignature: (row.pqc_signature as string) ?? null,
    signatureAlgorithm: String(row.signature_algorithm ?? "SHA-256"),
    status: (String(row.status) === "refunded" ? "refunded" : "settled") as LedgerStatus,
    nonce: String(row.id ?? randomUUID()),
  };
}

/**
 * Repositorio BookPI contra la tabla canónica `bookpi_ledger` (FASE 3 / P0-10).
 * Append-only: los refunds se registran como eventos nuevos, nunca como UPDATE
 * del bloque original. La duplicación de refunds se impide con una UNIQUE
 * constraint en `original_event_id` (no búsqueda de texto con carreras).
 */
export function createBookpiPostgresRepository() {
  const cfg = config();
  const pool = getPool(cfg.DATABASE_URL as string);

  return {
    list(tenantId: string): Promise<BlockPIBlock[]> {
      return pool
        .query("SELECT * FROM public.bookpi_ledger WHERE tenant_id = $1 ORDER BY index ASC", [tenantId])
        .then((r) => r.rows.map(mapRow));
    },
    async append(input: {
      tenantId: string;
      userId: string;
      operation: string;
      category: LedgerCategory;
      cost: number;
      tokens: number;
      status?: LedgerStatus;
      metadata?: Record<string, unknown>;
    }) {
      if (!Number.isFinite(input.cost) || input.cost < 0)
        return { success: false as const, error: "Costo inválido." };
      if (!Number.isInteger(input.tokens) || input.tokens < 0)
        return { success: false as const, error: "Tokens inválidos." };

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // P1: bloqueo advisory por tenant (evita carrera del primer bloque).
        const tenantHash = createHash("sha256").update(input.tenantId).digest();
        const lockId = tenantHash.readInt32BE(0);
        await client.query("SELECT pg_advisory_xact_lock($1)", [lockId]);

        // SELECT FOR UPDATE evita carreras sobre el previous hash.
        const { rows: previous } = await client.query(
          "SELECT * FROM public.bookpi_ledger WHERE tenant_id = $1 ORDER BY index DESC LIMIT 1 FOR UPDATE",
          [input.tenantId]
        );
        const previousBlock = previous[0] ? mapRow(previous[0]) : null;

        const index = previousBlock ? previousBlock.index + 1 : 0;
        const timestamp = new Date().toISOString();
        const costDecimal = input.cost.toFixed(2);
        const status: LedgerStatus = input.status ?? "settled";

        const base: Omit<BlockPIBlock, "blockHash"> = {
          index,
          timestamp,
          tenantId: input.tenantId,
          userId: input.userId,
          operation: input.operation.slice(0, 200),
          category: input.category,
          costDecimal,
          tokensConsumed: input.tokens,
          previousHash: previousBlock?.blockHash ?? GENESIS_PREVIOUS_HASH,
          pqcSignature: null, // se firma sobre el hash, nunca al revés
          signatureAlgorithm: getSigningAlgorithm(),
          status,
          nonce: randomUUID(),
        };

        const blockHash = hashBlock(base);

        // FASE 5 (§6.5/§6.6): firma REAL obligatoria. En producción/staging con
        // algoritmo simulado (ML-DSA-87) signBlockHash lanza fail-closed.
        if (isSimulatedAlgorithm()) {
          throw new Error(
            "CRITICAL_SECURITY_ERROR: algoritmo de firma simulado no permitido para el ledger.",
          );
        }
        const pqcSignature = signBlockHash(blockHash);
        if (!pqcSignature) {
          throw new Error(
            "CRITICAL_SECURITY_ERROR: Failed to sign BookPI block. Unverified ledger entries are forbidden.",
          );
        }

        const { rows } = await client.query(
          `INSERT INTO public.bookpi_ledger
           (index, tenant_id, user_id, operation, category, cost_decimal, tokens_consumed,
            previous_hash, block_hash, status, nonce, signature_algorithm, pqc_signature)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING *`,
          [base.index, base.tenantId, base.userId, base.operation, base.category, base.costDecimal,
           base.tokensConsumed, base.previousHash, blockHash, status, base.nonce,
           base.signatureAlgorithm, pqcSignature]
        );
        await client.query("COMMIT");
        return { success: true as const, block: mapRow(rows[0]!) };
      } catch (err) {
        await client.query("ROLLBACK");
        return { success: false as const, error: "Fallo transaccional" };
      } finally {
        client.release();
      }
    },
    async batchAppend(inputs: Array<{
      tenantId: string;
      userId: string;
      operation: string;
      category: LedgerCategory;
      cost: number;
      tokens: number;
      status?: LedgerStatus;
      metadata?: Record<string, unknown>;
    }>) {
      if (isSimulatedAlgorithm()) {
        throw new Error(
          "CRITICAL_SECURITY_ERROR: algoritmo de firma simulado no permitido para el ledger.",
        );
      }
      
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        
        // Group inputs by tenant to handle locks correctly and fetch previous hash once per tenant
        const tenantGroups = new Map<string, typeof inputs>();
        for (const input of inputs) {
          if (!tenantGroups.has(input.tenantId)) tenantGroups.set(input.tenantId, []);
          tenantGroups.get(input.tenantId)!.push(input);
        }
        
        const results: BlockPIBlock[] = [];
        
        for (const [tenantId, tenantInputs] of tenantGroups.entries()) {
          const tenantHash = createHash("sha256").update(tenantId).digest();
          const lockId = tenantHash.readInt32BE(0);
          await client.query("SELECT pg_advisory_xact_lock($1)", [lockId]);
          
          const { rows: previous } = await client.query(
            "SELECT * FROM public.bookpi_ledger WHERE tenant_id = $1 ORDER BY index DESC LIMIT 1 FOR UPDATE",
            [tenantId]
          );
          
          let previousBlock = previous[0] ? mapRow(previous[0]) : null;
          
          for (const input of tenantInputs) {
            if (!Number.isFinite(input.cost) || input.cost < 0) {
              await client.query("ROLLBACK");
              return { success: false as const, error: "Costo inválido." };
            }
            if (!Number.isInteger(input.tokens) || input.tokens < 0) {
              await client.query("ROLLBACK");
              return { success: false as const, error: "Tokens inválidos." };
            }
            
            const index = previousBlock ? previousBlock.index + 1 : 0;
            const timestamp = new Date().toISOString();
            const costDecimal = input.cost.toFixed(2);
            const status: LedgerStatus = input.status ?? "settled";
            
            const base: Omit<BlockPIBlock, "blockHash"> = {
              index,
              timestamp,
              tenantId: input.tenantId,
              userId: input.userId,
              operation: input.operation.slice(0, 200),
              category: input.category,
              costDecimal,
              tokensConsumed: input.tokens,
              previousHash: previousBlock?.blockHash ?? GENESIS_PREVIOUS_HASH,
              pqcSignature: null,
              signatureAlgorithm: getSigningAlgorithm(),
              status,
              nonce: randomUUID(),
            };
            
            const blockHash = hashBlock(base);
            const pqcSignature = signBlockHash(blockHash);
            if (!pqcSignature) {
              await client.query("ROLLBACK");
              return { success: false as const, error: "Failed to sign BookPI block." };
            }
            
            const { rows } = await client.query(
              `INSERT INTO public.bookpi_ledger
               (index, tenant_id, user_id, operation, category, cost_decimal, tokens_consumed,
                previous_hash, block_hash, status, nonce, signature_algorithm, pqc_signature)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
               RETURNING *`,
              [base.index, base.tenantId, base.userId, base.operation, base.category, base.costDecimal,
               base.tokensConsumed, base.previousHash, blockHash, status, base.nonce,
               base.signatureAlgorithm, pqcSignature]
            );
            
            const newBlock = mapRow(rows[0]!);
            results.push(newBlock);
            previousBlock = newBlock;
          }
        }
        
        await client.query("COMMIT");
        return { success: true as const, blocks: results };
      } catch (err) {
        await client.query("ROLLBACK");
        return { success: false as const, error: "Fallo transaccional" };
      } finally {
        client.release();
      }
    },
    async query(
      tenantId: string,
      filter: { category?: LedgerCategory; userId?: string; fromDate?: Date; toDate?: Date }
    ): Promise<BlockPIBlock[]> {
      let query = "SELECT * FROM public.bookpi_ledger WHERE tenant_id = $1";
      const params: any[] = [tenantId];
      let paramIndex = 2;
      
      if (filter.category) {
        query += ` AND category = $${paramIndex++}`;
        params.push(filter.category);
      }
      if (filter.userId) {
        query += ` AND user_id = $${paramIndex++}`;
        params.push(filter.userId);
      }
      if (filter.fromDate) {
        query += ` AND timestamp >= $${paramIndex++}`;
        params.push(filter.fromDate.toISOString());
      }
      if (filter.toDate) {
        query += ` AND timestamp <= $${paramIndex++}`;
        params.push(filter.toDate.toISOString());
      }
      
      query += " ORDER BY index ASC";
      
      const { rows } = await pool.query(query, params);
      return rows.map(mapRow);
    },
    async prune(tenantId: string, maxAgeMs: number): Promise<{ success: boolean; prunedCount: number; error?: string }> {
      const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const tenantHash = createHash("sha256").update(tenantId).digest();
        const lockId = tenantHash.readInt32BE(0);
        await client.query("SELECT pg_advisory_xact_lock($1)", [lockId]);
        
        const { rows } = await client.query(
          "SELECT * FROM public.bookpi_ledger WHERE tenant_id = $1 ORDER BY index ASC",
          [tenantId]
        );
        const blocks = rows.map(mapRow);
        
        const blocksToKeep = blocks.filter(b => b.timestamp > cutoff);
        const prunedCount = blocks.length - blocksToKeep.length;
        if (prunedCount === 0) {
          await client.query("COMMIT");
          return { success: true, prunedCount: 0 };
        }
        
        await client.query("DELETE FROM public.bookpi_ledger WHERE tenant_id = $1", [tenantId]);
        
        let prevHash = GENESIS_PREVIOUS_HASH;
        for (let i = 0; i < blocksToKeep.length; i++) {
          const block = blocksToKeep[i];
          block.index = i;
          block.previousHash = prevHash;
          
          const base: Omit<BlockPIBlock, "blockHash"> = {
            index: block.index,
            timestamp: block.timestamp,
            tenantId: block.tenantId,
            userId: block.userId,
            operation: block.operation.slice(0, 200),
            category: block.category,
            costDecimal: block.costDecimal,
            tokensConsumed: block.tokensConsumed,
            previousHash: block.previousHash,
            pqcSignature: null,
            signatureAlgorithm: getSigningAlgorithm(),
            status: block.status,
            nonce: block.nonce,
          };
          const blockHash = hashBlock(base);
          if (isSimulatedAlgorithm()) {
             throw new Error("CRITICAL_SECURITY_ERROR: algoritmo simulado.");
          }
          const pqcSignature = signBlockHash(blockHash);
          if (!pqcSignature) throw new Error("Firma fallida");
          
          await client.query(
            `INSERT INTO public.bookpi_ledger
             (index, tenant_id, user_id, operation, category, cost_decimal, tokens_consumed,
              previous_hash, block_hash, status, nonce, signature_algorithm, pqc_signature)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [base.index, base.tenantId, base.userId, base.operation, base.category, base.costDecimal,
             base.tokensConsumed, base.previousHash, blockHash, block.status, base.nonce,
             base.signatureAlgorithm, pqcSignature]
          );
          prevHash = blockHash;
        }
        
        await client.query("COMMIT");
        return { success: true, prunedCount };
      } catch (err) {
        await client.query("ROLLBACK");
        return { success: false, error: "Fallo transaccional", prunedCount: 0 };
      } finally {
        client.release();
      }
    },
    async pruneInactive(inactiveDays: number): Promise<{ success: boolean; prunedTenants: string[]; error?: string }> {
      const inactiveMs = inactiveDays * 24 * 60 * 60 * 1000;
      const cutoffDate = new Date(Date.now() - inactiveMs).toISOString();
      
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        
        // Find tenants whose latest block is older than cutoffDate
        const { rows } = await client.query(`
          SELECT tenant_id
          FROM public.bookpi_ledger
          GROUP BY tenant_id
          HAVING MAX(created_at) < $1
        `, [cutoffDate]);
        
        const tenantsToPrune = rows.map((r: any) => String(r.tenant_id));
        
        if (tenantsToPrune.length > 0) {
          // Delete all records for these tenants
          await client.query(
            "DELETE FROM public.bookpi_ledger WHERE tenant_id = ANY($1)",
            [tenantsToPrune]
          );
        }
        
        await client.query("COMMIT");
        return { success: true, prunedTenants: tenantsToPrune };
      } catch (err) {
        await client.query("ROLLBACK");
        return { success: false, prunedTenants: [], error: "Fallo transaccional" };
      } finally {
        client.release();
      }
    },
    async refund(
      originalEventId: string,
      requestor: { tenantId: string; userId: string },
      reason: string,
    ) {
      // FASE 3: refund como nuevo evento; NUNCA UPDATE del original.
      // §6.7: la idempotencia del refund la garantiza la UNIQUE PARTIAL index
      // sobre bookpi_ledger.original_event_id. Dos refunds simultáneos →
      // 1 insert + 1 violación de constraint (rollback) — nunca 2 refunds.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const tenantHash = createHash("sha256").update(requestor.tenantId).digest();
        const lockId = tenantHash.readInt32BE(0);
        await client.query("SELECT pg_advisory_xact_lock($1)", [lockId]);

        const { rows: byId } = await client.query(
          "SELECT * FROM public.bookpi_ledger WHERE tenant_id = $1 AND (id::text = $2 OR index::text = $2) LIMIT 1 FOR UPDATE",
          [requestor.tenantId, originalEventId],
        );
        const original = byId[0] ? mapRow(byId[0]) : null;
        if (!original) {
          await client.query("ROLLBACK");
          return { success: false as const, error: "Evento original no encontrado." };
        }
        if (original.status === "refunded") {
          await client.query("ROLLBACK");
          return { success: false as const, error: "Evento ya refundido." };
        }

        // El refund encadena del ÚLTIMO bloque del tenant (no del original):
        // otros bloques pudieron haberse asentado después del evento original.
        const { rows: latestRows } = await client.query(
          "SELECT * FROM public.bookpi_ledger WHERE tenant_id = $1 ORDER BY index DESC LIMIT 1 FOR UPDATE",
          [requestor.tenantId],
        );
        const latestBlock = latestRows[0] ? mapRow(latestRows[0]) : original;

        const timestamp = new Date().toISOString();
        const base: Omit<BlockPIBlock, "blockHash"> = {
          index: latestBlock.index + 1,
          timestamp,
          tenantId: requestor.tenantId,
          userId: requestor.userId,
          operation: `refund_of_${original.index}_${reason}`.slice(0, 200),
          category: original.category,
          costDecimal: original.costDecimal,
          tokensConsumed: 0,
          previousHash: latestBlock.blockHash,
          pqcSignature: null,
          signatureAlgorithm: getSigningAlgorithm(),
          status: "refunded",
          nonce: randomUUID(),
        };
        const blockHash = hashBlock(base);
        if (isSimulatedAlgorithm()) {
          await client.query("ROLLBACK");
          return { success: false as const, error: "Algoritmo simulado no permitido." };
        }
        const pqcSignature = signBlockHash(blockHash);

        const { rows } = await client.query(
          `INSERT INTO public.bookpi_ledger
           (index, tenant_id, user_id, operation, category, cost_decimal, tokens_consumed,
            previous_hash, block_hash, status, nonce, signature_algorithm, pqc_signature,
            original_event_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           RETURNING *`,
          [base.index, base.tenantId, base.userId, base.operation, base.category, base.costDecimal,
           base.tokensConsumed, base.previousHash, blockHash, "refunded", base.nonce,
           base.signatureAlgorithm, pqcSignature, original.nonce]
        );
        await client.query("COMMIT");
        return { success: true as const, block: mapRow(rows[0]!) };
      } catch (err) {
        await client.query("ROLLBACK");
        return { success: false as const, error: "Evento ya refundido (constraint de unicidad)." };
      } finally {
        client.release();
      }
    },
    async verifyIntegrity(tenantId?: string) {
      let rows: Record<string, unknown>[];
      if (tenantId) {
        const res = await pool.query("SELECT * FROM public.bookpi_ledger WHERE tenant_id = $1 ORDER BY index ASC", [tenantId]);
        rows = res.rows;
      } else {
        const res = await pool.query("SELECT * FROM public.bookpi_ledger ORDER BY tenant_id ASC, index ASC");
        rows = res.rows;
      }
      let previousTenant = "";
      let previousHash = GENESIS_PREVIOUS_HASH;
      for (const row of rows) {
        const block = mapRow(row);
        if (block.tenantId !== previousTenant) {
          previousTenant = block.tenantId;
          previousHash = GENESIS_PREVIOUS_HASH;
        }
        // §6.1: el hash se recomputa con el MISMO payload canónico que en append().
        if (block.previousHash !== previousHash) {
          return {
            success: false as const,
            error: "Cadena BookPI rota.",
            corruptedIndex: block.index,
          };
        }
        const recomputed = hashBlock(block);
        if (recomputed !== block.blockHash) {
          return {
            success: false as const,
            error: "Cadena BookPI alterada.",
            corruptedIndex: block.index,
          };
        }
        // §6.5: verifica la firma real (rechaza bloques sin firma o con firma inválida).
        if (!verifyBlockSignature(block.blockHash, block.pqcSignature)) {
          return {
            success: false as const,
            error: "Firma BookPI inválida o ausente.",
            corruptedIndex: block.index,
          };
        }
        previousHash = block.blockHash;
      }
      return { success: true as const };
    },
  };
}

export type BookpiPostgresRepository = ReturnType<typeof createBookpiPostgresRepository>;
export type { BookPiSignatureAlgorithm };