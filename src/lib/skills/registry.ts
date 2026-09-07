import { ORION, SOPHIA, ARGUS, HERMES, ATLAS, ANUBIS, GEMET } from "./core-pack";
import { AURORA, GAIA, NODO_CERO, PHAROS } from "./territorial-pack";
import { CITEMESH, HEPHAESTUS } from "./infrastructure-pack";
import { MNEMOSYNE, CHRONOS, PROMETEO } from "./archive-pack";
import { VIGIA, LYRA, EIRENE } from "./ethics-pack";
import { THEMIS, SENTINEL } from "./sovereignty-pack";
import { HELIOS, KAIROS } from "./economy-pack";
import { UTAMV } from "./education-pack";
import { HEPTA } from "./hepta.skill";

export const isabellaSkills = {
  ORION,
  SOPHIA,
  ARGUS,
  HERMES,
  ATLAS,
  ANUBIS,
  GEMET,
  AURORA,
  CITEMESH,
  MNEMOSYNE,
  HELIOS,
  GAIA,
  NODO_CERO,
  CHRONOS,
  VIGIA,
  LYRA,
  PROMETEO,
  THEMIS,
  PHAROS,
  KAIROS,
  HEPHAESTUS,
  EIRENE,
  SENTINEL,
  UTAMV,
  HEPTA,
} as const;

export type IsabellaSkillId = keyof typeof isabellaSkills;

export function getIsabellaSkill(id: IsabellaSkillId) {
  return isabellaSkills[id];
}

export function listIsabellaSkills() {
  return Object.values(isabellaSkills).map((skill) => ({
    id: skill.id,
    name: skill.name,
    version: skill.version,
    federation: skill.federation,
    risk: skill.risk,
    description: skill.description,
  }));
}

export type RuntimeSkill = {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly federation: import("./contracts").FederationId;
  readonly risk: import("./contracts").SkillRisk;
  readonly description: string;
  canRun(input: Record<string, unknown>, context: import("./contracts").SkillContext): boolean;
  run(
    input: Record<string, unknown>,
    context: import("./contracts").SkillContext,
  ): Promise<import("./contracts").SkillResult<unknown>>;
};

export const getRuntimeSkill = (id: IsabellaSkillId): RuntimeSkill =>
  isabellaSkills[id] as unknown as RuntimeSkill;
