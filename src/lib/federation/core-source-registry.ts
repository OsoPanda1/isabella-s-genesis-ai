import { z } from "zod";

export const CoreSourceDecisionSchema = z.enum(["adopt", "adapt", "reference", "reject"]);
export type CoreSourceDecision = z.infer<typeof CoreSourceDecisionSchema>;

export const CoreSourceSchema = z.object({
  repository: z.string().regex(/^OsoPanda1\/[a-z0-9-]+$/),
  commit: z.string().min(7),
  decision: CoreSourceDecisionSchema,
  domains: z.array(z.string().min(1)).min(1),
  rationale: z.string().min(20),
  sensitiveArtifactsExcluded: z.array(z.string()),
});
export type CoreSource = z.infer<typeof CoreSourceSchema>;

export const CORE_SOURCE_REGISTRY: readonly CoreSource[] = [
  {
    repository: "OsoPanda1/isabella-s-core",
    commit: "main@2026-08-31",
    decision: "reference",
    domains: ["canonical-ui", "pipeline-visualization", "shadcn-components"],
    rationale:
      "Fuente visual útil, pero su runtime Lovable/Vite no sustituye el runtime canónico de Isabella Genesis.",
    sensitiveArtifactsExcluded: [".env", "bun.lock", "generated route trees"],
  },
  {
    repository: "OsoPanda1/isabella-s-core-intelligence",
    commit: "main@2026-09-01",
    decision: "adapt",
    domains: ["crown", "memory", "governance", "cognitive-ui", "territorial-context"],
    rationale:
      "Aporta doctrina y módulos cognitivos compatibles, que deben pasar por contratos, política y auditoría de Genesis.",
    sensitiveArtifactsExcluded: [".env", "media assets", "provider credentials"],
  },
  {
    repository: "OsoPanda1/civilis-graph",
    commit: "main@2026-09-01",
    decision: "adapt",
    domains: ["territorial-graph", "ontology", "zero-trust", "observability"],
    rationale:
      "Sus ontologías y políticas pueden alimentar el contexto territorial, sin importar datos operativos o servicios incompatibles.",
    sensitiveArtifactsExcluded: [".env", "service deployment manifests", "external datasets"],
  },
  {
    repository: "OsoPanda1/rdm-digital-hub",
    commit: "main@2026-08-18",
    decision: "reference",
    domains: ["rdm-operations", "archive", "city-apis", "continuity"],
    rationale:
      "Se conserva como referencia operativa; sus rutas Next/Docker requieren un adaptador explícito antes de integrarse en Vercel.",
    sensitiveArtifactsExcluded: [".env", "Docker runtime", "submodules", "uploads and dumps"],
  },
] as const;

export function getCoreSource(repository: string): CoreSource | undefined {
  return CORE_SOURCE_REGISTRY.find((source) => source.repository === repository);
}

export function assertCoreSourceRegistry(): void {
  CORE_SOURCE_REGISTRY.forEach((source) => CoreSourceSchema.parse(source));
}
