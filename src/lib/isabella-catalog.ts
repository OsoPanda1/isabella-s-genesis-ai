/**
 * CATÁLOGO CANÓNICO DE MÓDULOS Y CORES DE ISABELLA
 * ------------------------------------------------
 * Datos puros, sin dependencias de servidor: este archivo puede cargarse
 * tanto en el navegador (paneles de observabilidad) como en el runtime
 * soberano. Cualquier lógica con secretos vive fuera de aquí.
 */

export type IsabellaModuleId =
  | "CROWN_GATEWAY"
  | "ISA_CORE"
  | "SOPHIA_ENGINE"
  | "ORION_ENGINE"
  | "ARGUS_SENTINEL"
  | "LATAM_AEGIS"
  | "SOVEREIGN_DB"
  | "MEM_ENGINE"
  | "QUANTUM_PLATFORM"
  | "MONETIZATION"
  | "OIDC_AUTH"
  | "VOICE_SYNTH";

export type IsabellaCoreId =
  | "CROWN_ROUTER"
  | "CROWN_CONSTITUTION"
  | "ISA_PRESENCE"
  | "ISA_EMPATHY"
  | "SOPHIA_LOGIC"
  | "SOPHIA_GROUNDING"
  | "ORION_SANDBOX"
  | "ORION_BRIDGE"
  | "ARGUS_RISK"
  | "ARGUS_VETO"
  | "AEGIS_FIREWALL"
  | "AEGIS_PYTHON_CORE"
  | "SOVEREIGN_LEDGER"
  | "SOVEREIGN_KV"
  | "MEM_PENTACAPA"
  | "MEM_TTL"
  | "QUP_TORIC"
  | "QUP_TENSOR"
  | "MONETIZATION_LEDGER"
  | "MONETIZATION_WITHDRAWAL"
  | "OIDC_HANDSHAKE"
  | "OIDC_JWT_VERIFY"
  | "VOICE_PROSODY"
  | "VOICE_TTS";

export interface SystemModuleMetadata {
  id: IsabellaModuleId;
  name: string;
  description: string;
  cores: readonly IsabellaCoreId[];
}

export const ISABELLA_MODULE_CATALOG: Record<IsabellaModuleId, SystemModuleMetadata> = {
  CROWN_GATEWAY: {
    id: "CROWN_GATEWAY",
    name: "CROWN Orchestrator & Gateway",
    description: "Constitutional runtime for orchestrating dialog and intent verification.",
    cores: ["CROWN_ROUTER", "CROWN_CONSTITUTION"],
  },
  ISA_CORE: {
    id: "ISA_CORE",
    name: "ISA Tone & Presence Module",
    description: "Modulates expressive presence, tone alignment, and conversational empathy.",
    cores: ["ISA_PRESENCE", "ISA_EMPATHY"],
  },
  SOPHIA_ENGINE: {
    id: "SOPHIA_ENGINE",
    name: "SOPHIA Epistemology & Logic Engine",
    description: "Validates facts, grounding, sources, and logical consistency checks.",
    cores: ["SOPHIA_LOGIC", "SOPHIA_GROUNDING"],
  },
  ORION_ENGINE: {
    id: "ORION_ENGINE",
    name: "ORION Sandboxed Execution Module",
    description: "Executes sandbox operations, cli tools, and external services safely.",
    cores: ["ORION_SANDBOX", "ORION_BRIDGE"],
  },
  ARGUS_SENTINEL: {
    id: "ARGUS_SENTINEL",
    name: "ARGUS Defense & Policy Sentinel",
    description: "Applies risk models and manages Human-In-The-Loop (HITL) escalations.",
    cores: ["ARGUS_RISK", "ARGUS_VETO"],
  },
  LATAM_AEGIS: {
    id: "LATAM_AEGIS",
    name: "LATAM Aegis-X Firewall Module",
    description: "Performs deep internal request inspection and anomaly modeling.",
    cores: ["AEGIS_FIREWALL", "AEGIS_PYTHON_CORE"],
  },
  SOVEREIGN_DB: {
    id: "SOVEREIGN_DB",
    name: "Sovereign Database & BookPI Ledger",
    description: "Manages state persistence, encrypted KV, and the cryptographic ledger.",
    cores: ["SOVEREIGN_LEDGER", "SOVEREIGN_KV"],
  },
  MEM_ENGINE: {
    id: "MEM_ENGINE",
    name: "Segmented Cognitive Memory Manager",
    description: "Controls the five segregated context scopes with distinct expiration TTLs.",
    cores: ["MEM_PENTACAPA", "MEM_TTL"],
  },
  QUANTUM_PLATFORM: {
    id: "QUANTUM_PLATFORM",
    name: "Quantum Utility Platform (QUP)",
    description: "Simulates and mitigates quantum errors for advanced optimization runtimes.",
    cores: ["QUP_TORIC", "QUP_TENSOR"],
  },
  MONETIZATION: {
    id: "MONETIZATION",
    name: "Monetization & Licensing Engine",
    description: "Governs revenue split contability (85/15) and authenticated withdrawals.",
    cores: ["MONETIZATION_LEDGER", "MONETIZATION_WITHDRAWAL"],
  },
  OIDC_AUTH: {
    id: "OIDC_AUTH",
    name: "OIDC Cryptographic Auth Module",
    description: "Verifies OIDC signatures, issues tokens, and enforces RBAC scopes.",
    cores: ["OIDC_HANDSHAKE", "OIDC_JWT_VERIFY"],
  },
  VOICE_SYNTH: {
    id: "VOICE_SYNTH",
    name: "Expressive Voice Synthesis Interface",
    description: "Synthesizes real-time text-to-speech with prosody controls.",
    cores: ["VOICE_PROSODY", "VOICE_TTS"],
  },
};
