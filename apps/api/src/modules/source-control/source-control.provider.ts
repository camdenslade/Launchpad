import type { SourceProvider, SourceRepository } from "@launchpad/contracts";

/** A repository as the provider describes it (before Launchpad adds its own data). */
export type ProviderRepository = Omit<SourceRepository, "importedProjectId">;

/**
 * Everything Launchpad needs from a source-control host. Business logic
 * depends on this interface, never on GitHub directly, so GitLab or
 * Bitbucket can be added later as another implementation.
 */
export interface SourceControlProvider {
  readonly id: SourceProvider;

  /** Repositories this user has granted Launchpad access to. */
  listRepositories(userId: string): Promise<ProviderRepository[]>;

  /** One accessible repository, or null if the user can't access it. */
  getRepository(userId: string, repositoryId: string): Promise<ProviderRepository | null>;

  /** Where the user goes to grant access to more repositories, if applicable. */
  installUrl(): string | null;
}
