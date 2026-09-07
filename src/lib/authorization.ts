import { createHash, generateKeyPairSync, sign, verify, KeyObject } from "node:crypto";
import { randomUUID } from "node:crypto";
import { checkPermission, ROLES, type Role } from "./rbac";
import { permissionFor, RESOURCES, ACTIONS, type Resource, type Action } from "./permission-matrix";
import { evaluateAbac, type AttributeContext } from "./abac";

/**
 * C.R.O.W.N. / A.R.G.U.S. - PDP (Policy Decision Point)
 * Versión 3.0 (Isabella-Enhanced Hardened)
 *
 * Implementa firma ECDSA (preparado para ML-DSA-87), hash chaining (SHA3-512),
 * y aislamiento de decisiones para garantizar No Repudio y Auditoría Inmutable.
 */

// ============================================================================
// CONFIGURACIÓN CRIPTOGRÁFICA
// ============================================================================
const HASH_ALGORITHM = "sha3-512";
const SIGNATURE_ALGORITHM = "SHA384"; // Used with ECDSA
const CURVE = "secp384r1"; // High security curve

export interface AuthorizationDecision {
  decision_id: string;
  tenant_id: string;
  subject_id: string;
  action: string;
  resource: string;
  allow: boolean;
  obligations: string[];
  policy_version: string;
  issued_at: string;
  expires_at: string;
  signature: string;
  signature_chain: string;
  previous_decision_hash: string;
}

export interface AuthorizationContext {
  tenant_id: string;
  subject_id: string;
  action: string;
  resource: string;
  /** Rol resuelto de la identidad (requerido para decisión real). */
  role?: string;
  /** Si el request está autenticado (requerido para decisión real). */
  authenticated?: boolean;
  context: {
    ip_address: string;
    user_agent: string;
    timestamp: Date;
    geo_ip?: string;
    device_fingerprint?: string;
    behavior_score?: number;
  };
}

// ============================================================================
// GESTIÓN DE CLAVES (Simulación de HSM)
// ============================================================================
class CryptoManager {
  private privateKey: KeyObject;
  private publicKey: KeyObject;
  private keyId: string;

  // Cadena de custodia global en memoria (en prod esto vive en un Key/Value distribuido seguro)
  private signatureChainState = new Map<string, string>(); // tenant_id -> last_hash

  constructor() {
    // Rotación simulada de clave al iniciar el servicio (Grace period concept)
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: CURVE,
    });
    this.privateKey = privateKey;
    this.publicKey = publicKey;
    this.keyId = `key_${randomUUID().replace(/-/g, "")}`;
    console.info(`[CryptoManager] HSM Initialized. Active Key ID: ${this.keyId} (${CURVE})`);
  }

  public calculateHash(payload: Record<string, unknown>): string {
    const raw = JSON.stringify(payload, Object.keys(payload).sort());
    return createHash(HASH_ALGORITHM).update(raw).digest("hex");
  }

  public signPayload(payload: Record<string, unknown>): string {
    const raw = JSON.stringify(payload, Object.keys(payload).sort());
    const signature = sign(SIGNATURE_ALGORITHM, Buffer.from(raw), this.privateKey);
    return signature.toString("base64url");
  }

  public verifySignature(payload: Record<string, unknown>, signatureB64: string): boolean {
    const raw = JSON.stringify(payload, Object.keys(payload).sort());
    return verify(
      SIGNATURE_ALGORITHM,
      Buffer.from(raw),
      this.publicKey,
      Buffer.from(signatureB64, "base64url"),
    );
  }

  public getAndAdvanceChain(
    tenantId: string,
    newDecisionHash: string,
    newSignature: string,
  ): { previousHash: string; signatureChain: string } {
    const previousHash = this.signatureChainState.get(tenantId) || "genesis_hash_0000000000000000";

    // El signature chain es un hash de (previous_signature_chain + new_signature)
    const previousSigChain =
      this.signatureChainState.get(`sigchain_${tenantId}`) || "genesis_sigchain_00000000";
    const nextSigChain = createHash(HASH_ALGORITHM)
      .update(previousSigChain + newSignature)
      .digest("hex");

    this.signatureChainState.set(tenantId, newDecisionHash);
    this.signatureChainState.set(`sigchain_${tenantId}`, nextSigChain);

    return { previousHash, signatureChain: nextSigChain };
  }
}

const hsm = new CryptoManager();

// ============================================================================
// EVALUADOR PDP (Policy Decision Point)
// ============================================================================

/**
 * Evalúa las políticas de C.R.O.W.N. para una acción dada.
 * Motor real: RBAC (matriz recurso×acción) + ABAC (deny-overrides) +
 * anomalía de comportamiento. Fail-closed en cada etapa: cualquier
 * condición no demostrable niega. Retorna decisión firmada (ECDSA
 * P-384) con hash chaining.
 */
export async function evaluateAuthorization(
  ctx: AuthorizationContext,
): Promise<AuthorizationDecision> {
  const decisionId = `dec_${randomUUID().replace(/-/g, "")}`;
  const now = new Date();

  let allow = false;
  const obligations: string[] = [];
  let denyReason = "deny-by-default";

  // Etapa 0: identidad mínima demostrable.
  if (!ctx.subject_id || !ctx.tenant_id) {
    denyReason = "missing-identity";
  } else if (ctx.context.behavior_score !== undefined && ctx.context.behavior_score > 80) {
    // Etapa 1: anomalía de comportamiento bloquea (fail-closed).
    denyReason = "behavior-anomaly";
  } else if (ctx.role === undefined || !ROLES.includes(ctx.role as Role)) {
    // Etapa 2: rol desconocido o ausente → deny (nunca allow implícito).
    denyReason = "unknown-role";
  } else {
    // Etapa 3: normalizar (recurso, acción) a la matriz canónica.
    // Los skills (`skill:<id>`) y herramientas (`tool:<id>`) requieren tool:execute.
    let resource: Resource | null = null;
    let action: Action | null = null;
    if (ctx.resource.startsWith("skill:") || ctx.resource.startsWith("tool:")) {
      resource = "tool";
      action = "execute";
    } else if (
      (RESOURCES as readonly string[]).includes(ctx.resource) &&
      (ACTIONS as readonly string[]).includes(ctx.action)
    ) {
      resource = ctx.resource as Resource;
      action = ctx.action as Action;
    }
    if (resource === null || action === null) {
      denyReason = "unknown-operation";
    } else {
      const derived = permissionFor(resource, action);
      if (derived.permission === null) {
        denyReason = `forbidden-operation:${derived.reason}`;
      } else {
        // Etapa 4: RBAC real contra el catálogo + herencia.
        const rbac = checkPermission({ role: ctx.role as Role }, derived.permission);
        if (!rbac.allowed) {
          denyReason = `rbac-deny:${rbac.reason}`;
        } else {
          // Etapa 5: ABAC real (deny-overrides) sobre atributos del request.
          const risk =
            ctx.context.behavior_score === undefined
              ? 0.5
              : Math.min(Math.max(ctx.context.behavior_score / 100, 0), 1);
          const attr: AttributeContext = {
            role: ctx.role as Role,
            subjectTenant: ctx.tenant_id,
            resource: ctx.resource,
            action: ctx.action,
            resourceTenant: ctx.tenant_id,
            resourceOwner: "",
            subject: ctx.subject_id,
            risk,
            authenticated: ctx.authenticated ?? false,
            timezone: "UTC",
          };
          const abac = evaluateAbac(attr);
          if (abac.decision === "deny") {
            denyReason = `abac-deny:${abac.policy ?? "unknown"}:${abac.reason}`;
          } else {
            allow = true;
            obligations.push("log_verbose", "pqc_signature_required");
          }
        }
      }
    }
  }

  if (!allow) obligations.push(`deny:${denyReason}`);

  const basePayload = {
    decision_id: decisionId,
    tenant_id: ctx.tenant_id,
    subject_id: ctx.subject_id,
    action: ctx.action,
    resource: ctx.resource,
    allow,
    obligations,
    policy_version: "v4.0.0-real",
    issued_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 5 * 60000).toISOString(), // 5 min TTL
  };

  // 2. Firmar el payload principal
  const signature = hsm.signPayload(basePayload);

  // 3. Hash Chaining & Signature Chain
  const decisionHash = hsm.calculateHash(basePayload);
  const { previousHash, signatureChain } = hsm.getAndAdvanceChain(
    ctx.tenant_id,
    decisionHash,
    signature,
  );

  // 4. Retornar Decisión Inmutable
  const finalDecision: AuthorizationDecision = {
    ...basePayload,
    signature,
    signature_chain: signatureChain,
    previous_decision_hash: previousHash,
  };

  return finalDecision;
}
