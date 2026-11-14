import { Injectable } from "@nestjs/common";
import {
  assumeAwsRole,
  awsCredentialEnv,
  StateBucket,
  stateBucketName
} from "@launchpad/integrations";
import type {
  CloudAccount,
  Environment,
  InfrastructureRun,
  Prisma,
  PrismaClient
} from "@launchpad/database";
import { z } from "zod";
import { InjectDatabase } from "../database.module.js";
import { NonRetryableJobError } from "../jobs/job-handler.js";
import { tail } from "./terraform-runner.service.js";

export const RunPayloadSchema = z.object({ runId: z.uuid() }).strict();

/** The stack every environment provisions (infrastructure/terraform/stacks/<name>). */
export const STACK = "service";

export type RunWithEnvironment = InfrastructureRun & {
  environment: Environment & { cloudAccount: CloudAccount };
};

export interface CloudSession {
  credentialEnv: Record<string, string>;
  bucket: StateBucket;
  /** Terraform state object for this environment. */
  stateKey: string;
  /** Prefix for this run's saved plan artifacts. */
  planPrefix: string;
}

/** Loads runs and opens a cloud session for them. Shared by plan and apply. */
@Injectable()
export class InfrastructureContext {
  constructor(@InjectDatabase() private readonly db: PrismaClient) {}

  async loadRun(payload: unknown): Promise<RunWithEnvironment> {
    const parsed = RunPayloadSchema.safeParse(payload);
    if (!parsed.success) throw new NonRetryableJobError("Invalid payload: expected { runId }");

    const run = await this.db.infrastructureRun.findUnique({
      where: { id: parsed.data.runId },
      include: { environment: { include: { cloudAccount: true } } }
    });
    if (!run) throw new NonRetryableJobError(`Infrastructure run ${parsed.data.runId} not found`);
    return run;
  }

  async openSession(run: RunWithEnvironment, purpose: "plan" | "apply"): Promise<CloudSession> {
    const { environment } = run;
    const account = environment.cloudAccount;

    if (account.status !== "connected" || !account.roleArn || !account.accountId) {
      throw new NonRetryableJobError(
        `Cloud account "${account.name}" is not connected. Finish its setup on the Cloud page.`
      );
    }

    const credentials = await assumeAwsRole({
      roleArn: account.roleArn,
      externalId: account.externalId,
      region: environment.region,
      // Shows in the customer's CloudTrail as e.g. launchpad-plan-1a2b3c4d.
      sessionName: `launchpad-${purpose}-${run.id.slice(0, 8)}`
    });

    const bucket = new StateBucket(
      stateBucketName(account.accountId, environment.region),
      environment.region,
      credentials
    );

    return {
      credentialEnv: awsCredentialEnv(credentials, environment.region),
      bucket,
      stateKey: `environments/${environment.id}/terraform.tfstate`,
      planPrefix: `plans/${environment.id}/${run.id}`
    };
  }

  /** Variables Launchpad passes to every stack. */
  stackVariables(run: RunWithEnvironment): Record<string, string> {
    return {
      environment_slug: run.environment.slug,
      environment_kind: run.environment.kind,
      region: run.environment.region
    };
  }

  async update(runId: string, data: Prisma.InfrastructureRunUpdateInput): Promise<void> {
    await this.db.infrastructureRun.update({ where: { id: runId }, data });
  }

  /** Marks the run failed with a readable error, and returns the job error to throw. */
  async fail(runId: string, message: string, log: string | null, field: "planLog" | "applyLog") {
    await this.update(runId, {
      status: "failed",
      error: message,
      ...(log === null ? {} : { [field]: tail(log) }),
      finishedAt: new Date()
    });
    // Infrastructure failures are deterministic; never retry automatically.
    return new NonRetryableJobError(message);
  }
}

/** Last meaningful lines of Terraform output, for the run's error summary. */
export function errorSummary(output: string): string {
  const errorBlock = output.lastIndexOf("Error:");
  const text = errorBlock >= 0 ? output.slice(errorBlock) : output.slice(-1500);
  return text.trim().slice(0, 1500);
}
