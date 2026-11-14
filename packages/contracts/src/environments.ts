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

/** apply: create/update to match the stack. destroy: tear everything down. */
export const InfrastructureOperationSchema = z.enum(["apply", "destroy"]);
export type InfrastructureOperation = z.infer<typeof InfrastructureOperationSchema>;

/** Body of `POST /api/environments/:id/plan`. An empty body means a normal plan. */
export const PlanRequestSchema = z.preprocess(
  (body) => body ?? {},
  z.object({ operation: InfrastructureOperationSchema.default("apply") }).strict()
);
export type PlanRequest = z.infer<typeof PlanRequestSchema>;

export const InfrastructureRunSchema = z.object({
  id: z.uuid(),
  environmentId: z.uuid(),
  operation: InfrastructureOperationSchema,
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

/**
 * Fargate sizes offered to developers. Fargate only accepts specific
 * CPU/memory pairs, so we expose named presets instead of free numbers.
 * Prices are approximate us-east-1 on-demand, per task, running 24/7.
 */
export const SERVICE_SIZES = {
  xs: { cpu: 256, memory: 512, label: "0.25 vCPU · 0.5 GB", monthlyUsd: 9 },
  s: { cpu: 256, memory: 1024, label: "0.25 vCPU · 1 GB", monthlyUsd: 11 },
  m: { cpu: 512, memory: 1024, label: "0.5 vCPU · 1 GB", monthlyUsd: 18 },
  l: { cpu: 1024, memory: 2048, label: "1 vCPU · 2 GB", monthlyUsd: 36 },
  xl: { cpu: 2048, memory: 4096, label: "2 vCPU · 4 GB", monthlyUsd: 72 }
} as const;
export type ServiceSize = keyof typeof SERVICE_SIZES;

/** Fixed monthly cost of the load balancer when the service is on. */
export const LOAD_BALANCER_MONTHLY_USD = 16;

/** Developer-facing inputs for the stack's ECS service (Environment settings). */
export const ServiceSettingsSchema = z
  .object({
    /** Run the project as a load-balanced web service (costs money while on). */
    enabled: z.boolean().default(false),
    containerPort: z.number().int().min(1).max(65535).default(80),
    healthCheckPath: z
      .string()
      .regex(/^\/[\w\-./~%?=&]*$/, "Must be a path starting with /")
      .max(200)
      .default("/"),
    size: z.enum(Object.keys(SERVICE_SIZES) as [ServiceSize, ...ServiceSize[]]).default("xs"),
    desiredCount: z.number().int().min(0).max(10).default(1)
  })
  .strict();
export type ServiceSettings = z.infer<typeof ServiceSettingsSchema>;

/** Rough monthly cost of the settings, for display before planning. */
export function estimateMonthlyCost(settings: ServiceSettings): number {
  if (!settings.enabled) return 0;
  return LOAD_BALANCER_MONTHLY_USD + SERVICE_SIZES[settings.size].monthlyUsd * settings.desiredCount;
}

export const EnvironmentSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  name: z.string(),
  kind: EnvironmentKindSchema,
  slug: z.string(),
  region: z.string(),
  approvalPolicy: ApprovalPolicySchema,
  cloudAccount: z.object({ id: z.uuid(), name: z.string(), provider: z.string(), accountId: z.string().nullable() }),
  /** True when infrastructure exists (last applied run was not a teardown). */
  provisioned: z.boolean(),
  serviceSettings: ServiceSettingsSchema,
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

/** Body of `PATCH /api/environments/:id`. Send only what changes. */
export const UpdateEnvironmentSchema = z
  .object({
    approvalPolicy: ApprovalPolicySchema.optional(),
    serviceSettings: ServiceSettingsSchema.optional()
  })
  .strict()
  .refine((body) => body.approvalPolicy !== undefined || body.serviceSettings !== undefined, {
    message: "Nothing to update"
  });
export type UpdateEnvironment = z.infer<typeof UpdateEnvironmentSchema>;
