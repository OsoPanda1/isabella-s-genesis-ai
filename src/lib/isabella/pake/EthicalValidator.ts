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

export class EthicalValidator {
  /**
   * Internal audit function to verify that any knowledge snippet conforms
   * to the project's ethics, transparency, and governance requirements
   * before being accepted into the registry.
   */
  public static auditContent(content: string): { valid: boolean; score: number; flags: string[]; hash: string } {
    const flags: string[] = [];
    let score = 1.0;
    const lowerContent = content.toLowerCase();

    // 1. Transparency Check (Penalize opacity)
    if (lowerContent.includes("ocultar") || lowerContent.includes("secreto") || lowerContent.includes("engaño")) {
      flags.push("Opacidad Detectada");
      score -= 0.4;
    }

    // 2. Ethics & Governance Check (Penalize bias and exclusion)
    if (lowerContent.includes("sesgo") || lowerContent.includes("discriminación") || lowerContent.includes("excluir")) {
      flags.push("Riesgo de Exclusión/Sesgo");
      score -= 0.5;
    }

    // 3. Positive Alignment Check (Reward explicit ethical grounding)
    if (!lowerContent.includes("ética") && 
        !lowerContent.includes("transparencia") && 
        !lowerContent.includes("bienestar") && 
        !lowerContent.includes("gobernanza")) {
      flags.push("Falta Anclaje Ético Explícito");
      score -= 0.1;
    }

    // Threshold for passing the chaotic integrity test
    const valid = score >= 0.6;
    
    // Generate immutable hash for the snippet
    const hash = generateHash(content);

    return { 
      valid, 
      score: Math.max(0, score), 
      flags, 
      hash 
    };
  }
}
