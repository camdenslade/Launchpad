import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post
} from "@nestjs/common";
import type { Job as JobDto } from "@launchpad/contracts";
import { enqueueJob, type Job, type PrismaClient } from "@launchpad/database";
import { InjectDatabase } from "../database/database.module.js";

/**
 * Visibility into background work. Jobs are created by the features that
 * need them (deployments, Terraform plans); these routes let the UI poll
 * progress and let operators verify the worker.
 *
 *   GET  /api/jobs                 recent jobs
 *   GET  /api/jobs/:id             one job (poll this for progress)
 *   POST /api/jobs/self-test       enqueue a worker self-test
 */
@Controller("jobs")
export class JobsController {
  constructor(@InjectDatabase() private readonly db: PrismaClient) {}

  @Get()
  async list(): Promise<JobDto[]> {
    const jobs = await this.db.job.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    return jobs.map(toDto);
  }

  @Get(":id")
  async get(@Param("id", ParseUUIDPipe) id: string): Promise<JobDto> {
    const job = await this.db.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return toDto(job);
  }

  @Post("self-test")
  @HttpCode(HttpStatus.ACCEPTED) // 202: accepted for processing, not done yet
  async selfTest(): Promise<JobDto> {
    return toDto(await enqueueJob(this.db, { type: "system.selfTest", maxAttempts: 1 }));
  }
}

/** Hide worker internals (lock owner, raw payload) from API clients. */
function toDto(job: Job): JobDto {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    runAt: job.runAt.toISOString(),
    lastError: job.lastError,
    result: job.result ?? null,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null
  };
}
