import type { ImportProject, Project, RepositoryList } from "@launchpad/contracts";
import { request } from "./client.js";

/** Repositories the signed-in user can import (GitHub for now). */
export function listRepositories(): Promise<RepositoryList> {
  return request<RepositoryList>("/source/repositories?provider=github");
}

/** Registers a repository as a project. The API fetches its details itself. */
export function importProject(input: ImportProject): Promise<Project> {
  return request<Project>("/projects/import", { method: "POST", body: input });
}
