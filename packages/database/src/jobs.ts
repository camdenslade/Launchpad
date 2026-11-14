import { Prisma, type Job, type PrismaClient } from "../generated/prisma/client.js";

/**
 * Postgres-backed job queue, shared by the API (enqueue) and worker (run).
 *
 * Lifecycle:  queued -> running -> succeeded
 *                           \-> queued again (retry with backoff) -> ... -> failed
 *
 * Why Postgres instead of Redis: one less service to self-host, and jobs are
 * transactional with the rest of the data (e.g. create a deployment row and
 * its job atomically).
 */

export interface EnqueueOptions {
  type: string;
  payload?: Prisma.InputJsonValue;
  /** Delay execution until this time. */
  runAt?: Date;
  maxAttempts?: number;
}

/** Anything with a `job` delegate: the client itself or a transaction. */
type JobDb = Pick<PrismaClient, "job">;

export function enqueueJob(db: JobDb, options: EnqueueOptions): Promise<Job> {
  return db.job.create({
    data: {
      type: options.type,
      payload: options.payload ?? {},
      runAt: options.runAt ?? new Date(),
      maxAttempts: options.maxAttempts ?? 3
    }
  });
}

/**
 * Atomically claims the next runnable job of the given types.
 * `FOR UPDATE SKIP LOCKED` lets many workers poll concurrently without ever
 * claiming the same row, and without blocking each other.
 */
export async function claimNextJob(
  db: PrismaClient,
  workerId: string,
  types: readonly string[]
): Promise<Job | null> {
  if (types.length === 0) return null;

  // Use the app's clock, never the database's now(): every other queue
  // timestamp (runAt, retry backoff, stale cutoff) is written by the app, and
  // DB/app clocks can drift apart (Docker Desktop VMs are often ~1 min off).
  // Columns are UTC `timestamp`s, so convert explicitly.
  const now = Prisma.sql`(${new Date().toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

  const rows = await db.$queryRaw<Job[]>`
    UPDATE "Job"
    SET status = 'running',
        "lockedAt" = ${now},
        "lockedBy" = ${workerId},
        attempts = attempts + 1,
        "updatedAt" = ${now}
    WHERE id = (
      SELECT id FROM "Job"
      WHERE status = 'queued'
        AND "runAt" <= ${now}
        AND type = ANY(${types as string[]})
      ORDER BY "runAt"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *`;

  return rows[0] ?? null;
}

export function completeJob(
  db: PrismaClient,
  jobId: string,
  result?: Prisma.InputJsonValue
): Promise<Job> {
  return db.job.update({
    where: { id: jobId },
    data: {
      status: "succeeded",
      ...(result === undefined ? {} : { result }),
      lastError: null,
      lockedAt: null,
      lockedBy: null,
      finishedAt: new Date()
    }
  });
}

/**
 * Records a failure. Retries with exponential backoff (5s, 25s, 125s...)
 * until `maxAttempts`, then marks the job permanently failed.
 * Pass `retry: false` for errors that will never succeed (bad input).
 */
export function failJob(
  db: PrismaClient,
  job: Pick<Job, "id" | "attempts" | "maxAttempts">,
  error: unknown,
  { retry = true }: { retry?: boolean } = {}
): Promise<Job> {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const willRetry = retry && job.attempts < job.maxAttempts;

  return db.job.update({
    where: { id: job.id },
    data: {
      status: willRetry ? "queued" : "failed",
      lastError: message.slice(0, 10_000),
      lockedAt: null,
      lockedBy: null,
      ...(willRetry
        ? { runAt: new Date(Date.now() + 5_000 * 5 ** (job.attempts - 1)) }
        : { finishedAt: new Date() })
    }
  });
}

/**
 * Re-queues jobs whose worker died mid-run (crash, OOM, deploy). A job
 * "running" for longer than `staleAfterMs` is assumed abandoned.
 * Returns the number of jobs recovered.
 */
export async function requeueStaleJobs(db: PrismaClient, staleAfterMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const { count } = await db.job.updateMany({
    where: { status: "running", lockedAt: { lt: cutoff } },
    data: {
      status: "queued",
      lockedAt: null,
      lockedBy: null,
      lastError: "Worker stopped responding; job re-queued"
    }
  });
  return count;
}
