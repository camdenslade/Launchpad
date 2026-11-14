import { Global, Injectable, Logger, Module } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@launchpad/database";
import { InjectDatabase } from "../database/database.module.js";

export interface AuditEntry {
  actorId: string | null;
  /** Dotted verb, e.g. "cloud_account.connected". */
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Records sensitive operations (cloud accounts, infrastructure changes,
 * production deploys). Append-only: there is deliberately no update/delete.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger("Audit");

  constructor(@InjectDatabase() private readonly db: PrismaClient) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.db.auditEvent.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata: entry.metadata ?? {}
      }
    });
    // Also emit to the structured log so it reaches external log pipelines.
    this.logger.log(`${entry.action} ${entry.targetType}:${entry.targetId} by ${entry.actorId ?? "system"}`);
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
