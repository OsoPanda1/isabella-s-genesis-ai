import { createHash } from "node:crypto";

export type AiLicense = "MIT" | "Apache-2.0" | "BSD-3-Clause" | "CC-BY-4.0" | "ODbL-1.0";
export type AiTrust = "verified" | "review" | "revoked";

export interface AiVaultEntry {
  id: string;
  version: string;
  provider: string;
  license: AiLicense;
  sourceUrl: string;
  artifactHash: string;
  capabilities: readonly string[];
  dataResidency: string;
  trust: AiTrust;
  openSource: boolean;
  openScience: boolean;
}

export interface AiVaultPolicy {
  allowedLicenses: readonly AiLicense[];
  allowedProviders: readonly string[];
  requireOpenSource: boolean;
  requireOpenScience: boolean;
  allowedResidencies: readonly string[];
}

const entries = new Map<string, AiVaultEntry>();
const DEFAULT_POLICY: AiVaultPolicy = {
  allowedLicenses: ["MIT", "Apache-2.0", "BSD-3-Clause", "CC-BY-4.0", "ODbL-1.0"],
  allowedProviders: [],
  requireOpenSource: true,
  requireOpenScience: false,
  allowedResidencies: ["local", "mx", "global"],
};

function key(entry: Pick<AiVaultEntry, "id" | "version">): string {
  return `${entry.id}@${entry.version}`;
}

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function registerAi(entry: AiVaultEntry): AiVaultEntry {
  if (!/^[a-z0-9][a-z0-9._/-]{1,127}$/i.test(entry.id)) throw new Error("invalid_ai_id");
  if (!entry.sourceUrl.startsWith("https://")) throw new Error("source_must_be_https");
  if (!entry.openSource && entry.openScience) throw new Error("open_science_requires_open_source");
  const stored = Object.freeze({ ...entry, capabilities: [...entry.capabilities] });
  entries.set(key(entry), stored);
  return { ...stored, capabilities: [...stored.capabilities] };
}

export function evaluateAi(
  entry: AiVaultEntry,
  policy: AiVaultPolicy = DEFAULT_POLICY,
): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (entry.trust === "revoked") reasons.push("trust_revoked");
  if (!policy.allowedLicenses.includes(entry.license)) reasons.push("license_not_allowed");
  if (policy.allowedProviders.length > 0 && !policy.allowedProviders.includes(entry.provider))
    reasons.push("provider_not_allowed");
  if (policy.requireOpenSource && !entry.openSource) reasons.push("open_source_required");
  if (policy.requireOpenScience && !entry.openScience) reasons.push("open_science_required");
  if (!policy.allowedResidencies.includes(entry.dataResidency))
    reasons.push("residency_not_allowed");
  return { allowed: reasons.length === 0, reasons };
}

export function resolveAi(id: string, version: string, policy?: AiVaultPolicy): AiVaultEntry {
  const entry = entries.get(`${id}@${version}`);
  if (!entry) throw new Error("ai_not_registered");
  const decision = evaluateAi(entry, policy);
  if (!decision.allowed) throw new Error(`ai_not_authorized:${decision.reasons.join(",")}`);
  return { ...entry, capabilities: [...entry.capabilities] };
}

export function listAis(): AiVaultEntry[] {
  return [...entries.values()].map((entry) => ({
    ...entry,
    capabilities: [...entry.capabilities],
  }));
}

export function revokeAi(id: string, version: string): void {
  const entry = entries.get(`${id}@${version}`);
  if (entry) entries.set(`${id}@${version}`, Object.freeze({ ...entry, trust: "revoked" }));
}

export const aiVaultPolicy = DEFAULT_POLICY;

export function clearAiVaultForTests(): void {
  entries.clear();
}

export const AI_VAULT_CONTRACT_VERSION = "1.0.0";

export function describeAiVault(): { version: string; count: number; digest: string } {
  return {
    version: AI_VAULT_CONTRACT_VERSION,
    count: entries.size,
    digest: fingerprint(listAis()),
  };
}

export type AiVaultDecision = ReturnType<typeof evaluateAi>;

export function assertAiVaultEntry(entry: AiVaultEntry): void {
  const decision = evaluateAi(entry);
  if (!decision.allowed) throw new Error(`invalid_ai_vault_entry:${decision.reasons.join(",")}`);
}

export const aiVault = { registerAi, evaluateAi, resolveAi, listAis, revokeAi, describeAiVault };
export default aiVault;
