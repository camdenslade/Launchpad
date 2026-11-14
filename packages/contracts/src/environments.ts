import { z } from "zod";

export const EnvironmentKindSchema = z.enum(["development", "staging", "production"]);
export type EnvironmentKind = z.infer<typeof EnvironmentKindSchema>;

/**
 * any_member: whoever requested the plan may approve it.
 * different_member: a second person must approve (four-eyes).
 */
export const ApprovalPolicySchema = z.enum(["any_member", "different_member"]);
export type ApprovalPolicy = z.infer<typeof ApprovalPolicySchema>;

export const InfrastructureRunStatusSchema = z.enum([
  "queued",
  "planning",
  "planned",
  "no_changes",
  "approved",
  "applying",
  "applied",
  "rejected",
  "superseded",
  "failed"
]);
export type InfrastructureRunStatus = z.infer<typeof InfrastructureRunStatusSchema>;

export const PlanSummarySchema = z.object({
  add: z.number().int(),
  change: z.number().int(),
  destroy: z.number().int(),
  resources: z.array(
    z.object({
      address: z.string(),
      type: z.string(),
      action: z.enum(["create", "update", "delete", "replace"])
    })
  )
});
export type PlanSummary = z.infer<typeof PlanSummarySchema>;

export const InfrastructureRunSchema = z.object({
  id: z.uuid(),
  environmentId: z.uuid(),
  status: InfrastructureRunStatusSchema,
  summary: PlanSummarySchema.nullable(),
  outputs: z.record(z.string(), z.unknown()).nullable(),
  error: z.string().nullable(),
  requestedBy: z.string().nullable(),
  approvedBy: z.string().nullable(),
  approvedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable()
});
export type InfrastructureRun = z.infer<typeof InfrastructureRunSchema>;

/** A run including its Terraform logs (`GET /api/infrastructure/runs/:id`). */
export const InfrastructureRunDetailSchema = InfrastructureRunSchema.extend({
  planLog: z.string().nullable(),
  applyLog: z.string().nullable()
});
export type InfrastructureRunDetail = z.infer<typeof InfrastructureRunDetailSchema>;

export const EnvironmentSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  name: z.string(),
  kind: EnvironmentKindSchema,
  slug: z.string(),
  region: z.string(),
  approvalPolicy: ApprovalPolicySchema,
  cloudAccount: z.object({ id: z.uuid(), name: z.string(), provider: z.string(), accountId: z.string().nullable() }),
  latestRun: InfrastructureRunSchema.nullable(),
  createdAt: z.iso.datetime()
});
export type Environment = z.infer<typeof EnvironmentSchema>;

/** Body of `POST /api/projects/:projectId/environments`. */
export const CreateEnvironmentSchema = z
  .object({
    name: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z][a-z0-9-]{0,19}$/, "Use lowercase letters, digits and dashes (max 20), e.g. staging"),
    kind: EnvironmentKindSchema,
    cloudAccountId: z.uuid(),
    /** Defaults to the cloud account's region. */
    region: z.string().regex(/^[a-z]{2}(-gov)?-[a-z]+-\d$/).optional(),
    /** Defaults to different_member for production, any_member otherwise. */
    approvalPolicy: ApprovalPolicySchema.optional()
  })
  .strict();
export type CreateEnvironment = z.infer<typeof CreateEnvironmentSchema>;

/** Body of `PATCH /api/environments/:id`. */
export const UpdateEnvironmentSchema = z.object({ approvalPolicy: ApprovalPolicySchema }).strict();
export type UpdateEnvironment = z.infer<typeof UpdateEnvironmentSchema>;
