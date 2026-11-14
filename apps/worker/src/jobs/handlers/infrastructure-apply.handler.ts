import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Injectable } from "@nestjs/common";
import {
  errorSummary,
  InfrastructureContext,
  STACK
} from "../../terraform/infrastructure-context.service.js";
import { TerraformRunner } from "../../terraform/terraform-runner.service.js";
import { NonRetryableJobError, type JobContext, type JobHandler } from "../job-handler.js";

/**
 * "infrastructure.apply": executes a plan a human approved, exactly as
 * planned. Terraform refuses a saved plan if the infrastructure changed
 * since it was made ("stale plan"), so nothing unreviewed can slip in.
 * Enqueued with maxAttempts = 1: applies are never retried automatically.
 */
@Injectable()
export class InfrastructureApplyHandler implements JobHandler {
  readonly type = "infrastructure.apply";

  constructor(
    private readonly context: InfrastructureContext,
    private readonly terraform: TerraformRunner
  ) {}

  async run(payload: unknown, { job, logger, signal }: JobContext) {
    const run = await this.context.loadRun(payload);
    if (run.status === "applying") {
      // A previous attempt was interrupted mid-apply. Re-running blindly is
      // unsafe; a fresh plan will show exactly what state things are in.
      throw await this.context.fail(
        run.id,
        "The worker stopped while applying. Some changes may have been made. Create a new plan to see the current state.",
        null,
        "applyLog"
      );
    }
    if (run.status !== "approved") {
      logger.warn(`Run ${run.id} is ${run.status}, not approved; refusing to apply`);
      return { skipped: run.status };
    }

    await this.context.update(run.id, { status: "applying", applyJobId: job.id });

    let log = "";
    const workspace = await this.terraform.createWorkspace(run.id, STACK);

    try {
      const session = await this.context.openSession(run, "apply").catch(async (error: Error) => {
        throw await this.context.fail(run.id, `Could not access the cloud account: ${error.message}`, null, "applyLog");
      });

      // Restore the approved plan and the provider lock it was made with.
      await writeFile(join(workspace.stackDir, "tfplan"), await session.bucket.getObject(`${session.planPrefix}/tfplan`));
      await writeFile(
        join(workspace.stackDir, ".terraform.lock.hcl"),
        await session.bucket.getObject(`${session.planPrefix}/terraform.lock.hcl`)
      );

      await this.terraform.ensurePluginCache();
      await this.terraform.writeBackendConfig(workspace, {
        bucket: session.bucket.name,
        key: session.stateKey,
        region: run.environment.region
      });

      const init = await this.terraform.run(
        workspace,
        ["init", "-input=false", "-no-color", "-backend-config=backend.hcl", "-lockfile=readonly"],
        session.credentialEnv,
        signal
      );
      log += `$ terraform init\n${init.output}\n`;
      if (init.exitCode !== 0) {
        throw await this.context.fail(run.id, `terraform init failed:\n${errorSummary(init.output)}`, log, "applyLog");
      }

      const apply = await this.terraform.run(
        workspace,
        ["apply", "-input=false", "-no-color", "-lock-timeout=120s", "tfplan"],
        session.credentialEnv,
        signal
      );
      log += `$ terraform apply\n${apply.output}\n`;
      if (apply.exitCode !== 0) {
        const stale = /saved plan is stale/i.test(apply.output);
        const message = stale
          ? "The infrastructure changed after this plan was made, so it was not applied. Create a new plan and review it."
          : `terraform apply failed:\n${errorSummary(apply.output)}`;
        throw await this.context.fail(run.id, message, log, "applyLog");
      }

      const outputs = await this.terraform.run(workspace, ["output", "-json", "-no-color"], session.credentialEnv, signal);
      await this.context.update(run.id, {
        status: "applied",
        applyLog: log,
        outputs: outputs.exitCode === 0 ? publicOutputs(outputs.stdout) : {},
        finishedAt: new Date()
      });

      logger.log(`Applied run ${run.id} to ${run.environment.slug}`);
      return { applied: true };
    } catch (error) {
      if (error instanceof NonRetryableJobError) throw error;
      throw await this.context.fail(run.id, `Apply failed: ${(error as Error).message}`, log, "applyLog");
    } finally {
      await this.terraform.removeWorkspace(workspace);
    }
  }
}

/** `terraform output -json` -> { name: value }, dropping sensitive outputs. */
function publicOutputs(json: string): Record<string, string | number | boolean | object> {
  const parsed = JSON.parse(json) as Record<string, { value: unknown; sensitive: boolean }>;
  const result: Record<string, string | number | boolean | object> = {};
  for (const [name, output] of Object.entries(parsed)) {
    if (!output.sensitive && output.value !== null && output.value !== undefined) {
      result[name] = output.value as string | number | boolean | object;
    }
  }
  return result;
}
