/**
 * BOOKPI ENGINE (src/lib/bookpi/BookPiEngine.ts)
 * -----------------------------------------------------------------
 * Motor criptográfico de registro de obras (blueprint TAMV v1.0):
 *  1. Chunking a 64 KiB con hash SHA-256 por fragmento.
 *  2. Árbol binario de Merkle + raíz criptográfica + pruebas de inclusión.
 *  3. Compromiso ZK (C = SHA256(merkleRoot ∥ authorId ∥ salt)).
 *  4. Firma del payload con la autoridad criptográfica del proyecto
 *     (`bookpi-signer`): establece ECDSA-P384/RSA-SHA256 por configuración.
 *
 * §17: si el algoritmo configurado es simulación (ML-DSA-87), serechaza firmar
 * en producción (esta función NO produce autoridad criptográfica simulada).
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { signBlockHash, getSigningAlgorithm, isSimulatedAlgorithm } from "../crypto/bookpi-signer";

export interface ChunkProof {
  chunkIndex: number;
  chunkHash: string;
  proofPath: Array<{ hash: string; position: "left" | "right" }>;
  root: string;
}

export interface BookPiRegistrationPayload {
  authorId: string;
  title: string;
  category: "MANUSCRIPT" | "CODE_REPOS" | "ACADEMIC_PAPER" | "AUDIO_SCORE";
  fileBuffer: Buffer;
  secretSalt?: string;
}

export interface BookPiRegistrationResult {
  manuscriptId: string;
  merkleRoot: string;
  payloadHash: string;
  zkCommitment: string;
  pqcSignature: string;
  signatureAlgorithm: string;
  totalChunks: number;
  chunksHashes: string[];
}

export interface RoyaltySplitResult {
  federationId: number;
  basisPoints: number;
  payoutAmountWei: string;
  walletAddress: string;
}

function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export class BookPiEngine {
  private static readonly CHUNK_SIZE = 64 * 1024; // 64 KiB

  /** Divide un buffer en fragmentos de 64 KB y calcula su hash SHA-256. */
  public static chunkBuffer(buffer: Buffer): { hashes: string[]; rawChunks: Buffer[] } {
    const hashes: string[] = [];
    const rawChunks: Buffer[] = [];
    let offset = 0;
    while (offset < buffer.length) {
      const chunk = buffer.subarray(offset, offset + this.CHUNK_SIZE);
      hashes.push(sha256Hex(chunk));
      rawChunks.push(chunk);
      offset += this.CHUNK_SIZE;
    }
    return { hashes, rawChunks };
  }

  /** Construye el árbol binario de Merkle y retorna la raíz + niveles. */
  public static buildMerkleTree(leafHashes: string[]): { root: string; tree: string[][] } {
    if (leafHashes.length === 0) {
      throw new Error("No se pueden procesar hojas vacías para el árbol de Merkle.");
    }
    const tree: string[][] = [leafHashes];
    let currentLevel = leafHashes;
    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
        nextLevel.push(sha256Hex(left + right));
      }
      tree.push(nextLevel);
      currentLevel = nextLevel;
    }
    return { root: currentLevel[0] as string, tree };
  }

  /** Prueba de inclusión de Merkle para un chunk (O(log N)). */
  public static generateMerkleProof(leafHashes: string[], targetIndex: number): ChunkProof {
    if (targetIndex < 0 || targetIndex >= leafHashes.length) {
      throw new Error("Índice de chunk fuera de rango.");
    }
    const { root, tree } = this.buildMerkleTree(leafHashes);
    const proofPath: Array<{ hash: string; position: "left" | "right" }> = [];
    let index = targetIndex;

    for (let level = 0; level < tree.length - 1; level++) {
      const currentLevel = tree[level];
      const isRightNode = index % 2 === 1;
      const siblingIndex = isRightNode ? index - 1 : index + 1;

      if (siblingIndex < currentLevel.length) {
        proofPath.push({
          hash: currentLevel[siblingIndex] as string,
          position: isRightNode ? "left" : "right",
        });
      } else {
        proofPath.push({
          hash: currentLevel[index] as string,
          position: "right",
        });
      }
      index = Math.floor(index / 2);
    }

    return {
      chunkIndex: targetIndex,
      chunkHash: leafHashes[targetIndex] as string,
      proofPath,
      root,
    };
  }

  /** Verifica un chunk contra la raíz de Merkle. */
  public static verifyChunkProof(proof: ChunkProof): boolean {
    let currentHash = proof.chunkHash;
    for (const step of proof.proofPath) {
      const concatenated = step.position === "left" ? step.hash + currentHash : currentHash + step.hash;
      currentHash = sha256Hex(concatenated);
    }
    return currentHash.toLowerCase() === proof.root.toLowerCase();
  }

  /**
   * Compromiso de privacidad: C = SHA256(merkleRoot ∥ authorId ∥ salt).
   * El salt se genera con crypto.randomBytes(32) si no se provee.
   */
  public static generateZKCommitment(
    merkleRoot: string,
    authorId: string,
    secretSalt?: string,
  ): { commitment: string; salt: string } {
    const salt = secretSalt || randomBytes(32).toString("hex");
    const commitment = sha256Hex(`${merkleRoot}:${authorId}:${salt}`);
    return { commitment, salt };
  }

  /** Procesa y firma una obra para BookPI (registro sin persistencia aquí). */
  public static processManuscript(payload: BookPiRegistrationPayload): BookPiRegistrationResult {
    if (isSimulatedAlgorithm()) {
      throw new Error(
        "CRITICAL_SECURITY_ERROR: algoritmo de firma simulado no puede registrar obras en producción.",
      );
    }
    const { hashes } = this.chunkBuffer(payload.fileBuffer);
    const { root: merkleRoot } = this.buildMerkleTree(hashes);

    const payloadHash = sha256Hex(`${merkleRoot}:${payload.authorId}:${payload.title}:${payload.category}`);

    const { commitment: zkCommitment } = this.generateZKCommitment(
      merkleRoot,
      payload.authorId,
      payload.secretSalt,
    );

    // Firma REAL sobre el payloadHash con la autoridad configurada (§6.4/§6.5).
    const pqcSignature = signBlockHash(payloadHash);

    return {
      manuscriptId: randomUUID(),
      merkleRoot,
      payloadHash,
      zkCommitment,
      pqcSignature,
      signatureAlgorithm: getSigningAlgorithm(),
      totalChunks: hashes.length,
      chunksHashes: hashes,
    };
  }
}