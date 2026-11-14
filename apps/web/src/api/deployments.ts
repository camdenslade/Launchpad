import type { DeployWorkflow, DeploymentHistory, RollbackRequest } from "@launchpad/contracts";
import { request } from "./client.js";

/** The GitHub Actions workflow that deploys this environment (or why it isn't ready). */
export function getDeployWorkflow(environmentId: string): Promise<DeployWorkflow> {
  return request<DeployWorkflow>(`/environments/${environmentId}/deploy-workflow`);
}

/** Deployment history, read live from the cloud. */
export function getDeploymentHistory(environmentId: string): Promise<DeploymentHistory> {
  return request<DeploymentHistory>(`/environments/${environmentId}/deployments`);
}

/** Roll back to an earlier revision. May need approval, depending on the environment. */
export function requestRollback(environmentId: string, revision: number): Promise<RollbackRequest> {
  return request<RollbackRequest>(`/environments/${environmentId}/rollbacks`, { method: "POST", body: { revision } });
}

export function approveRollback(id: string): Promise<RollbackRequest> {
  return request<RollbackRequest>(`/rollbacks/${id}/approve`, { method: "POST" });
}

export function rejectRollback(id: string): Promise<RollbackRequest> {
  return request<RollbackRequest>(`/rollbacks/${id}/reject`, { method: "POST" });
}
