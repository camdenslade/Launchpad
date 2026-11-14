import type {
  CreateEnvironment,
  Environment,
  InfrastructureOperation,
  InfrastructureRun,
  InfrastructureRunDetail,
  UpdateEnvironment
} from "@launchpad/contracts";
import { request } from "./client.js";

export function listEnvironments(projectId: string): Promise<Environment[]> {
  return request<Environment[]>(`/projects/${projectId}/environments`);
}

export function createEnvironment(projectId: string, input: CreateEnvironment): Promise<Environment> {
  return request<Environment>(`/projects/${projectId}/environments`, { method: "POST", body: input });
}

export function updateEnvironment(id: string, input: UpdateEnvironment): Promise<Environment> {
  return request<Environment>(`/environments/${id}`, { method: "PATCH", body: input });
}

export function deleteEnvironment(id: string): Promise<void> {
  return request<void>(`/environments/${id}`, { method: "DELETE" });
}

/** Starts a Terraform plan in the worker. Poll `getRun` for progress. */
export function planEnvironment(
  id: string,
  operation: InfrastructureOperation = "apply"
): Promise<InfrastructureRun> {
  return request<InfrastructureRun>(`/environments/${id}/plan`, { method: "POST", body: { operation } });
}

export function getRun(id: string): Promise<InfrastructureRunDetail> {
  return request<InfrastructureRunDetail>(`/infrastructure/runs/${id}`);
}

export function approveRun(id: string): Promise<InfrastructureRun> {
  return request<InfrastructureRun>(`/infrastructure/runs/${id}/approve`, { method: "POST" });
}

export function rejectRun(id: string): Promise<InfrastructureRun> {
  return request<InfrastructureRun>(`/infrastructure/runs/${id}/reject`, { method: "POST" });
}
