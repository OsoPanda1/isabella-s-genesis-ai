import { neon } from "@neondatabase/serverless";
import { createHash, randomUUID } from "node:crypto";
import { config } from "../config";
import type { BlockPIBlock, LedgerCategory, LedgerStatus } from "./bookpi-repository";

const GENESIS_PREVIOUS_HASH = "0".repeat(64);

function hashBlock(block: Omit<BlockPIBlock, "blockHash">): string {
  return createHash("sha256")
    .update([
      block.index, block.timestamp, block.tenantId, block.userId, block.operation,
      block.category, block.costDecimal, block.tokensConsumed, block.previousHash,
      block.signatureAlgorithm, block.status, block.nonce,
    ].join("|"))
    .digest("hex");
}

function mapRow(row: Record<string, unknown>): BlockPIBlock {
  return {
    index: Number(row.block_index),
    timestamp: new Date(String(row.created_at)).toISOString(),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    operation: String(row.operation),
    category: String(row.category) as LedgerCategory,
    costDecimal: String(row.cost_decimal),
    tokensConsumed: Number(row.tokens),
    previousHash: String(row.previous_hash),
    blockHash: String(row.hash),
    pqcSignature: null,
    signatureAlgorithm: "SHA-256",
    status: (String(row.status) === "refunded" ? "refunded" : "settled") as LedgerStatus,
    nonce: String(row.id),
  };
}

export function createBookpiPostgresRepository() {
  const cfg = config();
  if (!cfg.DATABASE_URL) throw new Error("DATABASE_URL is required for durable BookPI.");
  const sql = neon(cfg.DATABASE_URL);

  return {
    async list(tenantId: string): Promise<BlockPIBlock[]> {
      const rows = await sql`SELECT * FROM public.bookpi_blocks WHERE tenant_id = ${tenantId} ORDER BY block_index ASC`;
      return rows.map(mapRow);
    },
    async append(input: { tenantId: string; userId: string; operation: string; category: LedgerCategory; cost: number; tokens: number }) {
      if (!Number.isFinite(input.cost) || input.cost < 0) return { success: false as const, error: "Costo inválido." };
      if (!Number.isInteger(input.tokens) || input.tokens < 0) return { success: false as const, error: "Tokens inválidos." };
      const previous = await sql`SELECT * FROM public.bookpi_blocks WHERE tenant_id = ${input.tenantId} ORDER BY block_index DESC LIMIT 1`;
      const previousBlock = previous[0] ? mapRow(previous[0]) : null;
      const index = previousBlock ? previousBlock.index + 1 : 0;
      const timestamp = new Date().toISOString();
      const costDecimal = input.cost.toFixed(2);
      const base: Omit<BlockPIBlock, "blockHash"> = {
        index, timestamp, tenantId: input.tenantId, userId: input.userId,
        operation: input.operation.slice(0, 200), category: input.category,
        costDecimal, tokensConsumed: input.tokens,
        previousHash: previousBlock?.blockHash ?? GENESIS_PREVIOUS_HASH,
        pqcSignature: null, signatureAlgorithm: "SHA-256", status: "settled", nonce: randomUUID(),
      };
      const blockHash = hashBlock(base);
      const rows = await sql`INSERT INTO public.bookpi_blocks
        (id, tenant_id, block_index, user_id, operation, category, cost_decimal, cost_cents, tokens, previous_hash, hash, status)
        VALUES (${base.nonce}, ${base.tenantId}, ${base.index}, ${base.userId}, ${base.operation}, ${base.category}, ${base.costDecimal}, ${Math.round(input.cost * 100)}, ${base.tokensConsumed}, ${base.previousHash}, ${blockHash}, 'committed')
        RETURNING *`;
      return { success: true as const, block: mapRow(rows[0]!) };
    },
    async verifyIntegrity(tenantId?: string) {
      const rows = tenantId
        ? await sql`SELECT * FROM public.bookpi_blocks WHERE tenant_id = ${tenantId} ORDER BY block_index ASC`
        : await sql`SELECT * FROM public.bookpi_blocks ORDER BY tenant_id ASC, block_index ASC`;
      let previousTenant = "";
      let previousHash = GENESIS_PREVIOUS_HASH;
      for (const row of rows) {
        const block = mapRow(row);
        if (block.tenantId !== previousTenant) { previousTenant = block.tenantId; previousHash = GENESIS_PREVIOUS_HASH; }
        if (block.previousHash !== previousHash || hashBlock(block) !== block.blockHash) {
          return { success: false as const, error: "Cadena BookPI alterada.", corruptedIndex: block.index };
        }
        previousHash = block.blockHash;
      }
      return { success: true as const };
    },
  };
}

export type BookpiPostgresRepository = ReturnType<typeof createBookpiPostgresRepository>;
