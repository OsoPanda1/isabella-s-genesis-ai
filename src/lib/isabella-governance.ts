import { runIsabellaSkill } from "./skills/run-skill";
import { SovereignAudit } from "./sovereign-audit";

export interface GovernanceValidationRequest {
  jobId: string;
  userId: string;
  tenantId: string;
  role: string;
  authenticated: boolean;
  datasetName: string;
  backend: string;
  territory: string;
  fidelityTarget: number;
}

export interface AtlasData {
  impactLevel?: string;
  approved?: boolean;
  data?: {
    territorialImpact?: number;
    interpretation?: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  };
}

export interface ThemisData {
  expedienteId?: string;
  data?: { auditability?: "SUFFICIENT" | "PARTIAL" | "INSUFFICIENT" };
  summary?: string;
}

export interface VigiaData {
  lockStatus?: string;
  data?: { allowed?: boolean };
}

export interface GovernanceAuditTrail {
  atlasDecision: AtlasData | null;
  anubisHash: string;
  themisExpediente: ThemisData | null;
  vigiaLock: VigiaData | null;
}

export interface GovernanceValidationResult {
  approved: boolean;
  rejectionReason?: string;
  auditTrail: GovernanceAuditTrail;
  merkleRoot: string;
  auditSeal: string;
}

/**
 * Isabella Governance Module (QUP v3.0 Sovereign Edition)
 * Centralizes ATLAS, ANUBIS, THEMIS, and VIGIA logic.
 */
export class IsabellaGovernance {
  /**
   * Validates a Quantum Job against sovereign and territorial constraints.
   */
  public static async validateQuantumJob(
    req: GovernanceValidationRequest,
  ): Promise<GovernanceValidationResult> {
    try {
      // 1. ATLAS: Territorial & Scenario Impact
      const atlasRes = await runIsabellaSkill(
        "ATLAS",
        {
          scenario: `Evaluación de impacto de corrida cuántica '${req.datasetName}' en Nodo de Cómputo Territorial '${req.territory}'.`,
          variables: [
            { name: "backend", value: req.backend },
            { name: "fidelity", value: req.fidelityTarget },
          ],
        },
        {
          actorId: req.userId,
          tenantId: req.tenantId,
          role: req.role,
          authenticated: req.authenticated,
          federation: "TAMV",
          requestId: req.jobId,
          locale: "es",
          intent: "QUANTUM_GOVERNANCE_CHECK",
        },
      );
      const atlasData = atlasRes.data as unknown as AtlasData;

      if (atlasData?.impactLevel === "CRITICAL" && !atlasData?.approved) {
        throw new Error("ATLAS rejected the scenario due to critical territorial impact.");
      }

      // 2. VIGIA: Ethical Multi-Lock Verification
      const vigiaRes = await runIsabellaSkill(
        "VIGIA",
        {
          text: `quantum:execute:${req.backend} risk:HIGH user:${req.userId} territory:${req.territory}`,
        },
        {
          actorId: req.userId,
          tenantId: req.tenantId,
          role: req.role,
          authenticated: req.authenticated,
          federation: "TAMV",
          requestId: req.jobId,
          locale: "es",
          intent: "QUANTUM_GOVERNANCE_CHECK",
        },
      );
      const vigiaData = vigiaRes.data as unknown as VigiaData;

      if (vigiaData?.lockStatus === "LOCKED") {
        throw new Error("VIGIA Ethical Multi-Lock prevented execution.");
      }

      // 3. ANUBIS: Integrity and Merkle Tree Generation
      // In a real scenario, we'd hash the actual dataset and job parameters
      const leaf1 = SovereignAudit.hashData(`jobId:${req.jobId}`);
      const leaf2 = SovereignAudit.hashData(`backend:${req.backend}`);
      const leaf3 = SovereignAudit.hashData(`dataset:${req.datasetName}`);
      const leaf4 = SovereignAudit.hashData(`territory:${req.territory}`);

      const merkleTree = SovereignAudit.buildMerkleTree([leaf1, leaf2, leaf3, leaf4]);

      const anubisRes = await runIsabellaSkill(
        "ANUBIS",
        {
          artifactId: `qup_job_merkle_${merkleTree.root.slice(0, 12)}`,
          content: JSON.stringify({
            tree: merkleTree,
            fidelity: req.fidelityTarget,
          }),
        },
        {
          actorId: req.userId,
          tenantId: req.tenantId,
          role: req.role,
          authenticated: req.authenticated,
          federation: "TAMV",
          requestId: req.jobId,
          locale: "es",
          intent: "QUANTUM_GOVERNANCE_CHECK",
        },
      );
      const anubisData = anubisRes.data as unknown as { integrityHash?: string };

      // 4. THEMIS: Legal Explanable Expediente
      const themisRes = await runIsabellaSkill(
        "THEMIS",
        {
          decisionId: `dec_qup_${req.jobId.slice(0, 8)}`,
          decision: `Aprobación de ejecución cuántica QUP v3.0 en ${req.territory} con backend ${req.backend}`,
          context: `Usuario ${req.userId} solicitó ejecución. ATLAS y VIGIA aprobaron. Merkle Root: ${merkleTree.root}`,
        },
        {
          actorId: req.userId,
          tenantId: req.tenantId,
          role: req.role,
          authenticated: req.authenticated,
          federation: "TAMV",
          requestId: req.jobId,
          locale: "es",
          intent: "QUANTUM_GOVERNANCE_CHECK",
        },
      );
      const themisData = themisRes.data as unknown as ThemisData;

      // 5. Sello de auditoría soberana (HMAC-SHA3-512 verificable).
      const payloadToSign = JSON.stringify({
        jobId: req.jobId,
        merkleRoot: merkleTree.root,
        themisId: themisData?.expedienteId || "unknown",
      });
      const payloadHash = SovereignAudit.hashData(payloadToSign);
      const signature = await SovereignAudit.signAuditSeal(payloadHash);

      return {
        approved: true,
        auditTrail: {
          atlasDecision: atlasData,
          anubisHash: anubisData?.integrityHash || merkleTree.root,
          themisExpediente: themisData,
          vigiaLock: vigiaData,
        },
        merkleRoot: merkleTree.root,
        auditSeal: signature,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown governance failure";
      return {
        approved: false,
        rejectionReason: message,
        auditTrail: {
          atlasDecision: null,
          anubisHash: "",
          themisExpediente: null,
          vigiaLock: null,
        },
        merkleRoot: "",
        auditSeal: "",
      };
    }
  }
}
