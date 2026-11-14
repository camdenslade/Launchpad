import { Injectable, NotFoundException } from "@nestjs/common";
import type { DeployWorkflow } from "@launchpad/contracts";
import type { PrismaClient } from "@launchpad/database";
import { InjectDatabase } from "../database/database.module.js";
import { renderDeployWorkflow, workflowPath } from "./workflow.js";

/** Terraform outputs the workflow needs (see stacks/service/outputs.tf). */
const REQUIRED_OUTPUTS = [
  "deploy_role_arn",
  "registry_url",
  "ecs_cluster",
  "ecs_service",
  "task_definition_family",
  "container_name",
  "aws_region"
] as const;

@Injectable()
export class DeploymentsService {
  constructor(@InjectDatabase() private readonly db: PrismaClient) {}

  async getWorkflow(environmentId: string): Promise<DeployWorkflow> {
    const env = await this.db.environment.findUnique({
      where: { id: environmentId },
      include: { project: true }
    });
    if (!env) throw new NotFoundException(`Environment ${environmentId} not found`);

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

    const notReady = (reason: string): DeployWorkflow => ({
      ...base,
      ready: false,
      reason,
      content: null,
      createFileUrl: null
    });

    if (!repository) {
      return notReady("Deploys through GitHub Actions need the project's repository to be on GitHub.");
    }

    // The latest successful apply (not a teardown) holds the current outputs.
    const lastApplied = await this.db.infrastructureRun.findFirst({
      where: { environmentId, status: "applied" },
      orderBy: { createdAt: "desc" }
    });
    if (!lastApplied || lastApplied.operation === "destroy") {
      return notReady("Turn on the service for this environment, then plan and apply its infrastructure.");
    }

    const outputs = (lastApplied.outputs ?? {}) as Record<string, unknown>;
    const missing = REQUIRED_OUTPUTS.filter((key) => typeof outputs[key] !== "string" || outputs[key] === "");
    if (missing.length > 0) {
      return notReady(
        missing.includes("deploy_role_arn") && missing.includes("ecs_service")
          ? "Turn on the service for this environment, then plan and apply its infrastructure."
          : `The last apply is missing outputs (${missing.join(", ")}). Plan and apply again, and update the AWS access role to the latest template if asked.`
      );
    }

    const content = renderDeployWorkflow({
      projectName: env.project.name,
      environmentName: env.name,
      trigger,
      branch,
      region: outputs["aws_region"] as string,
      deployRoleArn: outputs["deploy_role_arn"] as string,
      registryUrl: outputs["registry_url"] as string,
      cluster: outputs["ecs_cluster"] as string,
      service: outputs["ecs_service"] as string,
      taskDefinitionFamily: outputs["task_definition_family"] as string,
      containerName: outputs["container_name"] as string
    });

    // GitHub's "new file" page accepts the filename and contents as query params.
    const createFileUrl =
      `https://github.com/${repository}/new/${encodeURIComponent(branch)}?` +
      new URLSearchParams({ filename: base.path, value: content }).toString();

    return { ...base, ready: true, reason: null, content, createFileUrl };
  }
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
