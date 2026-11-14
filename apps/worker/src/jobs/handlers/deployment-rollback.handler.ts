import { Injectable } from "@nestjs/common";
import { assumeAwsRole, EcsDeployments } from "@launchpad/integrations";
import type { PrismaClient } from "@launchpad/database";
import { z } from "zod";
import { InjectDatabase } from "../../database.module.js";
import { NonRetryableJobError, type JobContext, type JobHandler } from "../job-handler.js";

const PayloadSchema = z.object({ rollbackId: z.uuid() }).strict();

/** How long to watch a rollout before giving up (ECS keeps going regardless). */
const WATCH_TIMEOUT_MS = 15 * 60_000;
const POLL_MS = 10_000;

/**
 * "deployments.rollback": points an environment's ECS service back at an
 * earlier task definition revision and watches the rollout.
 *
 * Safe to resume: if the worker restarts mid-rollout, the service is already
 * targeting the revision, so it only resumes watching.
 */
@Injectable()
export class DeploymentRollbackHandler implements JobHandler {
  readonly type = "deployments.rollback";

  constructor(@InjectDatabase() private readonly db: PrismaClient) {}

  async run(payload: unknown, { logger, signal }: JobContext) {
    const parsed = PayloadSchema.safeParse(payload);
    if (!parsed.success) throw new NonRetryableJobError("Invalid payload: expected { rollbackId }");
    const { rollbackId } = parsed.data;

    const rollback = await this.db.rollbackRequest.findUnique({
      where: { id: rollbackId },
      include: { environment: { include: { cloudAccount: true } } }
    });
    if (!rollback) throw new NonRetryableJobError(`Rollback ${rollbackId} not found`);
    if (rollback.status !== "queued" && rollback.status !== "running") {
      logger.warn(`Rollback ${rollbackId} is ${rollback.status}; skipping`);
      return { skipped: rollback.status };
    }

    const fail = async (message: string) => {
      await this.db.rollbackRequest.update({
        where: { id: rollbackId },
        data: { status: "failed", error: message, finishedAt: new Date() }
      });
      return new NonRetryableJobError(message);
    };

    const { environment } = rollback;
    const account = environment.cloudAccount;
    const applied = await this.db.infrastructureRun.findFirst({
      where: { environmentId: environment.id, status: "applied" },
      orderBy: { createdAt: "desc" }
    });
    const outputs = (applied?.operation === "apply" ? applied.outputs : null) as Record<string, string> | null;
    if (!outputs?.["ecs_cluster"] || !outputs["ecs_service"] || !outputs["aws_region"]) {
      throw await fail("The environment's service isn't provisioned anymore.");
    }
    if (account.status !== "connected" || !account.roleArn) {
      throw await fail(`Cloud account "${account.name}" isn't connected.`);
    }

    const cluster = outputs["ecs_cluster"];
    const service = outputs["ecs_service"];
    const region = outputs["aws_region"];

    try {
      const credentials = await assumeAwsRole({
        roleArn: account.roleArn,
        externalId: account.externalId,
        region,
        sessionName: `launchpad-rollback-${rollbackId.slice(0, 8)}`
      });
      const ecs = new EcsDeployments(region, credentials);

      const before = await ecs.serviceStatus(cluster, service);
      if (before.currentTaskDefinitionArn !== rollback.targetTaskDefinitionArn) {
        await ecs.rollTo(cluster, service, rollback.targetTaskDefinitionArn);
        logger.log(`Rolling ${environment.slug} back to revision ${rollback.targetRevision}`);
      } else {
        logger.log(`Service already targets revision ${rollback.targetRevision}; watching the rollout`);
      }
      await this.db.rollbackRequest.update({ where: { id: rollbackId }, data: { status: "running", error: null } });

      // Watch until ECS reports the rollout finished. The deployment circuit
      // breaker reverts a rollout that never becomes healthy.
      const deadline = Date.now() + WATCH_TIMEOUT_MS;
      while (Date.now() < deadline && !signal.aborted) {
        const status = await ecs.serviceStatus(cluster, service);
        const rollout = status.deployments.find((d) => d.taskDefinitionArn === rollback.targetTaskDefinitionArn);

        if (rollout) {
          await this.db.deployment.updateMany({
            where: { environmentId: environment.id, taskDefinitionArn: rollback.targetTaskDefinitionArn },
            data: { state: rollout.rolloutState, stateReason: rollout.rolloutReason }
          });
        }

        if (rollout?.primary && rollout.rolloutState === "completed") {
          await this.db.rollbackRequest.update({
            where: { id: rollbackId },
            data: { status: "succeeded", finishedAt: new Date() }
          });
          logger.log(`Rollback ${rollbackId} completed`);
          return { succeeded: true };
        }
        if (rollout?.rolloutState === "failed" || (!rollout && status.currentTaskDefinitionArn !== rollback.targetTaskDefinitionArn)) {
          throw await fail(
            rollout?.rolloutReason ??
              "The rollback revision never became healthy; ECS reverted to the previous revision."
          );
        }

        await sleep(POLL_MS, signal);
      }

      if (signal.aborted) {
        // Leave it "running": the job is re-queued after a restart and resumes watching.
        throw new Error("Worker shutting down while watching the rollout");
      }
      throw await fail("The rollout didn't finish within 15 minutes. Check the service in the AWS console.");
    } catch (error) {
      if (error instanceof NonRetryableJobError) throw error;
      if (signal.aborted) throw error;
      throw await fail(`Rollback failed: ${(error as Error).message}`);
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
