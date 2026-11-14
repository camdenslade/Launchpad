import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  ServiceSettingsSchema,
  type CreateEnvironment,
  type CurrentUser,
  type Environment as EnvironmentDto,
  type InfrastructureOperation,
  type InfrastructureRun as RunDto,
  type InfrastructureRunDetail,
  type PlanSummary,
  type ServiceSettings,
  type UpdateEnvironment
} from "@launchpad/contracts";
import {
  enqueueJob,
  Prisma,
  type CloudAccount,
  type Environment,
  type InfrastructureRun,
  type PrismaClient
} from "@launchpad/database";
import { AuditService } from "../audit/audit.service.js";
import { InjectDatabase } from "../database/database.module.js";

const runInclude = {
  requestedBy: { select: { login: true } },
  approvedBy: { select: { login: true } }
} satisfies Prisma.InfrastructureRunInclude;

type RunRow = InfrastructureRun & {
  requestedBy: { login: string } | null;
  approvedBy: { login: string } | null;
};

/** Run states in which a new plan must not start. */
const BUSY: InfrastructureRun["status"][] = ["queued", "planning", "approved", "applying"];

/**
 * Environments and their infrastructure lifecycle:
 *   plan (worker) -> human approves/rejects -> apply (worker)
 * The API only records decisions and enqueues jobs; Terraform never runs
 * inside an HTTP request.
 */
@Injectable()
export class EnvironmentsService {
  constructor(
    @InjectDatabase() private readonly db: PrismaClient,
    private readonly audit: AuditService
  ) {}

  async list(projectId: string): Promise<EnvironmentDto[]> {
    const environments = await this.db.environment.findMany({
      where: { projectId },
      include: {
        cloudAccount: true,
        runs: { orderBy: { createdAt: "desc" }, take: 1, include: runInclude }
      },
      orderBy: { createdAt: "asc" }
    });
    const provisioned = await this.provisionedIds(environments.map((e) => e.id));
    return environments.map((env) => toEnvironmentDto(env, env.runs[0] ?? null, provisioned.has(env.id)));
  }

  /**
   * An environment has live infrastructure when its most recent *applied*
   * run created/updated it (rather than tearing it down).
   */
  private async provisionedIds(environmentIds: string[]): Promise<Set<string>> {
    if (environmentIds.length === 0) return new Set();
    const lastApplied = await this.db.infrastructureRun.findMany({
      where: { environmentId: { in: environmentIds }, status: "applied" },
      orderBy: { createdAt: "desc" },
      distinct: ["environmentId"],
      select: { environmentId: true, operation: true }
    });
    return new Set(lastApplied.filter((r) => r.operation === "apply").map((r) => r.environmentId));
  }

  private async isProvisioned(environmentId: string): Promise<boolean> {
    return (await this.provisionedIds([environmentId])).has(environmentId);
  }

  async create(user: CurrentUser, projectId: string, input: CreateEnvironment): Promise<EnvironmentDto> {
    const project = await this.db.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const account = await this.db.cloudAccount.findUnique({ where: { id: input.cloudAccountId } });
    if (!account) throw new NotFoundException("Cloud account not found");
    if (account.status !== "connected") {
      throw new BadRequestException(`Cloud account "${account.name}" isn't connected yet. Finish its setup first.`);
    }

    try {
      const env = await this.db.environment.create({
        data: {
          projectId,
          name: input.name,
          kind: input.kind,
          slug: await this.uniqueSlug(`${slugify(project.name)}-${input.name}`),
          cloudAccountId: account.id,
          region: input.region ?? account.region,
          // Four-eyes by default for production.
          approvalPolicy: input.approvalPolicy ?? (input.kind === "production" ? "different_member" : "any_member")
        },
        include: { cloudAccount: true }
      });

      await this.audit.record({
        actorId: user.id,
        action: "environment.created",
        targetType: "environment",
        targetId: env.id,
        metadata: { projectId, name: env.name, kind: env.kind, slug: env.slug, cloudAccountId: account.id }
      });

      return toEnvironmentDto(env, null, false);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(`This project already has an environment named "${input.name}".`);
      }
      throw error;
    }
  }

  async update(user: CurrentUser, id: string, input: UpdateEnvironment): Promise<EnvironmentDto> {
    const before = await this.findEnvironment(id);
    const env = await this.db.environment.update({
      where: { id },
      data: {
        ...(input.approvalPolicy ? { approvalPolicy: input.approvalPolicy } : {}),
        ...(input.serviceSettings ? { serviceSettings: { ...input.serviceSettings } } : {})
      },
      include: { cloudAccount: true, runs: { orderBy: { createdAt: "desc" }, take: 1, include: runInclude } }
    });

    if (input.approvalPolicy && before.approvalPolicy !== env.approvalPolicy) {
      await this.audit.record({
        actorId: user.id,
        action: "environment.approval_policy_changed",
        targetType: "environment",
        targetId: id,
        metadata: { from: before.approvalPolicy, to: env.approvalPolicy }
      });
    }
    if (input.serviceSettings) {
      // Settings only take effect through plan -> approve -> apply, but who
      // changed what is still worth recording.
      await this.audit.record({
        actorId: user.id,
        action: "environment.service_settings_changed",
        targetType: "environment",
        targetId: id,
        metadata: { from: readServiceSettings(before.serviceSettings), to: input.serviceSettings }
      });
    }
    return toEnvironmentDto(env, env.runs[0] ?? null, await this.isProvisioned(id));
  }

  async remove(user: CurrentUser, id: string): Promise<void> {
    const env = await this.findEnvironment(id);
    if (await this.isProvisioned(id)) {
      throw new ConflictException(
        "This environment still has infrastructure in your cloud account. Tear it down first, then delete it."
      );
    }
    const busy = await this.db.infrastructureRun.findFirst({ where: { environmentId: id, status: { in: BUSY } } });
    if (busy) throw new ConflictException(`A ${busy.status} run is in progress; wait for it to finish.`);
    await this.db.environment.delete({ where: { id } });
    await this.audit.record({
      actorId: user.id,
      action: "environment.deleted",
      targetType: "environment",
      targetId: id,
      metadata: { name: env.name, slug: env.slug }
    });
  }

  async listRuns(environmentId: string): Promise<RunDto[]> {
    await this.findEnvironment(environmentId);
    const runs = await this.db.infrastructureRun.findMany({
      where: { environmentId },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: runInclude
    });
    return runs.map(toRunDto);
  }

  async getRun(id: string): Promise<InfrastructureRunDetail> {
    const run = await this.findRun(id);
    return { ...toRunDto(run), planLog: run.planLog, applyLog: run.applyLog };
  }

  /**
   * Starts a plan (or a teardown plan with operation "destroy"). Fails if the
   * environment already has work in flight.
   */
  async plan(user: CurrentUser, environmentId: string, operation: InfrastructureOperation): Promise<RunDto> {
    const env = await this.findEnvironment(environmentId);
    if (operation === "destroy" && !(await this.isProvisioned(environmentId))) {
      throw new ConflictException("There is no infrastructure to tear down for this environment.");
    }

    const run = await this.db.$transaction(async (tx) => {
      const busy = await tx.infrastructureRun.findFirst({
        where: { environmentId, status: { in: BUSY } }
      });
      if (busy) {
        throw new ConflictException(`A ${busy.status} run is already in progress for this environment.`);
      }

      const created = await tx.infrastructureRun.create({
        data: { environmentId, operation, requestedById: user.id },
        include: runInclude
      });
      // Plans are safe to retry (they change nothing), so allow one retry.
      const job = await enqueueJob(tx, { type: "infrastructure.plan", payload: { runId: created.id }, maxAttempts: 2 });
      return tx.infrastructureRun.update({ where: { id: created.id }, data: { planJobId: job.id }, include: runInclude });
    });

    await this.audit.record({
      actorId: user.id,
      action: operation === "destroy" ? "infrastructure.teardown_requested" : "infrastructure.plan_requested",
      targetType: "environment",
      targetId: env.id,
      metadata: { runId: run.id, operation }
    });
    return toRunDto(run);
  }

  /** Approves a plan and enqueues the apply. Enforces the environment's policy. */
  async approve(user: CurrentUser, runId: string): Promise<RunDto> {
    const run = await this.findRun(runId);
    const env = await this.findEnvironment(run.environmentId);

    if (run.status !== "planned") {
      throw new ConflictException(`Only a planned run can be approved (this one is ${run.status}).`);
    }
    if (env.approvalPolicy === "different_member" && run.requestedById === user.id) {
      throw new ForbiddenException(
        `${env.name} requires approval from someone other than the person who requested the plan.`
      );
    }

    const approved = await this.db.$transaction(async (tx) => {
      // Conditional update: two people clicking Approve can't both win.
      const { count } = await tx.infrastructureRun.updateMany({
        where: { id: runId, status: "planned" },
        data: { status: "approved", approvedById: user.id, approvedAt: new Date() }
      });
      if (count === 0) throw new ConflictException("This plan was already approved, rejected or replaced.");

      // Applies are never retried automatically.
      const job = await enqueueJob(tx, { type: "infrastructure.apply", payload: { runId }, maxAttempts: 1 });
      return tx.infrastructureRun.update({ where: { id: runId }, data: { applyJobId: job.id }, include: runInclude });
    });

    await this.audit.record({
      actorId: user.id,
      action: run.operation === "destroy" ? "infrastructure.teardown_approved" : "infrastructure.plan_approved",
      targetType: "environment",
      targetId: env.id,
      metadata: { runId, operation: run.operation, summary: summaryCounts(run.summary) }
    });
    return toRunDto(approved);
  }

  async reject(user: CurrentUser, runId: string): Promise<RunDto> {
    const run = await this.findRun(runId);
    const { count } = await this.db.infrastructureRun.updateMany({
      where: { id: runId, status: "planned" },
      data: { status: "rejected", finishedAt: new Date() }
    });
    if (count === 0) throw new ConflictException(`Only a planned run can be rejected (this one is ${run.status}).`);

    await this.audit.record({
      actorId: user.id,
      action: "infrastructure.plan_rejected",
      targetType: "environment",
      targetId: run.environmentId,
      metadata: { runId }
    });
    return toRunDto(await this.findRun(runId));
  }

  private async findEnvironment(id: string): Promise<Environment> {
    const env = await this.db.environment.findUnique({ where: { id } });
    if (!env) throw new NotFoundException(`Environment ${id} not found`);
    return env;
  }

  private async findRun(id: string): Promise<RunRow> {
    const run = await this.db.infrastructureRun.findUnique({ where: { id }, include: runInclude });
    if (!run) throw new NotFoundException(`Infrastructure run ${id} not found`);
    return run;
  }

  /** Slugs are permanent resource-name prefixes, so they must be unique. */
  private async uniqueSlug(base: string): Promise<string> {
    const root = base.slice(0, 40).replace(/-+$/, "");
    for (let n = 1; n < 100; n++) {
      const candidate = n === 1 ? root : `${root}-${n}`;
      if (!(await this.db.environment.findUnique({ where: { slug: candidate } }))) return candidate;
    }
    throw new ConflictException("Could not generate a unique environment name");
  }
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "project"
  );
}

/** Stored settings with defaults filled in (older rows hold `{}`). */
function readServiceSettings(stored: unknown): ServiceSettings {
  const parsed = ServiceSettingsSchema.safeParse(stored ?? {});
  return parsed.success ? parsed.data : ServiceSettingsSchema.parse({});
}

function summaryCounts(summary: unknown) {
  const s = summary as PlanSummary | null;
  return s ? { add: s.add, change: s.change, destroy: s.destroy } : null;
}

function toRunDto(run: RunRow): RunDto {
  return {
    id: run.id,
    environmentId: run.environmentId,
    operation: run.operation,
    status: run.status,
    summary: (run.summary as PlanSummary | null) ?? null,
    outputs: (run.outputs as Record<string, unknown> | null) ?? null,
    error: run.error,
    requestedBy: run.requestedBy?.login ?? null,
    approvedBy: run.approvedBy?.login ?? null,
    approvedAt: run.approvedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null
  };
}

function toEnvironmentDto(
  env: Environment & { cloudAccount: CloudAccount },
  latestRun: RunRow | null,
  provisioned: boolean
): EnvironmentDto {
  return {
    id: env.id,
    projectId: env.projectId,
    name: env.name,
    kind: env.kind,
    slug: env.slug,
    region: env.region,
    approvalPolicy: env.approvalPolicy,
    cloudAccount: {
      id: env.cloudAccount.id,
      name: env.cloudAccount.name,
      provider: env.cloudAccount.provider,
      accountId: env.cloudAccount.accountId
    },
    provisioned,
    serviceSettings: readServiceSettings(env.serviceSettings),
    latestRun: latestRun ? toRunDto(latestRun) : null,
    createdAt: env.createdAt.toISOString()
  };
}
