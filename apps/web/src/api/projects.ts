import type { CreateProject, Project, UpdateProject } from "@launchpad/contracts";
import { request } from "./client.js";

/**
 * Typed functions for /api/projects. Components call these instead of
 * building URLs themselves. To add an endpoint: add the route in the API's
 * projects.controller.ts, then add a one-line function here.
 */

export function listProjects(): Promise<Project[]> {
  return request<Project[]>("/projects");
}

export function getProject(id: string): Promise<Project> {
  return request<Project>(`/projects/${id}`);
}

export function createProject(input: CreateProject): Promise<Project> {
  return request<Project>("/projects", { method: "POST", body: input });
}

export function updateProject(id: string, input: UpdateProject): Promise<Project> {
  return request<Project>(`/projects/${id}`, { method: "PATCH", body: input });
}

export function deleteProject(id: string): Promise<void> {
  return request<void>(`/projects/${id}`, { method: "DELETE" });
}
