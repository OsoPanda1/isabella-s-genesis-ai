import * as crypto from "node:crypto";
import { config } from "./config";

export interface MerkleNode {
  hash: string;
  left?: MerkleNode;
  right?: MerkleNode;
}

export interface MerkleTree {
  root: string;
  leaves: string[];
}

/**
 * Sovereign Audit implementation for QUP v3.0
 * Uses strictly SHA3-512 for hashing.
 */
export class SovereignAudit {
  /**
   * Hashes data using SHA3-512
   */
  public static hashData(data: string | Buffer): string {
    return crypto.createHash("sha3-512").update(data).digest("hex");
  }

  /**
   * Builds a Merkle Tree from a list of data strings (leaves).
   * Ensures immutable job traceability.
   */
  public static buildMerkleTree(dataLeaves: string[]): MerkleTree {
    if (dataLeaves.length === 0) {
      throw new Error("Cannot build Merkle tree from empty leaves");
    }

    const leafHashes = dataLeaves.map((leaf) => this.hashData(leaf));
    const rootHash = this.computeRoot(leafHashes);

    return {
      root: rootHash,
      leaves: leafHashes,
    };
  }

  private static computeRoot(hashes: string[]): string {
    if (hashes.length === 1) {
      return hashes[0];
    }

    const nextLevel: string[] = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = i + 1 < hashes.length ? hashes[i + 1] : left; // Duplicate last if odd
      nextLevel.push(this.hashData(left + right));
    }

    return this.computeRoot(nextLevel);
  }

  /**
   * Sello de auditoría soberana (HMAC-SHA3-512 con `AEGIS_AUDIT_SECRET`).
   *
   * Criptografía real verificable por la misma autoridad que emite el
   * sello (comparación en tiempo constante). ML-DSA-87 (FIPS 204) está
   * declarado en el contrato SOLO como SIMULATION-ONLY porque el runtime
   * Node 22/OpenSSL 3.0 no dispone de primitivas ML-DSA; ningún sello
   * etiquetado ML-DSA se considera autoridad de firma (ver `env-schema.ts`).
   * Fail-closed: sin secreto de auditoría no hay sello.
   */
  public static async signAuditSeal(payloadHash: string): Promise<string> {
    const secret = config().AEGIS_AUDIT_SECRET;
    if (!secret) {
      throw new Error("[SovereignAudit] AEGIS_AUDIT_SECRET ausente: sello denegado (fail-closed).");
    }
    const mac = crypto
      .createHmac("sha3-512", secret)
      .update(payloadHash, "utf8")
      .digest("base64url");
    return `audit-seal-v1:${mac}`;
  }

  /**
   * Verificación real del sello: recomputa el HMAC y compara en tiempo
   * constante. Nunca asume validez por prefijo.
   */
  public static async verifyAuditSeal(payloadHash: string, seal: string): Promise<boolean> {
    const PREFIX = "audit-seal-v1:";
    if (!seal.startsWith(PREFIX)) return false;
    let secret: string | undefined;
    try {
      secret = config().AEGIS_AUDIT_SECRET;
    } catch {
      return false;
    }
    if (!secret) return false;
    const expected = crypto.createHmac("sha3-512", secret).update(payloadHash, "utf8").digest();
    const presented = Buffer.from(seal.slice(PREFIX.length), "base64url");
    if (presented.length !== expected.length) return false;
    return crypto.timingSafeEqual(presented, expected);
  }
}
