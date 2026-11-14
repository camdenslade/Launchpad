import type { DeployWorkflow } from "@launchpad/contracts";
import { request } from "./client.js";

/** The GitHub Actions workflow that deploys this environment (or why it isn't ready). */
export function getDeployWorkflow(environmentId: string): Promise<DeployWorkflow> {
  return request<DeployWorkflow>(`/environments/${environmentId}/deploy-workflow`);
}
