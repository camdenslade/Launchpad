import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Injectable } from "@nestjs/common";
import type { PrismaClient } from "@launchpad/database";
import { InjectDatabase } from "../../database.module.js";
import {
  errorSummary,
  InfrastructureContext,
  STACK
} from "../../terraform/infrastructure-context.service.js";
import { hasChanges, summarizePlan } from "../../terraform/plan-summary.js";
import { TerraformRunner } from "../../terraform/terraform-runner.service.js";
import { NonRetryableJobError, type JobContext, type JobHandler } from "../job-handler.js";

/**
 * "infrastructure.plan": computes what Terraform would change, saves the
 * exact plan in the customer's state bucket, and waits for a human.
 * Nothing in the cloud is modified by this job (besides creating the
 * state bucket on first use).
 */
@Injectable()
export class InfrastructurePlanHandler implements JobHandler {
  readonly type = "infrastructure.plan";

  constructor(
    @InjectDatabase() private readonly db: PrismaClient,
    private readonly context: InfrastructureContext,
    private readonly terraform: TerraformRunner
  ) {}

  async run(payload: unknown, { job, logger, signal }: JobContext) {
    const run = await this.context.loadRun(payload);
    // "planning" = a previous attempt was interrupted (worker crash); planning is safe to redo.
    if (run.status !== "queued" && run.status !== "planning") {
      logger.warn(`Run ${run.id} is ${run.status}; skipping plan`);
      return { skipped: run.status };
    }

    await this.context.update(run.id, { status: "planning", planJobId: job.id, error: null });

    let log = "";
    const workspace = await this.terraform.createWorkspace(run.id, STACK);

    try {
      const session = await this.context.openSession(run, "plan").catch(async (error: Error) => {
        throw await this.context.fail(run.id, `Could not access the cloud account: ${error.message}`, null, "planLog");
      });

      await session.bucket.ensure();
      await this.terraform.ensurePluginCache();
      await this.terraform.writeBackendConfig(workspace, {
        bucket: session.bucket.name,
        key: session.stateKey,
        region: run.environment.region
      });
      await this.terraform.writeVariables(workspace, this.context.stackVariables(run));

      const steps: [string, string[]][] = [
        ["init", ["init", "-input=false", "-no-color", "-backend-config=backend.hcl"]],
        [
          "plan",
          [
            "plan",
            "-input=false",
            "-no-color",
            "-lock-timeout=120s",
            // Teardown: plan the removal of everything in state. Applying it
            // still goes through the same approval as any other plan.
            ...(run.operation === "destroy" ? ["-destroy"] : []),
            "-out=tfplan"
          ]
        ]
      ];

      for (const [name, args] of steps) {
        const result = await this.terraform.run(workspace, args, session.credentialEnv, signal);
        log += `$ terraform ${name}\n${result.output}\n`;
        if (result.exitCode !== 0) {
          throw await this.context.fail(run.id, `terraform ${name} failed:\n${errorSummary(result.output)}`, log, "planLog");
        }
      }

      const shown = await this.terraform.run(workspace, ["show", "-json", "tfplan"], session.credentialEnv, signal);
      if (shown.exitCode !== 0) {
        throw await this.context.fail(run.id, `Could not read the plan:\n${errorSummary(shown.output)}`, log, "planLog");
      }
      const summary = summarizePlan(shown.stdout);

      // Save the exact plan (+ provider lock) so apply executes precisely
      // what was approved. Stored in the customer's bucket, encrypted.
      await session.bucket.putObject(`${session.planPrefix}/tfplan`, await readFile(join(workspace.stackDir, "tfplan")));
      await session.bucket.putObject(
        `${session.planPrefix}/terraform.lock.hcl`,
        await readFile(join(workspace.stackDir, ".terraform.lock.hcl"))
      );

      const changed = hasChanges(summary);
      await this.db.$transaction([
        // Only the newest plan for an environment can be approved.
        this.db.infrastructureRun.updateMany({
          where: { environmentId: run.environmentId, status: "planned", id: { not: run.id } },
          data: { status: "superseded", finishedAt: new Date() }
        }),
        this.db.infrastructureRun.update({
          where: { id: run.id },
          data: {
            status: changed ? "planned" : "no_changes",
            summary: { ...summary },
            planLog: log,
            ...(changed ? {} : { finishedAt: new Date() })
          }
        })
      ]);

      logger.log(`Plan for ${run.environment.slug}: +${summary.add} ~${summary.change} -${summary.destroy}`);
      return { add: summary.add, change: summary.change, destroy: summary.destroy };
    } catch (error) {
      // Anything unexpected (S3, network...) must still leave the run in a final state.
      if (error instanceof NonRetryableJobError) throw error;
      throw await this.context.fail(run.id, `Plan failed: ${(error as Error).message}`, log, "planLog");
    } finally {
      await this.terraform.removeWorkspace(workspace);
    }
  }
}
