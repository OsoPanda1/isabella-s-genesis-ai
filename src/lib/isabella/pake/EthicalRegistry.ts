import { EthicalKnowledgeSnippet, GovernanceGuideline, TransparencyMarker } from './index';

// Simple browser-safe hash for the chaotic engine simulation
function generateHash(str: string): string {
  let hash = 0;
  for (let i = 0, len = str.length; i < len; i++) {
      const chr = str.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0; 
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export class EthicalRegistry {
  private snippets: Map<string, EthicalKnowledgeSnippet> = new Map();
  private guidelines: Map<string, GovernanceGuideline> = new Map();
  private markers: Map<string, TransparencyMarker> = new Map();

  /**
   * Stores an ethical knowledge snippet after it passes validation.
   */
  public storeSnippet(content: string, integrityHash: string, entropyLevel: number = 1.0): EthicalKnowledgeSnippet {
    const id = crypto.randomUUID();
    const snippet: EthicalKnowledgeSnippet = {
      id, 
      content, 
      entropyLevel, 
      timestamp: Date.now(), 
      integrityHash
    };
    this.snippets.set(id, snippet);
    return snippet;
  }

  public getSnippets(): EthicalKnowledgeSnippet[] {
    return Array.from(this.snippets.values());
  }

  /**
   * Indexes a newly resolved governance guideline immutably.
   */
  public indexGuideline(premise: string, resolution: string, snippetIds: string[]): GovernanceGuideline {
    const id = crypto.randomUUID();
    const payload = `${premise}:${resolution}:${snippetIds.sort().join(',')}`;
    const hash = generateHash(payload);
    
    const guideline: GovernanceGuideline = {
      id, 
      premise, 
      resolution, 
      snippetIds, 
      hash, 
      timestamp: Date.now()
    };
    this.guidelines.set(id, guideline);
    return guideline;
  }

  public getGuidelines(): GovernanceGuideline[] {
    return Array.from(this.guidelines.values());
  }

  /**
   * Adds a transparency marker to any snippet or guideline for audit trails.
   */
  public addTransparencyMarker(targetId: string, auditScore: number, flags: string[]): TransparencyMarker {
    const id = crypto.randomUUID();
    const marker: TransparencyMarker = { 
      id, 
      targetId, 
      auditScore, 
      flags, 
      timestamp: Date.now() 
    };
    this.markers.set(id, marker);
    return marker;
  }

  /**
   * Calculates the overall health and structure of the chaotic learning environment.
   */
  public getSystemHealth() {
    const totalSnippets = this.snippets.size;
    const anchoredSnippets = new Set(Array.from(this.guidelines.values()).flatMap(g => g.snippetIds)).size;
    
    const density = totalSnippets > 0 ? (anchoredSnippets / totalSnippets) * 100 : 0;
    
    const avgAuditScore = this.markers.size > 0 
      ? Array.from(this.markers.values()).reduce((acc, m) => acc + m.auditScore, 0) / this.markers.size 
      : 1;

    return {
      totalSnippets,
      anchoredSnippets,
      guidelinesCount: this.guidelines.size,
      knowledgeDensity: density, // Percentage
      alignmentCheckScore: avgAuditScore * 100, // Percentage
      activeFlags: Array.from(this.markers.values()).flatMap(m => m.flags).length,
      healthStatus: avgAuditScore > 0.8 ? "Optimal" : avgAuditScore > 0.5 ? "Warning" : "Critical"
    };
  }
}

// Global registry instance for the application's runtime
export const globalEthicalRegistry = new EthicalRegistry();
