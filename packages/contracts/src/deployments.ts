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
