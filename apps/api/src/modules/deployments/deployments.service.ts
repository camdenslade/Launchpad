import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import type {
  CurrentUser,
  Deployment as DeploymentDto,
  DeployWorkflow,
  DeploymentHistory,
  RollbackRequest as RollbackDto
} from "@launchpad/contracts";
import {
  enqueueJob,
  type CloudAccount,
  type Deployment,
  type Environment,
  type PrismaClient,
  type Project,
  type RollbackRequest
} from "@launchpad/database";
import { assumeAwsRole, EcsDeployments } from "@launchpad/integrations";
import { AuditService } from "../audit/audit.service.js";
import { InjectDatabase } from "../database/database.module.js";
import { renderDeployWorkflow, workflowPath } from "./workflow.js";

/** Terraform outputs a running service exposes (see stacks/service/outputs.tf). */
const SERVICE_OUTPUTS = ["ecs_cluster", "ecs_service", "task_definition_family", "container_name", "aws_region"] as const;
const WORKFLOW_OUTPUTS = [...SERVICE_OUTPUTS, "deploy_role_arn", "registry_url"] as const;

type ServiceOutputs = Record<(typeof WORKFLOW_OUTPUTS)[number], string>;

type EnvironmentWithContext = Environment & { project: Project; cloudAccount: CloudAccount };

/** An environment whose service exists, with everything needed to talk to it. */
interface ServiceTarget {
  env: EnvironmentWithContext;
  outputs: Partial<ServiceOutputs> & Pick<ServiceOutputs, (typeof SERVICE_OUTPUTS)[number]>;
}

type TargetResult = { ok: true; target: ServiceTarget } | { ok: false; reason: string; env: EnvironmentWithContext };

const rollbackInclude = {
  requestedBy: { select: { login: true } },
  approvedBy: { select: { login: true } }
} as const;

type RollbackRow = RollbackRequest & { requestedBy: { login: string } | null; approvedBy: { login: string } | null };

const ACTIVE_ROLLBACK: RollbackRequest["status"][] = ["pending_approval", "queued", "running"];

/**
 * Deployments of an environment's service:
 *  - the GitHub Actions workflow that deploys it,
 *  - deployment history, read live from the cloud (ECS task definition
 *    revisions + current rollout), so it's correct however a deploy happened,
 *  - rollbacks to an earlier revision, executed by the worker and subject to
 *    the environment's approval policy.
 */
@Injectable()
export class DeploymentsService {
  private readonly logger = new Logger(DeploymentsService.name);

  constructor(
    @InjectDatabase() private readonly db: PrismaClient,
    private readonly audit: AuditService
  ) {}

  // ---------------------------------------------------------------------------
  // Workflow
  // ---------------------------------------------------------------------------

  async getWorkflow(environmentId: string): Promise<DeployWorkflow> {
    const result = await this.resolveTarget(environmentId, WORKFLOW_OUTPUTS);
    const env = result.ok ? result.target.env : result.env;

    const repository = githubRepository(env.project.repositoryUrl);
    const branch = env.project.defaultBranch ?? "main";
    const trigger = env.kind === "production" ? "manual" : "push";
    const base = {
      path: workflowPath(env.name),
      githubEnvironment: env.name,
      githubRepository: repository,
      branch,
      trigger,
      environmentsSettingsUrl: repository ? `https://github.com/${repository}/settings/environments` : null
    } as const;
    const notReady = (reason: string): DeployWorkflow => ({ ...base, ready: false, reason, content: null, createFileUrl: null });

    if (!repository) return notReady("Deploys through GitHub Actions need the project's repository to be on GitHub.");
    if (!result.ok) return notReady(result.reason);

    const outputs = result.target.outputs as ServiceOutputs;
    const content = renderDeployWorkflow({
      projectName: env.project.name,
      environmentName: env.name,
      trigger,
      branch,
      region: outputs.aws_region,
      deployRoleArn: outputs.deploy_role_arn,
      registryUrl: outputs.registry_url,
      cluster: outputs.ecs_cluster,
      service: outputs.ecs_service,
      taskDefinitionFamily: outputs.task_definition_family,
      containerName: outputs.container_name
    });

    // GitHub's "new file" page accepts the filename and contents as query params.
    const createFileUrl =
      `https://github.com/${repository}/new/${encodeURIComponent(branch)}?` +
      new URLSearchParams({ filename: base.path, value: content }).toString();

    return { ...base, ready: true, reason: null, content, createFileUrl };
  }

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  /** Reads the service's revisions and rollout state from the cloud, caches them, and returns them. */
  async history(environmentId: string): Promise<DeploymentHistory> {
    const result = await this.resolveTarget(environmentId, SERVICE_OUTPUTS);
    const rollbacks = (await this.recentRollbacks(environmentId)).map(toRollbackDto);
    if (!result.ok) return { ready: false, reason: result.reason, deployments: [], rollingOut: false, rollbacks };

    const { env, outputs } = result.target;
    const ecs = await this.ecs(env, outputs.aws_region, "history");

    const [arns, status] = await Promise.all([
      ecs.listRevisionArns(outputs.task_definition_family),
      ecs.serviceStatus(outputs.ecs_cluster, outputs.ecs_service)
    ]);

    // Describe only revisions we haven't cached yet (task definitions are immutable).
    const known = new Set(
      (await this.db.deployment.findMany({ where: { environmentId }, select: { taskDefinitionArn: true } })).map(
        (d) => d.taskDefinitionArn
      )
    );
    const toDescribe = [...new Set([...arns, ...status.deployments.map((d) => d.taskDefinitionArn)])].filter(
      (arn) => arn && !known.has(arn)
    );
    for (const arn of toDescribe) {
      const revision = await ecs.describeRevision(arn, outputs.container_name);
      await this.db.deployment.upsert({
        where: { environmentId_taskDefinitionArn: { environmentId, taskDefinitionArn: revision.arn } },
        create: {
          environmentId,
          taskDefinitionArn: revision.arn,
          revision: revision.revision,
          image: revision.image,
          commitSha: revision.commitSha,
          registeredAt: revision.registeredAt,
          registeredBy: revision.registeredBy
        },
        update: {}
      });
    }

    // Remember rollout outcomes while ECS still reports them.
    for (const deployment of status.deployments) {
      await this.db.deployment.updateMany({
        where: { environmentId, taskDefinitionArn: deployment.taskDefinitionArn },
        data: { state: deployment.rolloutState, stateReason: deployment.rolloutReason }
      });
    }

    const rows = await this.db.deployment.findMany({
      where: { environmentId },
      orderBy: { revision: "desc" },
      take: 25
    });
    const repository = githubRepository(env.project.repositoryUrl);

    return {
      ready: true,
      reason: null,
      deployments: rows.map((row) => toDeploymentDto(row, status.currentTaskDefinitionArn, repository)),
      rollingOut: status.deployments.some((d) => d.rolloutState === "in_progress"),
      rollbacks
    };
  }

  // ---------------------------------------------------------------------------
  // Rollbacks
  // ---------------------------------------------------------------------------

  async requestRollback(user: CurrentUser, environmentId: string, revision: number): Promise<RollbackDto> {
    const result = await this.resolveTarget(environmentId, SERVICE_OUTPUTS);
    if (!result.ok) throw new BadRequestException(result.reason);
    const { env, outputs } = result.target;

    const target = await this.db.deployment.findFirst({ where: { environmentId, revision } });
    if (!target) throw new NotFoundException(`Revision ${revision} isn't in this environment's history.`);

    const status = await (await this.ecs(env, outputs.aws_region, "rollback-check")).serviceStatus(
      outputs.ecs_cluster,
      outputs.ecs_service
    );
    if (status.currentTaskDefinitionArn === target.taskDefinitionArn) {
      throw new ConflictException(`Revision ${revision} is already the current deployment.`);
    }
    const current = await this.db.deployment.findFirst({
      where: { environmentId, taskDefinitionArn: status.currentTaskDefinitionArn ?? "" }
    });

    // Rollbacks are deployments, so they follow the environment's approval policy.
    const needsApproval = env.approvalPolicy === "different_member";

    const rollback = await this.db.$transaction(async (tx) => {
      const active = await tx.rollbackRequest.findFirst({ where: { environmentId, status: { in: ACTIVE_ROLLBACK } } });
      if (active) throw new ConflictException(`A rollback is already ${active.status.replace("_", " ")} for this environment.`);

      const created = await tx.rollbackRequest.create({
        data: {
          environmentId,
          targetTaskDefinitionArn: target.taskDefinitionArn,
          targetRevision: target.revision,
          fromRevision: current?.revision ?? null,
          status: needsApproval ? "pending_approval" : "queued",
          requestedById: user.id
        }
      });
      if (!needsApproval) await this.enqueueRollback(tx, created.id);
      return tx.rollbackRequest.findUniqueOrThrow({ where: { id: created.id }, include: rollbackInclude });
    });

    await this.audit.record({
      actorId: user.id,
      action: "deployment.rollback_requested",
      targetType: "environment",
      targetId: environmentId,
      metadata: { rollbackId: rollback.id, from: rollback.fromRevision, to: rollback.targetRevision, needsApproval }
    });
    return toRollbackDto(rollback);
  }

  async approveRollback(user: CurrentUser, rollbackId: string): Promise<RollbackDto> {
    const rollback = await this.findRollback(rollbackId);
    if (rollback.status !== "pending_approval") {
      throw new ConflictException(`Only a rollback awaiting approval can be approved (this one is ${rollback.status}).`);
    }
    if (rollback.requestedById === user.id) {
      throw new ForbiddenException("This environment requires a different person to approve the rollback.");
    }

    const approved = await this.db.$transaction(async (tx) => {
      const { count } = await tx.rollbackRequest.updateMany({
        where: { id: rollbackId, status: "pending_approval" },
        data: { status: "queued", approvedById: user.id }
      });
      if (count === 0) throw new ConflictException("This rollback was already decided.");
      await this.enqueueRollback(tx, rollbackId);
      return tx.rollbackRequest.findUniqueOrThrow({ where: { id: rollbackId }, include: rollbackInclude });
    });

    await this.audit.record({
      actorId: user.id,
      action: "deployment.rollback_approved",
      targetType: "environment",
      targetId: approved.environmentId,
      metadata: { rollbackId, to: approved.targetRevision }
    });
    return toRollbackDto(approved);
  }

  async rejectRollback(user: CurrentUser, rollbackId: string): Promise<RollbackDto> {
    const rollback = await this.findRollback(rollbackId);
    const { count } = await this.db.rollbackRequest.updateMany({
      where: { id: rollbackId, status: "pending_approval" },
      data: { status: "rejected", finishedAt: new Date() }
    });
    if (count === 0) throw new ConflictException(`Only a rollback awaiting approval can be rejected (this one is ${rollback.status}).`);

    await this.audit.record({
      actorId: user.id,
      action: "deployment.rollback_rejected",
      targetType: "environment",
      targetId: rollback.environmentId,
      metadata: { rollbackId }
    });
    return toRollbackDto(await this.findRollback(rollbackId));
  }

  async getRollback(rollbackId: string): Promise<RollbackDto> {
    return toRollbackDto(await this.findRollback(rollbackId));
  }

  // ---------------------------------------------------------------------------

  private async enqueueRollback(tx: Pick<PrismaClient, "job" | "rollbackRequest">, rollbackId: string) {
    // Changing what runs in production is never retried automatically.
    const job = await enqueueJob(tx, { type: "deployments.rollback", payload: { rollbackId }, maxAttempts: 1 });
    await tx.rollbackRequest.update({ where: { id: rollbackId }, data: { jobId: job.id } });
  }

  private async recentRollbacks(environmentId: string): Promise<RollbackRow[]> {
    return this.db.rollbackRequest.findMany({
      where: { environmentId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: rollbackInclude
    });
  }

  private async findRollback(id: string): Promise<RollbackRow> {
    const rollback = await this.db.rollbackRequest.findUnique({ where: { id }, include: rollbackInclude });
    if (!rollback) throw new NotFoundException(`Rollback ${id} not found`);
    return rollback;
  }

  /** Finds the environment and, if its service has been applied, the outputs needed to reach it. */
  private async resolveTarget(environmentId: string, required: readonly string[]): Promise<TargetResult> {
    const env = await this.db.environment.findUnique({
      where: { id: environmentId },
      include: { project: true, cloudAccount: true }
    });
    if (!env) throw new NotFoundException(`Environment ${environmentId} not found`);

    const lastApplied = await this.db.infrastructureRun.findFirst({
      where: { environmentId, status: "applied" },
      orderBy: { createdAt: "desc" }
    });
    const enableHint = "Turn on the service for this environment, then plan and apply its infrastructure.";
    if (!lastApplied || lastApplied.operation === "destroy") return { ok: false, reason: enableHint, env };

    const outputs = (lastApplied.outputs ?? {}) as Record<string, unknown>;
    const missing = required.filter((key) => typeof outputs[key] !== "string" || outputs[key] === "");
    if (missing.length > 0) {
      const serviceMissing = missing.includes("ecs_service");
      return {
        ok: false,
        env,
        reason: serviceMissing
          ? enableHint
          : `The last apply is missing outputs (${missing.join(", ")}). Plan and apply again, and update the AWS access role to the latest template if asked.`
      };
    }
    return { ok: true, target: { env, outputs: outputs as ServiceTarget["outputs"] } };
  }

  private async ecs(env: EnvironmentWithContext, region: string, purpose: string): Promise<EcsDeployments> {
    const account = env.cloudAccount;
    if (account.status !== "connected" || !account.roleArn) {
      throw new BadRequestException(`Cloud account "${account.name}" isn't connected.`);
    }
    try {
      const credentials = await assumeAwsRole({
        roleArn: account.roleArn,
        externalId: account.externalId,
        region,
        sessionName: `launchpad-${purpose}-${env.id.slice(0, 8)}`,
        durationSeconds: 900
      });
      return new EcsDeployments(region, credentials);
    } catch (error) {
      this.logger.warn(`Could not access ${account.name}: ${(error as Error).message}`);
      throw new BadRequestException(`Could not access the cloud account: ${(error as Error).message}`);
    }
  }
}

function toDeploymentDto(row: Deployment, currentArn: string | null, repository: string | null): DeploymentDto {
  return {
    id: row.id,
    revision: row.revision,
    image: row.image,
    commitSha: row.commitSha,
    commitUrl: row.commitSha && repository ? `https://github.com/${repository}/commit/${row.commitSha}` : null,
    registeredAt: row.registeredAt?.toISOString() ?? null,
    registeredBy: describePrincipal(row.registeredBy),
    state: row.state,
    stateReason: row.stateReason,
    current: row.taskDefinitionArn === currentArn
  };
}

function toRollbackDto(row: RollbackRow): RollbackDto {
  return {
    id: row.id,
    environmentId: row.environmentId,
    targetRevision: row.targetRevision,
    fromRevision: row.fromRevision,
    status: row.status,
    error: row.error,
    requestedBy: row.requestedBy?.login ?? null,
    approvedBy: row.approvedBy?.login ?? null,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null
  };
}

/**
 * ECS reports who registered a revision as an ARN. Make the common cases
 * readable: GitHub Actions deploys, Launchpad itself, Terraform.
 */
export function describePrincipal(arn: string | null): string | null {
  if (!arn) return null;
  const role = /:assumed-role\/([^/]+)\//.exec(arn)?.[1] ?? /:role\/(.+)$/.exec(arn)?.[1];
  if (role?.endsWith("-deploy")) return `GitHub Actions (${role})`;
  if (role === "LaunchpadAccess") return "Launchpad";
  return role ?? arn.split(":").pop() ?? arn;
}

/** "https://github.com/acme/api(.git)" -> "acme/api"; null for other hosts. */
export function githubRepository(url: string): string | null {
  try {
    const { hostname, pathname } = new URL(url);
    if (hostname !== "github.com" && hostname !== "www.github.com") return null;
    const match = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(\.git)?\/?$/.exec(pathname);
    return match ? `${match[1]}/${match[2]}` : null;
  } catch {
    return null;
  }
}
