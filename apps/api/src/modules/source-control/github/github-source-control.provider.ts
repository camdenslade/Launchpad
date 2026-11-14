import { BadGatewayException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../../config/env.js";
import type { ProviderRepository, SourceControlProvider } from "../source-control.provider.js";
import { GitHubTokenService } from "./github-token.service.js";

const API = "https://api.github.com";
const PER_PAGE = 100;
/** Safety cap: 20 pages x 100 = 2000 repositories per installation. */
const MAX_PAGES = 20;

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  private: boolean;
  default_branch: string;
  pushed_at: string | null;
  language: string | null;
  owner: { avatar_url: string | null } | null;
}

/**
 * GitHub implementation of SourceControlProvider.
 *
 * Uses the user's token from the GitHub App sign-in. With a GitHub App, a
 * user token only sees repositories in the app's *installations* that the
 * user can also access. That's why repositories only appear after the app is
 * installed, and why access is controlled from GitHub's "Configure" page.
 */
@Injectable()
export class GitHubSourceControlProvider implements SourceControlProvider {
  readonly id = "github" as const;

  constructor(
    private readonly tokens: GitHubTokenService,
    private readonly config: ConfigService<Env, true>
  ) {}

  async listRepositories(userId: string): Promise<ProviderRepository[]> {
    const token = await this.tokens.getAccessToken(userId);

    const { installations } = await this.get<{ installations: { id: number }[] }>(
      token,
      `/user/installations?per_page=${PER_PAGE}`
    );

    const perInstallation = await Promise.all(
      installations.map((installation) => this.listInstallationRepos(token, installation.id))
    );

    // A repo can appear under more than one installation; de-duplicate by id.
    const byId = new Map<number, GitHubRepo>();
    for (const repo of perInstallation.flat()) byId.set(repo.id, repo);

    return [...byId.values()]
      .sort((a, b) => (b.pushed_at ?? "").localeCompare(a.pushed_at ?? ""))
      .map(toProviderRepository);
  }

  /**
   * Looked up from the accessible list (not `/repositories/:id`), so a user
   * can only import repositories the GitHub App is actually installed on.
   */
  async getRepository(userId: string, repositoryId: string): Promise<ProviderRepository | null> {
    const repositories = await this.listRepositories(userId);
    return repositories.find((repo) => repo.id === repositoryId) ?? null;
  }

  installUrl(): string {
    const slug = this.config.get("GITHUB_APP_SLUG", { infer: true });
    return slug
      ? `https://github.com/apps/${slug}/installations/new`
      : "https://github.com/settings/installations";
  }

  private async listInstallationRepos(token: string, installationId: number): Promise<GitHubRepo[]> {
    const repos: GitHubRepo[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const body = await this.get<{ total_count: number; repositories: GitHubRepo[] }>(
        token,
        `/user/installations/${installationId}/repositories?per_page=${PER_PAGE}&page=${page}`
      );
      repos.push(...body.repositories);
      if (repos.length >= body.total_count || body.repositories.length < PER_PAGE) break;
    }

    return repos;
  }

  private async get<T>(token: string, path: string): Promise<T> {
    const response = await fetch(`${API}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "launchpad"
      }
    });

    if (response.status === 401) {
      // Token revoked, or the user uninstalled/de-authorized the app.
      throw this.tokens.reauthRequired();
    }
    if (!response.ok) {
      throw new BadGatewayException(`GitHub API ${path.split("?")[0]} failed (${response.status})`);
    }

    return (await response.json()) as T;
  }
}

function toProviderRepository(repo: GitHubRepo): ProviderRepository {
  return {
    provider: "github",
    id: String(repo.id),
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description,
    url: repo.html_url,
    private: repo.private,
    defaultBranch: repo.default_branch,
    ownerAvatarUrl: repo.owner?.avatar_url ?? null,
    language: repo.language,
    updatedAt: repo.pushed_at
  };
}
