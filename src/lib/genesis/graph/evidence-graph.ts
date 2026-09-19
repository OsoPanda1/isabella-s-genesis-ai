import { createHash } from "node:crypto";
import { Claim } from "../schemas/claim.schema";
import { Control } from "../schemas/control.schema";
import { Evidence } from "../schemas/evidence.schema";
import { Finding } from "../schemas/finding.schema";

export type NodeType = "claim" | "control" | "test" | "evidence" | "finding" | "code" | "config";

export interface GraphNode {
  id: string;
  type: NodeType;
  data: Claim | Control | Evidence | Finding | CodeArtifact | Configuration;
  metadata: {
    createdAt: string;
    updatedAt: string;
    version: string;
    owner: string;
    tags: string[];
  };
}

export interface GraphEdge {
  source: string;
  target: string;
  type:
    | "implements"
    | "tests"
    | "evidences"
    | "verifies"
    | "blocks"
    | "relates_to"
    | "depends_on"
    | "conflicts_with";
  metadata: {
    strength: number;
    verified: boolean;
    verifiedAt?: string;
    verifiedBy?: string;
  };
}

export interface CodeArtifact {
  id: string;
  file: string;
  language: string;
  lines: number;
  hash: string;
  functions: string[];
  classes: string[];
  imports: string[];
}

export interface Configuration {
  id: string;
  file: string;
  format: "yaml" | "json" | "toml" | "env";
  keys: string[];
  hash: string;
}

export interface EvidenceGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  indices: {
    byType: Map<NodeType, string[]>;
    byClaim: Map<string, string[]>;
    byControl: Map<string, string[]>;
    byEvidence: Map<string, string[]>;
  };
}

export class EvidenceGraphBuilder {
  private graph: EvidenceGraph = {
    nodes: [],
    edges: [],
    indices: {
      byType: new Map(),
      byClaim: new Map(),
      byControl: new Map(),
      byEvidence: new Map(),
    },
  };

  addClaim(claim: Claim): string {
    const nodeId = `claim:${claim.id}`;
    if (this.findNode(nodeId)) return nodeId;

    const node: GraphNode = {
      id: nodeId,
      type: "claim",
      data: claim,
      metadata: {
        createdAt: claim.createdAt,
        updatedAt: claim.updatedAt,
        version: "1.0",
        owner: claim.owner ?? "unknown",
        tags: claim.tags,
      },
    };
    this.addNode(node);
    this.addToIndex("byClaim", claim.id, nodeId);
    return nodeId;
  }

  addControl(control: Control): string {
    const nodeId = `control:${control.id}`;
    if (this.findNode(nodeId)) return nodeId;

    const node: GraphNode = {
      id: nodeId,
      type: "control",
      data: control,
      metadata: {
        createdAt: control.createdAt,
        updatedAt: control.updatedAt,
        version: "1.0",
        owner: control.owner ?? "unknown",
        tags: control.tags,
      },
    };
    this.addNode(node);
    this.addToIndex("byControl", control.id, nodeId);
    return nodeId;
  }

  addEvidence(evidence: Evidence): string {
    const nodeId = `evidence:${evidence.id}`;
    if (this.findNode(nodeId)) return nodeId;

    const node: GraphNode = {
      id: nodeId,
      type: "evidence",
      data: evidence,
      metadata: {
        createdAt: evidence.metadata.collectedAt,
        updatedAt: evidence.metadata.collectedAt,
        version: "1.0",
        owner: evidence.metadata.collectedBy,
        tags: [evidence.type, evidence.source],
      },
    };
    this.addNode(node);
    this.addToIndex("byEvidence", evidence.id, nodeId);

    if (evidence.claimId) {
      this.addEdge({
        source: nodeId,
        target: `claim:${evidence.claimId}`,
        type: "verifies",
        metadata: {
          strength: 1.0,
          verified: true,
          verifiedAt: evidence.metadata.collectedAt,
          verifiedBy: "evidence-scanner",
        },
      });
    }

    if (evidence.controlId) {
      this.addEdge({
        source: nodeId,
        target: `control:${evidence.controlId}`,
        type: "evidences",
        metadata: {
          strength: 1.0,
          verified: true,
          verifiedAt: evidence.metadata.collectedAt,
          verifiedBy: "evidence-scanner",
        },
      });
    }

    return nodeId;
  }

  addFinding(finding: Finding): string {
    const nodeId = `finding:${finding.id}`;
    if (this.findNode(nodeId)) return nodeId;

    const node: GraphNode = {
      id: nodeId,
      type: "finding",
      data: finding,
      metadata: {
        createdAt: finding.createdAt,
        updatedAt: finding.updatedAt,
        version: "1.0",
        owner: finding.remediation?.owner ?? "unknown",
        tags: [finding.severity, finding.category],
      },
    };
    this.addNode(node);

    if (finding.claimId) {
      this.addEdge({
        source: nodeId,
        target: `claim:${finding.claimId}`,
        type: "blocks",
        metadata: {
          strength: 1.0,
          verified: true,
          verifiedAt: finding.createdAt,
          verifiedBy: "finding-engine",
        },
      });
    }

    return nodeId;
  }

  addCodeArtifact(artifact: CodeArtifact): string {
    const nodeId = `code:${artifact.id}`;
    if (this.findNode(nodeId)) return nodeId;

    const node: GraphNode = {
      id: nodeId,
      type: "code",
      data: artifact,
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: "1.0",
        owner: "scanner",
        tags: [artifact.language, "source"],
      },
    };
    this.addNode(node);
    return nodeId;
  }

  addConfiguration(config: Configuration): string {
    const nodeId = `config:${config.id}`;
    if (this.findNode(nodeId)) return nodeId;

    const node: GraphNode = {
      id: nodeId,
      type: "config",
      data: config,
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: "1.0",
        owner: "scanner",
        tags: [config.format, "configuration"],
      },
    };
    this.addNode(node);
    return nodeId;
  }

  linkCodeToClaim(codeId: string, claimId: string, strength = 0.8): void {
    this.addEdge({
      source: `code:${codeId}`,
      target: `claim:${claimId}`,
      type: "implements",
      metadata: {
        strength,
        verified: true,
        verifiedAt: new Date().toISOString(),
        verifiedBy: "source-scanner",
      },
    });
  }

  linkTestToControl(testId: string, controlId: string, strength = 0.9): void {
    this.addEdge({
      source: `evidence:${testId}`,
      target: `control:${controlId}`,
      type: "tests",
      metadata: {
        strength,
        verified: true,
        verifiedAt: new Date().toISOString(),
        verifiedBy: "test-runner",
      },
    });
  }

  linkConfigToClaim(configId: string, claimId: string, strength = 0.7): void {
    this.addEdge({
      source: `config:${configId}`,
      target: `claim:${claimId}`,
      type: "relates_to",
      metadata: {
        strength,
        verified: true,
        verifiedAt: new Date().toISOString(),
        verifiedBy: "env-scanner",
      },
    });
  }

  private addNode(node: GraphNode): void {
    this.graph.nodes.push(node);
    const typeNodes = this.graph.indices.byType.get(node.type) ?? [];
    typeNodes.push(node.id);
    this.graph.indices.byType.set(node.type, typeNodes);
  }

  private addEdge(edge: GraphEdge): void {
    this.graph.edges.push(edge);
  }

  private findNode(id: string): GraphNode | undefined {
    return this.graph.nodes.find((n) => n.id === id);
  }

  private addToIndex(indexName: keyof EvidenceGraph["indices"], key: string, nodeId: string): void {
    const index = this.graph.indices[indexName] as unknown as Map<string, string[]>;
    const existing = index.get(key) ?? [];
    existing.push(nodeId);
    index.set(key, existing);
  }

  build(): EvidenceGraph {
    return this.graph;
  }

  computeHashes(): { nodesHash: string; edgesHash: string; graphHash: string } {
    const nodesContent = this.graph.nodes
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((n) => ({ id: n.id, type: n.type, dataHash: this.hashData(n.data) }))
      .reduce((acc, n) => acc + n.id + n.type + n.dataHash, "");

    const edgesContent = this.graph.edges
      .sort((a, b) => a.source.localeCompare(b.source))
      .map((e) => e.source + e.target + e.type)
      .join("");

    const nodesHash = createHash("sha3-512").update(nodesContent).digest("hex");
    const edgesHash = createHash("sha3-512").update(edgesContent).digest("hex");
    const graphHash = createHash("sha3-512")
      .update(nodesHash + edgesHash)
      .digest("hex");

    return { nodesHash, edgesHash, graphHash };
  }

  private hashData(data: unknown): string {
    return createHash("sha3-512").update(JSON.stringify(data)).digest("hex").slice(0, 32);
  }
}

export interface GraphAnalysisResult {
  orphanClaims: Array<{
    claimId: string;
    expectedEvidenceCount: number;
    actualEvidenceCount: number;
    missingEvidenceTypes: string[];
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
  }>;
  orphanEvidence: Array<{
    evidenceId: string;
    type: string;
    possibleClaims: string[];
    severity: "MEDIUM" | "LOW";
  }>;
  contradictions: Array<{
    nodeA: string;
    nodeB: string;
    contradictionType:
      "claim_vs_code" | "docs_vs_implementation" | "test_vs_behavior" | "evidence_vs_claim";
    description: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
  }>;
  coverageAnalysis: {
    claimsWithEvidence: number;
    claimsWithoutEvidence: number;
    coveragePercentage: number;
    byCategory: Record<string, { total: number; covered: number; percentage: number }>;
  };
  confidenceAnalysis: Array<{
    claimId: string;
    confidenceScore: number;
    factors: {
      evidenceQuality: number;
      evidenceQuantity: number;
      evidenceRecency: number;
      evidenceIndependence: number;
      testCoverage: number;
      codeQuality: number;
    };
    calculation: string;
  }>;
  cycles: Array<{
    nodes: string[];
    type: "dependency_cycle" | "verification_cycle";
    severity: "HIGH" | "MEDIUM";
    resolution: string;
  }>;
  criticalPath: Array<{
    claimId: string;
    path: string[];
    totalConfidence: number;
    weakestLink: { nodeId: string; confidence: number; improvement: string };
  }>;
}

export class EvidenceGraphAnalyzer {
  private graph: EvidenceGraph;

  constructor(graph: EvidenceGraph) {
    this.graph = graph;
  }

  analyze(): GraphAnalysisResult {
    return {
      orphanClaims: this.findOrphanClaims(),
      orphanEvidence: this.findOrphanEvidence(),
      contradictions: this.findContradictions(),
      coverageAnalysis: this.analyzeCoverage(),
      confidenceAnalysis: this.analyzeConfidence(),
      cycles: this.findCycles(),
      criticalPath: this.findCriticalPaths(),
    };
  }

  private findOrphanClaims(): GraphAnalysisResult["orphanClaims"] {
    const claims = this.graph.nodes.filter((n) => n.type === "claim");
    const result: GraphAnalysisResult["orphanClaims"] = [];

    for (const claimNode of claims) {
      const claim = claimNode.data as Claim;
      const evidenceEdges = this.graph.edges.filter(
        (e) => e.target === claimNode.id && e.type === "verifies",
      );
      const evidenceNodes = evidenceEdges
        .map((e) => this.graph.nodes.find((n) => n.id === e.source))
        .filter(Boolean) as GraphNode[];

      const evidenceTypes = new Set(evidenceNodes.map((n) => (n.data as Evidence).type));
      const missingTypes = claim.evidenceRequired.filter((t) => !evidenceTypes.has(t));

      if (evidenceNodes.length === 0 || missingTypes.length > 0) {
        result.push({
          claimId: claim.id,
          expectedEvidenceCount: claim.evidenceRequired.length,
          actualEvidenceCount: evidenceNodes.length,
          missingEvidenceTypes: missingTypes,
          severity:
            missingTypes.length === claim.evidenceRequired.length
              ? "CRITICAL"
              : missingTypes.length > claim.evidenceRequired.length / 2
                ? "HIGH"
                : "MEDIUM",
        });
      }
    }

    return result;
  }

  private findOrphanEvidence(): GraphAnalysisResult["orphanEvidence"] {
    const evidenceNodes = this.graph.nodes.filter((n) => n.type === "evidence");
    const result: GraphAnalysisResult["orphanEvidence"] = [];

    for (const evNode of evidenceNodes) {
      const evidence = evNode.data as Evidence;
      const claimEdges = this.graph.edges.filter(
        (e) => e.source === evNode.id && e.type === "verifies",
      );

      if (claimEdges.length === 0) {
        const possibleClaims = this.graph.nodes
          .filter((n) => n.type === "claim")
          .map((n) => (n.data as Claim).id);

        result.push({
          evidenceId: evidence.id,
          type: evidence.type,
          possibleClaims,
          severity: "LOW",
        });
      }
    }

    return result;
  }

  private findContradictions(): GraphAnalysisResult["contradictions"] {
    const result: GraphAnalysisResult["contradictions"] = [];

    const claims = this.graph.nodes.filter((n) => n.type === "claim");
    const findingNodes = this.graph.nodes.filter((n) => n.type === "finding");

    for (const claimNode of claims) {
      const claim = claimNode.data as Claim;
      const codeEdges = this.graph.edges.filter(
        (e) => e.target === claimNode.id && e.type === "implements",
      );

      if (
        codeEdges.length === 0 &&
        claim.requiredStatus !== "PLANNED" &&
        claim.requiredStatus !== "DESIGNED"
      ) {
        result.push({
          nodeA: claimNode.id,
          nodeB: "none",
          contradictionType: "claim_vs_code",
          description: `Claim ${claim.id} (${claim.title}) requires implementation but no code implements it`,
          severity: "HIGH",
        });
      }
    }

    for (const findingNode of findingNodes) {
      const finding = findingNode.data as Finding;
      if (finding.claimId) {
        result.push({
          nodeA: findingNode.id,
          nodeB: `claim:${finding.claimId}`,
          contradictionType: "evidence_vs_claim",
          description: `Finding ${finding.id} blocks claim ${finding.claimId}: ${finding.title}`,
          severity: finding.severity === "CRITICAL" ? "CRITICAL" : "HIGH",
        });
      }
    }

    return result;
  }

  private analyzeCoverage(): GraphAnalysisResult["coverageAnalysis"] {
    const claims = this.graph.nodes.filter((n) => n.type === "claim");
    let claimsWithEvidence = 0;
    const byCategory: GraphAnalysisResult["coverageAnalysis"]["byCategory"] = {};

    for (const claimNode of claims) {
      const claim = claimNode.data as Claim;
      const evidenceEdges = this.graph.edges.filter(
        (e) => e.target === claimNode.id && e.type === "verifies",
      );

      if (!byCategory[claim.category]) {
        byCategory[claim.category] = { total: 0, covered: 0, percentage: 0 };
      }
      byCategory[claim.category].total++;

      if (evidenceEdges.length > 0) {
        claimsWithEvidence++;
        byCategory[claim.category].covered++;
      }
    }

    for (const cat of Object.values(byCategory)) {
      cat.percentage = cat.total > 0 ? Math.round((cat.covered / cat.total) * 100) : 0;
    }

    return {
      claimsWithEvidence,
      claimsWithoutEvidence: claims.length - claimsWithEvidence,
      coveragePercentage:
        claims.length > 0 ? Math.round((claimsWithEvidence / claims.length) * 100) : 0,
      byCategory,
    };
  }

  private analyzeConfidence(): GraphAnalysisResult["confidenceAnalysis"] {
    const claims = this.graph.nodes.filter((n) => n.type === "claim");
    const result: GraphAnalysisResult["confidenceAnalysis"] = [];

    for (const claimNode of claims) {
      const claim = claimNode.data as Claim;
      const evidenceEdges = this.graph.edges.filter(
        (e) => e.target === claimNode.id && e.type === "verifies",
      );
      const evidenceNodes = evidenceEdges
        .map((e) => this.graph.nodes.find((n) => n.id === e.source))
        .filter(Boolean) as GraphNode[];

      const evidenceCount = evidenceNodes.length;
      const requiredCount = claim.evidenceRequired.length;

      const evidenceQuality =
        evidenceNodes.length > 0
          ? evidenceNodes.reduce((sum, n) => {
              const ev = n.data as Evidence;
              let quality = 0;
              if (ev.metadata.independentlyVerifiable) quality += 0.25;
              if (ev.metadata.reproducible) quality += 0.25;
              if (ev.metadata.tamperEvident) quality += 0.25;
              if (ev.metadata.cryptographicallySigned) quality += 0.25;
              return sum + quality;
            }, 0) / evidenceNodes.length
          : 0;

      const evidenceQuantity = Math.min(evidenceCount / Math.max(requiredCount, 1), 1);
      const evidenceRecency =
        evidenceNodes.length > 0
          ? Math.max(
              0,
              1 -
                (Date.now() - new Date(evidenceNodes[0].metadata.createdAt).getTime()) /
                  (90 * 24 * 60 * 60 * 1000),
            )
          : 0;
      const evidenceIndependence =
        evidenceNodes.length > 0
          ? evidenceNodes.filter((n) => (n.data as Evidence).source === "external").length /
            evidenceNodes.length
          : 0;

      const testEdges = this.graph.edges.filter(
        (e) => e.target === claimNode.id && e.type === "tests",
      );
      const testCoverage = testEdges.length > 0 ? Math.min(testEdges.length / 4, 1) : 0;

      const codeEdges = this.graph.edges.filter(
        (e) => e.target === claimNode.id && e.type === "implements",
      );
      const codeNodes = codeEdges
        .map((e) => this.graph.nodes.find((n) => n.id === e.source))
        .filter(Boolean);
      const codeQuality = codeNodes.length > 0 ? 0.8 : 0;

      const confidenceScore =
        evidenceQuality * 0.3 +
        evidenceQuantity * 0.2 +
        evidenceRecency * 0.15 +
        evidenceIndependence * 0.15 +
        testCoverage * 0.1 +
        codeQuality * 0.1;

      result.push({
        claimId: claim.id,
        confidenceScore: Math.round(confidenceScore * 100) / 100,
        factors: {
          evidenceQuality: Math.round(evidenceQuality * 100) / 100,
          evidenceQuantity: Math.round(evidenceQuantity * 100) / 100,
          evidenceRecency: Math.round(evidenceRecency * 100) / 100,
          evidenceIndependence: Math.round(evidenceIndependence * 100) / 100,
          testCoverage: Math.round(testCoverage * 100) / 100,
          codeQuality: Math.round(codeQuality * 100) / 100,
        },
        calculation:
          "weighted_sum(evidenceQuality*0.3 + evidenceQuantity*0.2 + evidenceRecency*0.15 + evidenceIndependence*0.15 + testCoverage*0.1 + codeQuality*0.1)",
      });
    }

    return result;
  }

  private findCycles(): GraphAnalysisResult["cycles"] {
    const result: GraphAnalysisResult["cycles"] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recStack.add(nodeId);
      path.push(nodeId);

      const edges = this.graph.edges.filter((e) => e.source === nodeId);
      for (const edge of edges) {
        if (!visited.has(edge.target)) {
          if (dfs(edge.target)) return true;
        } else if (recStack.has(edge.target)) {
          const cycleStart = path.indexOf(edge.target);
          const cycle = path.slice(cycleStart);
          result.push({
            nodes: [...cycle, edge.target],
            type: edge.type === "depends_on" ? "dependency_cycle" : "verification_cycle",
            severity: "HIGH",
            resolution: "Break cycle by removing or redirecting dependency",
          });
          return true;
        }
      }

      recStack.delete(nodeId);
      path.pop();
      return false;
    };

    for (const node of this.graph.nodes) {
      if (!visited.has(node.id)) {
        dfs(node.id);
      }
    }

    return result;
  }

  private findCriticalPaths(): GraphAnalysisResult["criticalPath"] {
    const claims = this.graph.nodes.filter((n) => n.type === "claim");
    const result: GraphAnalysisResult["criticalPath"] = [];

    for (const claimNode of claims) {
      const claim = claimNode.data as Claim;
      const path: string[] = [claimNode.id];
      let current = claimNode.id;
      let totalConfidence = 1.0;
      let weakestLink = { nodeId: "", confidence: 1.0, improvement: "" };

      while (true) {
        const outgoingEdges = this.graph.edges.filter((e) => e.source === current);
        if (outgoingEdges.length === 0) break;

        const strongestEdge = outgoingEdges.reduce((max, e) =>
          e.metadata.strength > max.metadata.strength ? e : max,
        );

        if (strongestEdge.metadata.strength < 0.5) break;

        path.push(strongestEdge.target);
        totalConfidence *= strongestEdge.metadata.strength;

        if (strongestEdge.metadata.strength < weakestLink.confidence) {
          weakestLink = {
            nodeId: strongestEdge.target,
            confidence: strongestEdge.metadata.strength,
            improvement: `Strengthen ${strongestEdge.type} relationship`,
          };
        }

        current = strongestEdge.target;
        if (path.includes(current)) break;
      }

      result.push({
        claimId: claim.id,
        path,
        totalConfidence: Math.round(totalConfidence * 100) / 100,
        weakestLink,
      });
    }

    return result;
  }
}

export function createEvidenceGraphBuilder(): EvidenceGraphBuilder {
  return new EvidenceGraphBuilder();
}

export function createEvidenceGraphAnalyzer(graph: EvidenceGraph): EvidenceGraphAnalyzer {
  return new EvidenceGraphAnalyzer(graph);
}
