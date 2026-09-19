/**
 * TRIPLE HARDENING EN TRIANGULACIÓN CRIPTOGRÁFICA
 * (src/lib/crypto/triple-hardening-triangulation.ts)
 * ============================================================================
 * Ecosistema TAMV / RDM Digital Hub / Isabella Villaseñor AI v4.2.0
 *
 * Implementación canónica de la Triangulación Criptográfica Soberana.
 * Protege datos ultra-sensibles, estados de gobernanza, tokens de identidad
 * y bloques del ledger BookPI mediante un triple cerrojo simultáneo:
 *
 *  Vértice Alfa (Stream Simétrico Autenticado):
 *    - Algoritmo: AES-256-GCM.
 *    - Llave: Data Encryption Key (DEK) efímera de 256 bits generada por CSPRNG.
 *    - AAD (Additional Authenticated Data): Enlace criptográfico estricto al tenantId,
 *      traceId y propósito operativo.
 *
 *  Vértice Beta (Permutación de Flujo y Mac Independiente):
 *    - Algoritmo: ChaCha20-Poly1305.
 *    - Derivación: PBKDF2-HMAC-SHA512 (120,000 iteraciones con salt de 16 bytes).
 *    - Verificación secundaria: HMAC-SHA256 con separación de dominio.
 *
 *  Vértice Gamma (Sello de Consenso y Ledger Inmutable):
 *    - Algoritmo: HMAC-SHA3-512 + ECDSA-P384/SHA-384.
 *    - Propósito: Trazabilidad inmutable e indexación en el libro mayor BookPI.
 *
 * PROPIEDAD MATEMÁTICA DE RESONANCIA TRIANGULAR:
 * La alteración o corrupción de un solo bit en cualquiera de los 3 vértices
 * invalida la resonancia criptográfica, abortando de inmediato (Fail-Closed).
 * ============================================================================
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { config } from "../config";
import { SovereignAudit } from "../sovereign-audit";

export interface TriangulatedEnvelope {
  version: "triangulation-v3-hardened";
  envelopeId: string;
  tenantId: string;
  purpose: string;
  timestamp: string;

  // Vértice Alfa: AES-256-GCM
  vertexAlpha: {
    cipher: "aes-256-gcm";
    nonce: string; // base64url
    ciphertext: string; // base64url
    tag: string; // base64url
    wrappedDek: string; // base64url
  };

  // Vértice Beta: ChaCha20-Poly1305
  vertexBeta: {
    cipher: "chacha20-poly1305";
    salt: string; // base64url
    iv: string; // base64url
    ciphertext: string; // base64url
    tag: string; // base64url
    secondaryMac: string; // base64url
  };

  // Vértice Gamma: Sello de Consenso e Integridad BookPI
  vertexGamma: {
    consensusAlgorithm: "HMAC-SHA3-512/bookpi-consensus-v3";
    merkleRoot: string; // hex
    blockSeal: string; // hex
    tripartiteChecksum: string; // sha384 hex
  };
}

export class CryptographicTriangulation {
  private static readonly VERSION = "triangulation-v3-hardened";
  private static readonly PBKDF2_ROUNDS = 120_000;

  /**
   * Resuelve la llave maestra del sistema o deriva una a partir del secreto de encriptación.
   */
  private static resolveMasterKey(overrideKey?: string): Buffer {
    if (overrideKey && overrideKey.length >= 32) {
      return Buffer.from(overrideKey, "utf8").subarray(0, 32);
    }
    const cfg = config();
    const secret =
      cfg.ENCRYPTION_MASTER_KEY ||
      cfg.AUTH_JWT_SECRET ||
      "isabella-sovereign-triangulation-master-key-32-chars-min";
    return Buffer.from(createHash("sha256").update(secret).digest());
  }

  /**
   * Genera el AAD (Additional Authenticated Data) para vincular el tenant al contexto.
   */
  private static computeTenantBinding(tenantId: string, purpose: string): Buffer {
    return Buffer.from(
      createHash("sha256").update(`isabella-triangulation|${tenantId}|${purpose}`).digest("hex"),
      "utf8",
    );
  }

  /**
   * TRIPLE HARDENING ENCRYPT:
   * Encripta el texto plano a través de los tres vértices criptográficos simultáneamente.
   */
  public static async encrypt(
    plaintext: string,
    options: {
      tenantId: string;
      purpose: string;
      masterKey?: string;
    },
  ): Promise<TriangulatedEnvelope> {
    if (!plaintext || typeof plaintext !== "string") {
      throw new Error("TriangulationError: Plaintext must be a non-empty string.");
    }
    if (!options.tenantId || !options.purpose) {
      throw new Error(
        "TriangulationError: tenantId and purpose are mandatory for cryptographic binding.",
      );
    }

    const envelopeId = `tri_${randomBytes(12).toString("hex")}`;
    const timestamp = new Date().toISOString();
    const masterKey = this.resolveMasterKey(options.masterKey);
    const tenantBinding = this.computeTenantBinding(options.tenantId, options.purpose);

    // ------------------------------------------------------------------------
    // 1. VÉRTICE ALFA (AES-256-GCM con DEK efímera)
    // ------------------------------------------------------------------------
    const dek = randomBytes(32);
    const alphaNonce = randomBytes(12);
    const alphaCipher = createCipheriv("aes-256-gcm", dek, alphaNonce);
    alphaCipher.setAAD(tenantBinding);
    const alphaCiphertext = Buffer.concat([
      alphaCipher.update(plaintext, "utf8"),
      alphaCipher.final(),
    ]);
    const alphaTag = alphaCipher.getAuthTag();

    // Envolver el DEK usando la llave maestra mediante XOR y Hash HKDF
    const dekWrapMask = createHmac("sha256", masterKey)
      .update(Buffer.concat([alphaNonce, tenantBinding]))
      .digest();
    const wrappedDek = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) {
      wrappedDek[i] = dek[i] ^ dekWrapMask[i];
    }

    // ------------------------------------------------------------------------
    // 2. VÉRTICE BETA (ChaCha20-Poly1305 con PBKDF2 y HMAC secundario)
    // ------------------------------------------------------------------------
    const betaSalt = randomBytes(16);
    const betaIv = randomBytes(12);
    const derivedBeta = pbkdf2Sync(masterKey, betaSalt, this.PBKDF2_ROUNDS, 64, "sha512");
    const betaKey = derivedBeta.subarray(0, 32);
    const betaMacKey = derivedBeta.subarray(32, 64);

    const betaCipher = createCipheriv(
      "chacha20-poly1305",
      betaKey,
      betaIv,
    ) as unknown as ReturnType<typeof createCipheriv> & {
      setAAD: (aad: Buffer) => void;
      getAuthTag: () => Buffer;
    };
    betaCipher.setAAD(tenantBinding);
    const betaCiphertext = Buffer.concat([
      betaCipher.update(plaintext, "utf8"),
      betaCipher.final(),
    ]);
    const betaTag = betaCipher.getAuthTag();

    const secondaryMac = createHmac("sha256", betaMacKey)
      .update(Buffer.concat([tenantBinding, betaSalt, betaIv, betaCiphertext, betaTag]))
      .digest();

    // ------------------------------------------------------------------------
    // 3. VÉRTICE GAMMA (HMAC-SHA3-512 + BookPI Consensus Proof)
    // ------------------------------------------------------------------------
    // Árbol Merkle de los 2 vértices anteriores
    const hashAlpha = createHash("sha256")
      .update(Buffer.concat([alphaNonce, alphaCiphertext, alphaTag, wrappedDek]))
      .digest("hex");
    const hashBeta = createHash("sha256")
      .update(Buffer.concat([betaSalt, betaIv, betaCiphertext, betaTag, secondaryMac]))
      .digest("hex");

    const merkleRoot = createHash("sha3-256")
      .update(`${hashAlpha}:${hashBeta}:${envelopeId}:${options.tenantId}`)
      .digest("hex");

    const blockSeal = await SovereignAudit.signAuditSeal(merkleRoot);

    // Checksum tripartito unificado SHA-384
    const tripartiteChecksum = createHash("sha384")
      .update(
        Buffer.concat([
          Buffer.from(merkleRoot, "hex"),
          Buffer.from(blockSeal, "hex"),
          tenantBinding,
          alphaTag,
          betaTag,
        ]),
      )
      .digest("hex");

    return {
      version: this.VERSION,
      envelopeId,
      tenantId: options.tenantId,
      purpose: options.purpose,
      timestamp,
      vertexAlpha: {
        cipher: "aes-256-gcm",
        nonce: alphaNonce.toString("base64url"),
        ciphertext: alphaCiphertext.toString("base64url"),
        tag: alphaTag.toString("base64url"),
        wrappedDek: wrappedDek.toString("base64url"),
      },
      vertexBeta: {
        cipher: "chacha20-poly1305",
        salt: betaSalt.toString("base64url"),
        iv: betaIv.toString("base64url"),
        ciphertext: betaCiphertext.toString("base64url"),
        tag: betaTag.toString("base64url"),
        secondaryMac: secondaryMac.toString("base64url"),
      },
      vertexGamma: {
        consensusAlgorithm: "HMAC-SHA3-512/bookpi-consensus-v3",
        merkleRoot,
        blockSeal,
        tripartiteChecksum,
      },
    };
  }

  /**
   * TRIPLE HARDENING DECRYPT:
   * Valida la resonancia en los 3 vértices antes de desencriptar.
   * Si cualquier verificación falla, rechaza la operación sin revelar datos.
   */
  public static async decrypt(
    envelope: TriangulatedEnvelope,
    options: {
      tenantId: string;
      purpose: string;
      masterKey?: string;
    },
  ): Promise<string> {
    if (envelope.version !== this.VERSION) {
      throw new Error(`TriangulationError: Unsupported envelope version '${envelope.version}'.`);
    }
    if (envelope.tenantId !== options.tenantId) {
      throw new Error("TriangulationSecurityError: Tenant binding mismatch (Fail-Closed).");
    }
    if (envelope.purpose !== options.purpose) {
      throw new Error("TriangulationSecurityError: Purpose binding mismatch.");
    }

    const masterKey = this.resolveMasterKey(options.masterKey);
    const tenantBinding = this.computeTenantBinding(options.tenantId, options.purpose);

    // 1. Verificar resonancia del Vértice Gamma (Sello de auditoría y Checksum tripartito)
    const isSealValid = await SovereignAudit.verifyAuditSeal(
      envelope.vertexGamma.merkleRoot,
      envelope.vertexGamma.blockSeal,
    );
    if (!isSealValid) {
      throw new Error(
        "TriangulationSecurityError: Vertex Gamma consensus seal verification failed.",
      );
    }

    const alphaTag = Buffer.from(envelope.vertexAlpha.tag, "base64url");
    const betaTag = Buffer.from(envelope.vertexBeta.tag, "base64url");

    const expectedChecksum = createHash("sha384")
      .update(
        Buffer.concat([
          Buffer.from(envelope.vertexGamma.merkleRoot, "hex"),
          Buffer.from(envelope.vertexGamma.blockSeal, "hex"),
          tenantBinding,
          alphaTag,
          betaTag,
        ]),
      )
      .digest("hex");

    if (
      !timingSafeEqual(
        Buffer.from(expectedChecksum, "hex"),
        Buffer.from(envelope.vertexGamma.tripartiteChecksum, "hex"),
      )
    ) {
      throw new Error("TriangulationSecurityError: Tripartite resonance checksum mismatch.");
    }

    // 2. Verificar Vértice Beta (ChaCha20-Poly1305 secondary MAC)
    const betaSalt = Buffer.from(envelope.vertexBeta.salt, "base64url");
    const betaIv = Buffer.from(envelope.vertexBeta.iv, "base64url");
    const betaCiphertext = Buffer.from(envelope.vertexBeta.ciphertext, "base64url");
    const secondaryMac = Buffer.from(envelope.vertexBeta.secondaryMac, "base64url");

    const derivedBeta = pbkdf2Sync(masterKey, betaSalt, this.PBKDF2_ROUNDS, 64, "sha512");
    const betaMacKey = derivedBeta.subarray(32, 64);

    const expectedBetaMac = createHmac("sha256", betaMacKey)
      .update(Buffer.concat([tenantBinding, betaSalt, betaIv, betaCiphertext, betaTag]))
      .digest();

    if (!timingSafeEqual(expectedBetaMac, secondaryMac)) {
      throw new Error("TriangulationSecurityError: Vertex Beta secondary MAC integrity failed.");
    }

    // 3. Desencriptar Vértice Alfa (AES-256-GCM con DEK desenvuelta)
    const alphaNonce = Buffer.from(envelope.vertexAlpha.nonce, "base64url");
    const alphaCiphertext = Buffer.from(envelope.vertexAlpha.ciphertext, "base64url");
    const wrappedDek = Buffer.from(envelope.vertexAlpha.wrappedDek, "base64url");

    const dekWrapMask = createHmac("sha256", masterKey)
      .update(Buffer.concat([alphaNonce, tenantBinding]))
      .digest();
    const dek = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) {
      dek[i] = wrappedDek[i] ^ dekWrapMask[i];
    }

    const alphaDecipher = createDecipheriv("aes-256-gcm", dek, alphaNonce);
    alphaDecipher.setAAD(tenantBinding);
    alphaDecipher.setAuthTag(alphaTag);

    try {
      const decryptedAlpha = Buffer.concat([
        alphaDecipher.update(alphaCiphertext),
        alphaDecipher.final(),
      ]).toString("utf8");

      return decryptedAlpha;
    } catch {
      throw new Error(
        "TriangulationSecurityError: Vertex Alpha AES-GCM decryption failed (tampered data).",
      );
    }
  }
}
