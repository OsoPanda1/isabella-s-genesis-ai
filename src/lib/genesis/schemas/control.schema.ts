import { z } from "zod";

export const ControlSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(256),
  description: z.string().min(1),
  claimId: z.string().optional(),
  implemented: z.boolean().default(false),
  evidenceRequired: z.array(z.string()).default([]),
  tests: z.array(z.string()).default([]),
  category: z.enum([
    "FINANCIAL",
    "SECURITY",
    "DATABASE",
    "AUTH",
    "AUDIT",
    "CI_CD",
    "SUPPLY_CHAIN",
    "ENVIRONMENT",
    "GOVERNANCE",
    "PRIVACY",
    "COMPLIANCE",
    "PERFORMANCE",
    "RELIABILITY",
    "MAINTAINABILITY",
  ]),
  owner: z.string().optional(),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Control = z.infer<typeof ControlSchema>;

export function validateControl(control: unknown): Control {
  return ControlSchema.parse(control);
}
