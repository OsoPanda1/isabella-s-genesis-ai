export interface EthicalKnowledgeSnippet {
  id: string;
  content: string;
  entropyLevel: number;
  timestamp: number;
  integrityHash: string;
}

export interface GovernanceGuideline {
  id: string;
  snippetIds: string[];
  premise: string;
  resolution: string;
  timestamp: number;
  hash: string;
}

export interface TransparencyMarker {
  id: string;
  targetId: string;
  auditScore: number;
  flags: string[];
  timestamp: number;
}

// Export utilities and services
export * from "./EthicalRegistry";
export * from "./EthicalValidator";
