import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PrismaClient } from "@launchpad/database";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { InjectDatabase } from "../../database.module.js";
import { NonRetryableJobError, type JobContext, type JobHandler } from "../job-handler.js";

const PayloadSchema = z.object({ note: z.string().max(200).optional() }).strict();

/**
 * "system.selfTest": proves the full pipeline works (API -> queue -> worker
 * -> database -> result). Useful after installing or upgrading.
 */
@Injectable()
export class SystemSelfTestHandler implements JobHandler {
  readonly type = "system.selfTest";

  constructor(
    @InjectDatabase() private readonly db: PrismaClient,
    private readonly config: ConfigService<Env, true>
  ) {}

  async run(payload: unknown, { job, logger }: JobContext) {
    const parsed = PayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new NonRetryableJobError(`Invalid payload: ${parsed.error.issues[0]?.message}`);
    }

    const [row] = await this.db.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
    logger.log(`Self-test ${job.id} ok`);

    return {
      ok: true,
      workerId: this.config.get("WORKER_ID", { infer: true }),
      databaseTime: row?.now.toISOString() ?? null,
      note: parsed.data.note ?? null
    };
  }
}
