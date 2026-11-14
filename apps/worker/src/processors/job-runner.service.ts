import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  claimNextJob,
  completeJob,
  failJob,
  requeueStaleJobs,
  type Job,
  type PrismaClient
} from "@launchpad/database";
import type { Env } from "../config/env.js";
import { InjectDatabase } from "../database.module.js";
import { JOB_HANDLERS, NonRetryableJobError, type JobHandler } from "../jobs/job-handler.js";

/** How often to check for jobs abandoned by crashed workers. */
const STALE_CHECK_INTERVAL_MS = 60_000;

/**
 * The worker's main loop: claim a job, run its handler, record the outcome.
 * Runs one job at a time (safe default for Terraform/deploys); scale out by
 * running more worker processes. The queue makes that safe.
 */
@Injectable()
export class JobRunnerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger("JobRunner");
  private readonly handlers: Map<string, JobHandler>;
  private readonly workerId: string;
  private readonly pollIntervalMs: number;
  private readonly staleAfterMs: number;

  private readonly shutdown = new AbortController();
  private loop: Promise<void> | null = null;
  private lastStaleCheck = 0;

  constructor(
    @InjectDatabase() private readonly db: PrismaClient,
    @Inject(JOB_HANDLERS) handlers: JobHandler[],
    config: ConfigService<Env, true>
  ) {
    this.handlers = new Map(handlers.map((handler) => [handler.type, handler]));
    this.workerId = config.get("WORKER_ID", { infer: true });
    this.pollIntervalMs = config.get("WORKER_POLL_INTERVAL_MS", { infer: true });
    this.staleAfterMs = config.get("WORKER_STALE_JOB_MS", { infer: true });
  }

  onApplicationBootstrap(): void {
    this.logger.log(
      `Worker ${this.workerId} started; handling: ${[...this.handlers.keys()].join(", ")}`
    );
    this.loop = this.run();
  }

  /** On SIGTERM: stop claiming, let the current job finish, then exit. */
  async onApplicationShutdown(): Promise<void> {
    this.shutdown.abort();
    await this.loop;
    this.logger.log("Worker stopped");
  }

  private async run(): Promise<void> {
    const types = [...this.handlers.keys()];

    while (!this.shutdown.signal.aborted) {
      try {
        await this.recoverStaleJobs();

        const job = await claimNextJob(this.db, this.workerId, types);
        if (job) {
          await this.execute(job);
          continue; // there may be more work; check again immediately
        }
      } catch (error) {
        // DB blip etc. Log and keep going; never let the loop die.
        this.logger.error(`Queue error: ${(error as Error).message}`);
      }

      await sleep(this.pollIntervalMs, this.shutdown.signal);
    }
  }

  private async execute(job: Job): Promise<void> {
    const handler = this.handlers.get(job.type);
    const logger = new Logger(`Job:${job.type}`);
    const started = Date.now();

    if (!handler) {
      await failJob(this.db, job, new Error(`No handler for job type "${job.type}"`), { retry: false });
      return;
    }

    logger.log(`Running ${job.id} (attempt ${job.attempts}/${job.maxAttempts})`);

    try {
      const result = await handler.run(job.payload, {
        job,
        logger,
        signal: this.shutdown.signal
      });
      await completeJob(this.db, job.id, result ?? undefined);
      logger.log(`Succeeded ${job.id} in ${Date.now() - started}ms`);
    } catch (error) {
      const retry = !(error instanceof NonRetryableJobError);
      const updated = await failJob(this.db, job, error, { retry });
      logger.warn(
        `Failed ${job.id}: ${(error as Error).message}` +
          (updated.status === "queued" ? ` (retrying at ${updated.runAt.toISOString()})` : " (giving up)")
      );
    }
  }

  private async recoverStaleJobs(): Promise<void> {
    if (Date.now() - this.lastStaleCheck < STALE_CHECK_INTERVAL_MS) return;
    this.lastStaleCheck = Date.now();

    const recovered = await requeueStaleJobs(this.db, this.staleAfterMs);
    if (recovered > 0) this.logger.warn(`Re-queued ${recovered} abandoned job(s)`);
  }
}

/** setTimeout as a promise that resolves early when `signal` aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
