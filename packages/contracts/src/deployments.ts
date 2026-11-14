import { z } from "zod";

/** `GET /api/environments/:id/deploy-workflow`: a GitHub Actions workflow to add to the repo. */
export const DeployWorkflowSchema = z.object({
  /** False until the environment's service + deploy role have been applied. */
  ready: z.boolean(),
  /** Why it isn't ready yet (shown to the user). */
  reason: z.string().nullable(),
  /** Repository-relative path, e.g. .github/workflows/launchpad-deploy-staging.yml */
  path: z.string(),
  content: z.string().nullable(),
  /** GitHub environment the job uses; must exist in the repo's settings. */
  githubEnvironment: z.string(),
  githubRepository: z.string().nullable(),
  branch: z.string(),
  /** Deploys on push to `branch` (non-production) or only when run manually (production). */
  trigger: z.enum(["push", "manual"]),
  /** Opens GitHub's "new file" editor pre-filled with the workflow. */
  createFileUrl: z.url().nullable(),
  /** Where to create the GitHub environment. */
  environmentsSettingsUrl: z.url().nullable()
});
export type DeployWorkflow = z.infer<typeof DeployWorkflowSchema>;

export const DeploymentStateSchema = z.enum(["in_progress", "completed", "failed"]);
export type DeploymentState = z.infer<typeof DeploymentStateSchema>;

/** One deployable revision of an environment's service (newest first in lists). */
export const DeploymentSchema = z.object({
  id: z.uuid(),
  revision: z.number().int(),
  image: z.string().nullable(),
  commitSha: z.string().nullable(),
  /** Link to the commit on GitHub, when known. */
  commitUrl: z.url().nullable(),
  registeredAt: z.iso.datetime().nullable(),
  /** e.g. "GitHub Actions (launchpad-x-deploy)" or an IAM principal. */
  registeredBy: z.string().nullable(),
  /** Rollout outcome when observed; null if it was never seen deploying. */
  state: DeploymentStateSchema.nullable(),
  stateReason: z.string().nullable(),
  /** The revision the service is running (or rolling out) now. */
  current: z.boolean()
});
export type Deployment = z.infer<typeof DeploymentSchema>;

export const RollbackStatusSchema = z.enum([
  "pending_approval",
  "queued",
  "running",
  "succeeded",
  "failed",
  "rejected"
]);
export type RollbackStatus = z.infer<typeof RollbackStatusSchema>;

export const RollbackRequestSchema = z.object({
  id: z.uuid(),
  environmentId: z.uuid(),
  targetRevision: z.number().int(),
  fromRevision: z.number().int().nullable(),
  status: RollbackStatusSchema,
  error: z.string().nullable(),
  requestedBy: z.string().nullable(),
  approvedBy: z.string().nullable(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable()
});
export type RollbackRequest = z.infer<typeof RollbackRequestSchema>;

/** `GET /api/environments/:id/deployments`: live from the cloud, newest first. */
export const DeploymentHistorySchema = z.object({
  ready: z.boolean(),
  reason: z.string().nullable(),
  deployments: z.array(DeploymentSchema),
  /** A rollout is happening right now. */
  rollingOut: z.boolean(),
  rollbacks: z.array(RollbackRequestSchema)
});
export type DeploymentHistory = z.infer<typeof DeploymentHistorySchema>;

/** Body of `POST /api/environments/:id/rollbacks`. */
export const CreateRollbackSchema = z.object({ revision: z.number().int().positive() }).strict();
export type CreateRollback = z.infer<typeof CreateRollbackSchema>;
