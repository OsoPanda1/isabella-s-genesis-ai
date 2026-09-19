export const AI_GOVERNANCE_PROFILE = {
  schema: "isabella.ai.governance.v1",
  system: {
    name: "Isabella AI Genesis",
    version: "4.3.3",
    providerType: "federated-governed-ai-assistant",
    interactionDisclosure: "AI system; human review is required for consequential decisions.",
  },
  governance: {
    humanOversight: true,
    autonomousHighImpactDecisionMaking: false,
    consequentialDecisionAuthority: "human",
    escalation: "deny-or-escalate when policy, safety, authorization, or confidence gates fail",
    shutdownCapability: true,
    auditability: true,
  },
  safety: {
    policyGate: "CROWN",
    adversarialGate: "AEGIS",
    rateLimiting: true,
    authenticatedProductionAccess: true,
    productionGuestChat: false,
    syntheticProductionTelemetryForbidden: true,
    failClosedOnCriticalConfiguration: true,
  },
  traceability: {
    requestCorrelation: true,
    auditTrail: true,
    modelProviderDisclosure: "runtime-dependent; never inferred from client claims",
    generatedContentIdentification: true,
  },
  evaluation: {
    continuousRiskManagement: true,
    preDeploymentTesting: true,
    runtimeMonitoring: true,
    independentReviewSupported: true,
    uncertaintyReporting:
      "required where applicable; deterministic governance signals are not presented as probability",
  },
  privacy: {
    dataMinimization: true,
    sensitiveDataExcludedFromPublicProfile: true,
    credentialsExcludedFromAuditOutput: true,
  },
  standardsAlignment: [
    "EU AI Act transparency and human-oversight principles",
    "NIST AI RMF Govern-Map-Measure-Manage",
    "ISO/IEC 42001 AI management-system principles",
    "OWASP Top 10 for LLM Applications 2025",
    "OWASP Top 10 Web Application Security Risks 2025",
  ],
  legalNotice:
    "This profile documents engineering controls and intended alignment. It is not a legal certification or conformity assessment.",
} as const;

export type AIGovernanceProfile = typeof AI_GOVERNANCE_PROFILE;

export function getAIGovernanceProfile(): AIGovernanceProfile {
  return AI_GOVERNANCE_PROFILE;
}
