import {
  DescribeServicesCommand,
  DescribeTaskDefinitionCommand,
  ECSClient,
  ListTaskDefinitionsCommand,
  UpdateServiceCommand
} from "@aws-sdk/client-ecs";
import type { AwsSessionCredentials } from "./credentials.js";

/** One task definition revision = one thing that was (or can be) deployed. */
export interface TaskDefinitionRevision {
  arn: string;
  revision: number;
  /** Image of the deployable container. */
  image: string | null;
  /** Commit SHA when the image tag is one (Launchpad's workflow tags images with github.sha). */
  commitSha: string | null;
  registeredAt: Date | null;
  /** Who registered it, e.g. the GitHub Actions deploy role session. */
  registeredBy: string | null;
}

export type RolloutState = "in_progress" | "completed" | "failed";

/** An ECS deployment currently attached to the service. */
export interface ServiceDeployment {
  id: string;
  taskDefinitionArn: string;
  /** PRIMARY = the target the service is rolling to (or running). */
  primary: boolean;
  rolloutState: RolloutState;
  rolloutReason: string | null;
  runningCount: number;
  desiredCount: number;
  createdAt: Date | null;
}

export interface ServiceStatus {
  deployments: ServiceDeployment[];
  /** Task definition the service considers current (its PRIMARY deployment). */
  currentTaskDefinitionArn: string | null;
}

/**
 * The few ECS calls deployments need, behind a small facade so business
 * logic doesn't depend on the AWS SDK (and other providers can follow).
 */
export class EcsDeployments {
  private readonly ecs: ECSClient;

  constructor(region: string, credentials: AwsSessionCredentials) {
    this.ecs = new ECSClient({ region, credentials });
  }

  /** Newest first. */
  async listRevisionArns(family: string, max = 25): Promise<string[]> {
    const result = await this.ecs.send(
      new ListTaskDefinitionsCommand({ familyPrefix: family, sort: "DESC", maxResults: max, status: "ACTIVE" })
    );
    return result.taskDefinitionArns ?? [];
  }

  async describeRevision(arn: string, containerName: string): Promise<TaskDefinitionRevision> {
    const { taskDefinition } = await this.ecs.send(new DescribeTaskDefinitionCommand({ taskDefinition: arn }));
    if (!taskDefinition?.taskDefinitionArn) throw new Error(`Task definition ${arn} not found`);

    const container =
      taskDefinition.containerDefinitions?.find((c) => c.name === containerName) ??
      taskDefinition.containerDefinitions?.[0];
    const image = container?.image ?? null;

    return {
      arn: taskDefinition.taskDefinitionArn,
      revision: taskDefinition.revision ?? 0,
      image,
      commitSha: commitShaFromImage(image),
      registeredAt: taskDefinition.registeredAt ?? null,
      registeredBy: taskDefinition.registeredBy ?? null
    };
  }

  async serviceStatus(cluster: string, service: string): Promise<ServiceStatus> {
    const { services } = await this.ecs.send(new DescribeServicesCommand({ cluster, services: [service] }));
    const svc = services?.[0];
    if (!svc) throw new Error(`ECS service ${service} not found in ${cluster}`);

    const deployments: ServiceDeployment[] = (svc.deployments ?? []).map((d) => ({
      id: d.id ?? "",
      taskDefinitionArn: d.taskDefinition ?? "",
      primary: d.status === "PRIMARY",
      rolloutState: toRolloutState(d.rolloutState),
      rolloutReason: d.rolloutStateReason ?? null,
      runningCount: d.runningCount ?? 0,
      desiredCount: d.desiredCount ?? 0,
      createdAt: d.createdAt ?? null
    }));

    return {
      deployments,
      currentTaskDefinitionArn: deployments.find((d) => d.primary)?.taskDefinitionArn ?? svc.taskDefinition ?? null
    };
  }

  /** Rolls the service to a task definition (deploy or rollback). Returns the new ECS deployment id. */
  async rollTo(cluster: string, service: string, taskDefinitionArn: string): Promise<string | null> {
    const { service: updated } = await this.ecs.send(
      new UpdateServiceCommand({ cluster, service, taskDefinition: taskDefinitionArn })
    );
    return updated?.deployments?.find((d) => d.status === "PRIMARY")?.id ?? null;
  }
}

/** "repo:abc123...(40 hex)" -> the SHA; null for tags like "latest". */
export function commitShaFromImage(image: string | null): string | null {
  if (!image) return null;
  const tag = image.includes("@") ? null : image.slice(image.lastIndexOf(":") + 1);
  return tag && /^[0-9a-f]{40}$/i.test(tag) ? tag.toLowerCase() : null;
}

function toRolloutState(state: string | undefined): RolloutState {
  if (state === "COMPLETED") return "completed";
  if (state === "FAILED") return "failed";
  return "in_progress";
}
