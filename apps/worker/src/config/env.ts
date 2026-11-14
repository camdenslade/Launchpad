import { hostname, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";

/** Every environment variable the worker reads, validated at startup. */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  /** Identifies this worker in `Job.lockedBy`. Defaults to host + pid. */
  WORKER_ID: z.string().min(1).default(`${hostname()}:${process.pid}`),
  /** How often to look for new jobs when the queue is empty. */
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(1000),
  /** A job "running" longer than this is assumed abandoned and re-queued. */
  WORKER_STALE_JOB_MS: z.coerce.number().int().min(60_000).default(30 * 60_000),
  /** Scratch space for Terraform runs (one folder per run, deleted after). */
  WORKER_WORK_DIR: z.string().min(1).default(join(tmpdir(), "launchpad-worker")),
  /** Terraform executable (must be >= 1.10). */
  TERRAFORM_BIN: z.string().min(1).default("terraform"),
  /**
   * Folder holding Launchpad's Terraform (stacks/ and modules/). Point this at
   * your platform team's own checkout to customise the golden path.
   */
  TERRAFORM_DIR: z.string().min(1).default(resolve(process.cwd(), "../../infrastructure/terraform")),
  /** Hard limit for a single terraform command. */
  TERRAFORM_TIMEOUT_MS: z.coerce.number().int().min(60_000).default(45 * 60_000)
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return result.data;
}
