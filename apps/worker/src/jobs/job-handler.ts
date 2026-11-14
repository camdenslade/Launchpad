import type { Logger } from "@nestjs/common";
import type { Job, Prisma } from "@launchpad/database";

/** What a handler gets besides its payload. */
export interface JobContext {
  job: Job;
  logger: Logger;
  /** Aborted when the worker is shutting down; long-running work should stop. */
  signal: AbortSignal;
}

/**
 * One kind of background work (e.g. "terraform.plan"). To add a job type:
 *   1. implement this interface in `jobs/handlers/`
 *   2. add the class to JOB_HANDLER_CLASSES in jobs/handlers/index.ts
 *   3. enqueue it from the API with `enqueueJob(db, { type, payload })`
 */
export interface JobHandler {
  readonly type: string;
  /** Validate `payload` yourself (it comes from the database as unknown JSON). */
  run(payload: unknown, context: JobContext): Promise<Prisma.InputJsonValue | void>;
}

/**
 * Throw this for failures that retrying can't fix (invalid payload, missing
 * resource). The job is marked failed immediately instead of retried.
 */
export class NonRetryableJobError extends Error {
  override name = "NonRetryableJobError";
}

export const JOB_HANDLERS = Symbol("JOB_HANDLERS");
