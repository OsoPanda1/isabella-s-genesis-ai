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
      throw new Error(
        "CRITICAL: DATABASE_URL is missing. BookPI Ledger requires a valid PostgreSQL connection.",
      );
    }
    pool = new Pool({
      connectionString: url,
      // P0-16: límites operativos explícitos — nunca esperar indefinidamente.
      max: 10,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 15_000,
    });
    pool.on("error", (err) => {
      console.error("Unexpected error on idle BookPI database client", err);
      process.exit(-1);
    });
  }
  return pool;
}

/** Cierre ordenado del pool BookPI (shutdown limpio; idempotente). */
export function disposeBookpiPool(): Promise<void> {
  if (!pool) return Promise.resolve();
  const toClose = pool;
  pool = null;
  return toClose.end();
}

/**
 * Hash CANÓNICO del bloque (§6.1-§6.3): usa `canonicalBookPiPayload`, que
 * excluye firmas/campos derivados y serializa el MISMO timestamp persistido.
 * Nunca debe repetirse inline en append()/verifyIntegrity(): estas dos fases
 * deben producir el mismo hash (por eso existe canonical-payload.ts).
 */
function hashBlock(block: Omit<BlockPIBlock, "blockHash">): string {
  return createHash("sha256").update(canonicalBookPiPayload(block)).digest("hex");
}

/**
 * Algoritmos soportados por la columna `signature_algorithm` / `pqc_signature`.
 * - NOT_IMPLEMENTED: sin firma criptográfica (default del esquema).
 * - ECDSA_P256_SHA256 / ED25519: firma real sobre el hash del bloque.
 * El entorno debe declarar BOOKPI_SIGNATURE_ALGORITHM y BOOKPI_SIGNING_KEY
 * (clave privada PEM) para activar las firmas.
 */
export const BOOKPI_SIGNATURE_ALGORITHMS = [
  "NOT_IMPLEMENTED",
  "ECDSA_P256_SHA256",
  "ED25519",
] as const;
export type BookpiSignatureAlgorithm = (typeof BOOKPI_SIGNATURE_ALGORITHMS)[number];

function resolvedSignatureAlgorithm(): BookpiSignatureAlgorithm {
  const raw = config().BOOKPI_SIGNATURE_ALGORITHM?.trim() || "NOT_IMPLEMENTED";
  if ((BOOKPI_SIGNATURE_ALGORITHMS as readonly string[]).includes(raw)) {
    return raw as BookpiSignatureAlgorithm;
  }
  throw new Error(
    `BOOKPI_SIGNATURE_ALGORITHM inválido: "${raw}". Valores soportados: ${BOOKPI_SIGNATURE_ALGORITHMS.join(", ")} (fail-closed).`,
  );
}

function signBlockHash(blockHash: string, key: string, algorithm: BookpiSignatureAlgorithm): string {
  const signer = algorithm === "ED25519" ? createSign(null) : createSign("SHA256");
  signer.update(blockHash);
  return signer.end().sign({ key, padding: undefined }, "base64");
}

function verifyBlockHash(
  blockHash: string,
  signature: string,
  key: string,
  algorithm: BookpiSignatureAlgorithm,
): boolean {
  const verifier = algorithm === "ED25519" ? createVerify(null) : createVerify("SHA256");
  verifier.update(blockHash);
  return verifier.verify({ key, padding: undefined }, signature, "base64");
}

/**
 * Respaldo de firma: devuelve la clave privada PEM de BOOKPI_SIGNING_KEY cuando
 * el algoritmo declarado lo requiere (fail-closed si falta).
 */
function signingKeyFor(algorithm: BookpiSignatureAlgorithm): string | null {
  if (algorithm === "NOT_IMPLEMENTED") return null;
  return secrets.bookpiSigningKey() || null;
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

  /**
   * Listado de bloques por tenant.
   */
  list(tenantId: string): Promise<BlockPIBlock[]> {
    return pool
      .query("SELECT * FROM public.bookpi_ledger WHERE tenant_id = $1 ORDER BY index ASC", [
        tenantId,
      ])
      .then((r) => r.rows.map(mapRow));
  }

  /**
   * Append atómico de un bloque BookPI (usando Pool/pg).
   */
  async function appendOnce(input: {
    tenantId: string;
    userId: string;
    operation: string;
    category: LedgerCategory;
    cost: number;
    tokens: number;
    status?: LedgerStatus;
  }) {
    const previousBlock = await readPrevious(input.tenantId);
    const index = previousBlock ? previousBlock.index + 1 : 0;
    const timestamp = new Date().toISOString();
    const costDecimal = input.cost.toFixed(2);
    const status: LedgerStatus = input.status ?? "settled";
    const signatureAlgorithm = resolvedSignatureAlgorithm();
    const signingKey = signingKeyFor(signatureAlgorithm);
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
      signatureAlgorithm,
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

    const { rows } = await pool.query(
      `INSERT INTO public.bookpi_ledger
       (index, tenant_id, user_id, operation, category, cost_decimal, tokens_consumed,
       previous_hash, block_hash, status, nonce, signature_algorithm, pqc_signature)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        base.index,
        base.tenantId,
        base.userId,
        base.operation,
        base.category,
        base.costDecimal,
        base.tokensConsumed,
        base.previousHash,
        blockHash,
        status,
        base.nonce,
        base.signatureAlgorithm,
        pqcSignature,
      ],
    );
    return { success: true as const, block: mapRow(rows[0]!) };
  }

  /**
   * Append con concurrencia segura usando advisory locks.
   */
  async function append(input: {
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
        [input.tenantId],
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
        await client.query("ROLLBACK");
        return {
          success: false as const,
          error: "CRITICAL_SECURITY_ERROR: Failed to sign BookPI block.",
        };
      }

      const { rows } = await client.query(
        `INSERT INTO public.bookpi_ledger
         (index, tenant_id, user_id, operation, category, cost_decimal, tokens_consumed,
         previous_hash, block_hash, status, nonce, signature_algorithm, pqc_signature)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          base.index,
          base.tenantId,
          base.userId,
          base.operation,
          base.category,
          base.costDecimal,
          base.tokensConsumed,
          base.previousHash,
          blockHash,
          status,
          base.nonce,
          base.signatureAlgorithm,
          pqcSignature,
        ],
      );
      await client.query("COMMIT");
      return { success: true as const, block: mapRow(rows[0]!) };
    } catch {
      await client.query("ROLLBACK");
      return { success: false as const, error: "Fallo transaccional" };
    } finally {
      client.release();
    }
  }

  /**
   * Batch append optimizado: agrupa inputs por tenant para bloqueos por tenant.
   */
  async function batchAppend(
    inputs: Array<{
      tenantId: string;
      userId: string;
      operation: string;
      category: LedgerCategory;
      cost: number;
      tokens: number;
      status?: LedgerStatus;
      metadata?: Record<string, unknown>;
    }>,
  ) {
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
          [tenantId],
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
            return {
              success: false as const,
              error: "Failed to sign BookPI block.",
            };
          }

          const { rows } = await client.query(
            `INSERT INTO public.bookpi_ledger
             (index, tenant_id, user_id, operation, category, cost_decimal, tokens_consumed,
             previous_hash, block_hash, status, nonce, signature_algorithm, pqc_signature)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING *`,
            [
              base.index,
              base.tenantId,
              base.userId,
              base.operation,
              base.category,
              base.costDecimal,
              base.tokensConsumed,
              base.previousHash,
              blockHash,
              status,
              base.nonce,
              base.signatureAlgorithm,
              pqcSignature,
            ],
          );

          const newBlock = mapRow(rows[0]!);
          results.push(newBlock);
          previousBlock = newBlock;
        }
      }

      await client.query("COMMIT");
      return { success: true as const, blocks: results };
    } catch {
      await client.query("ROLLBACK");
      return { success: false as const, error: "Fallo transaccional" };
    } finally {
      client.release();
    }
  }

  /**
   * Query de bloques por tenant con filtros opcionales.
   */
  async function query(
    tenantId: string,
    filter: {
      category?: LedgerCategory;
      userId?: string;
      fromDate?: Date;
      toDate?: Date;
    },
  ): Promise<BlockPIBlock[]> {
    let query = "SELECT * FROM public.bookpi_ledger WHERE tenant_id = $1";
    const params: unknown[] = [tenantId];
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
  }

  /**
   * Poda de bloques antiguos por tiempo máximo.
   */
  async function prune(
    tenantId: string,
    maxAgeMs: number,
  ): Promise<{ success: boolean; prunedCount: number; error?: string }> {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const tenantHash = createHash("sha256").update(tenantId).digest();
      const lockId = tenantHash.readInt32BE(0);
      await client.query("SELECT pg_advisory_xact_lock($1)", [lockId]);

      const { rows } = await client.query(
        "SELECT * FROM public.bookpi_ledger WHERE tenant_id = $1 ORDER BY index ASC",
        [tenantId],
      );
      const blocks = rows.map(mapRow);

      const blocksToKeep = blocks.filter((b) => b.timestamp > cutoff);
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
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            base.index,
            base.tenantId,
            base.userId,
            base.operation,
            base.category,
            base.costDecimal,
            base.tokensConsumed,
            base.previousHash,
            blockHash,
            block.status,
            base.nonce,
            base.signatureAlgorithm,
            pqcSignature,
          ],
        );
        prevHash = blockHash;
      }

      await client.query("COMMIT");
      return { success: true, prunedCount };
    } catch {
      await client.query("ROLLBACK");
      return { success: false, error: "Fallo transaccional", prunedCount: 0 };
    } finally {
      client.release();
    }
  }

  /**
   * Poda de tenants inactivos (sin bloques recientes).
   */
  async function pruneInactive(
    inactiveDays: number,
  ): Promise<{ success: boolean; prunedTenants: string[]; error?: string }> {
    const inactiveMs = inactiveDays * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(Date.now() - inactiveMs).toISOString();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Find tenants whose latest block is older than cutoffDate
      const { rows } = await client.query(
        `
        SELECT tenant_id
        FROM public.bookpi_ledger
        GROUP BY tenant_id
        HAVING MAX(created_at) < $1
      `,
        [cutoffDate],
      );

      const tenantsToPrune = rows.map((r: { tenant_id: unknown }) => String(r.tenant_id));

      if (tenantsToPrune.length > 0) {
        // Delete all records for these tenants
        await client.query("DELETE FROM public.bookpi_ledger WHERE tenant_id = ANY($1)", [
          tenantsToPrune,
        ]);
      }

      await client.query("COMMIT");
      return { success: true, prunedTenants: tenantsToPrune };
    } catch {
      await client.query("ROLLBACK");
      return {
        success: false,
        prunedTenants: [],
        error: "Fallo transaccional",
      };
    } finally {
      client.release();
    }
  }

  /**
   * Refund como nuevo evento (append-only). NUNCA UPDATE del original.
   * §6.7: la idempotencia del refund la garantiza la UNIQUE PARTIAL index
   * sobre bookpi_ledger.original_event_id. Dos refunds simultáneos →
   * 1 insert + 1 violación de constraint (rollback) — nunca 2 refunds.
   */
  async function refund(
    originalEventId: string,
    requestor: { tenantId: string; userId: string },
    reason: string,
  ) {
    // FASE 3: refunds como nuevo evento, nunca UPDATE del original.
    // El esquema no expone `id`; el identificador del evento es su `index`.
    const index = Number(originalEventId);
    if (!Number.isInteger(index) || index < 0)
      return { success: false as const, error: "Índice de bloque inválido." };
    const byIndex =
      await pool.query(
        "SELECT * FROM public.bookpi_ledger WHERE tenant_id = $1 AND index = $2 LIMIT 1",
        [requestor.tenantId, originalEventId],
      );
    const original = byIndex[0] ? mapRow(byIndex[0]) : null;
    if (!original) return { success: false as const, error: "Evento original no encontrado." };
    if (original.status === "refunded")
      return { success: false as const, error: "Evento ya refundido." };
    return this.append({
      tenantId: requestor.tenantId,
      userId: requestor.userId,
      operation: `refund_of_${original.index}_${reason}`,
      category: original.category,
      cost: original.costDecimal ? Number(original.costDecimal) : 0,
      tokens: 0,
      status: "refunded",
    });
  }

  /**
   * Verifica la integridad de la cadena BookPI.
   * §6.1: el hash se recomputa con el MISMO payload canónico que en append().
   * §6.5: verifica la firma real (rechaza bloques sin firma o con firma inválida).
   */
  async function verifyIntegrity(tenantId?: string) {
    let rows: Record<string, unknown>[];
    if (tenantId) {
      const res = await pool.query(
        "SELECT * FROM public.bookpi_ledger WHERE tenant_id = $1 ORDER BY index ASC",
        [tenantId],
      );
      rows = res.rows;
    } else {
      const res = await pool.query(
        "SELECT * FROM public.bookpi_ledger ORDER BY tenant_id ASC, index ASC",
      );
      rows = res.rows;
    }
    let previousTenant = "";
    let previousHash = GENESIS_PREVIOUS_HASH;
    const signingAlgorithm = resolvedSignatureAlgorithm();
    const verifyingKey = signingKeyFor(signingAlgorithm);
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
  }
}

/**
 * Tipo exportado para consumidores del repositorio.
 */
export type BookpiPostgresRepository = ReturnType<typeof createBookpiPostgresRepository>;
export type { BookPiSignatureAlgorithm };