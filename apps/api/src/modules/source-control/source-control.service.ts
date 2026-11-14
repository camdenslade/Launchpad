import { Injectable, NotFoundException } from "@nestjs/common";
import type { RepositoryList, SourceProvider } from "@launchpad/contracts";
import type { PrismaClient } from "@launchpad/database";
import { InjectDatabase } from "../database/database.module.js";
import { GitHubSourceControlProvider } from "./github/github-source-control.provider.js";
import type { ProviderRepository, SourceControlProvider } from "./source-control.provider.js";

/**
 * Entry point for source-control features. Picks the right provider and adds
 * Launchpad's own knowledge (e.g. "already imported") to provider data.
 */
@Injectable()
export class SourceControlService {
  private readonly providers: Map<SourceProvider, SourceControlProvider>;

  constructor(
    @InjectDatabase() private readonly db: PrismaClient,
    github: GitHubSourceControlProvider
  ) {
    // Register additional providers (GitLab, ...) here.
    this.providers = new Map<SourceProvider, SourceControlProvider>([[github.id, github]]);
  }

  async listRepositories(userId: string, provider: SourceProvider): Promise<RepositoryList> {
    const source = this.provider(provider);
    const repositories = await source.listRepositories(userId);

    const imported = await this.db.project.findMany({
      where: { sourceProvider: provider, sourceRepoId: { in: repositories.map((r) => r.id) } },
      select: { id: true, sourceRepoId: true }
    });
    const projectIdByRepo = new Map(imported.map((p) => [p.sourceRepoId, p.id]));

    return {
      repositories: repositories.map((repo) => ({
        ...repo,
        importedProjectId: projectIdByRepo.get(repo.id) ?? null
      })),
      installUrl: source.installUrl()
    };
  }

  async getRepository(
    userId: string,
    provider: SourceProvider,
    repositoryId: string
  ): Promise<ProviderRepository> {
    const repository = await this.provider(provider).getRepository(userId, repositoryId);
    if (!repository) {
      throw new NotFoundException(
        "Repository not found, or Launchpad hasn't been granted access to it"
      );
    }
    return repository;
  }

  private provider(id: SourceProvider): SourceControlProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new NotFoundException(`Unknown source provider: ${id}`);
    return provider;
  }
}
