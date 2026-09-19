import { z } from "zod";

export const EnvironmentFindingSchema = z.object({
  findingId: z.string(),
  type: z.enum([
    "MISSING_IN_CONTRACT",
    "MISSING_IN_CODE",
    "TYPE_MISMATCH",
    "REQUIRED_NOT_MARKED",
    "ORPHAN_VARIABLE",
    "STALE_VARIABLE",
    "INSECURE_DEFAULT",
    "PRODUCTION_MISSING",
  ]),
  variable_name: z.string(),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  details: z.object({
    expected_in: z.array(z.string()),
    found_in: z.array(z.string()),
    expected_type: z.string().optional(),
    actual_type: z.string().optional(),
    code_locations: z
      .array(
        z.object({
          file: z.string(),
          line: z.number(),
          context: z.string(),
        }),
      )
      .optional(),
  }),
  remediation: z.string(),
});

export type EnvironmentFinding = z.infer<typeof EnvironmentFindingSchema>;

export function validateEnvironmentFinding(finding: unknown): EnvironmentFinding {
  return EnvironmentFindingSchema.parse(finding);
}
