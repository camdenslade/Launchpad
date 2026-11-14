import { useEffect, useMemo, useState } from "react";
import {
  SOURCE_REAUTH_REQUIRED,
  type Project,
  type RepositoryList,
  type SourceRepository
} from "@launchpad/contracts";
import { GITHUB_SIGN_IN_URL } from "../api/auth.js";
import { BRAND } from "../brand.js";
import { ApiError } from "../api/client.js";
import { importProject, listRepositories } from "../api/source.js";
import { LockIcon, SearchIcon } from "./icons.js";
import { LanguageBadge, ProjectAvatar } from "./ProjectAvatar.js";

interface ImportRepositoryPanelProps {
  onImported: (project: Project) => void;
  onClose: () => void;
}

/**
 * Lists the user's GitHub repositories and imports one as a project.
 * State machine: loading -> (error | list). Each row tracks its own
 * "importing" state so several imports can run without blocking the list.
 */
export function ImportRepositoryPanel({ onImported, onClose }: ImportRepositoryPanelProps) {
  const [data, setData] = useState<RepositoryList | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listRepositories()
      .then((result) => !cancelled && setData(result))
      .catch((err: Error) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, []);

  // useMemo: only re-filter when the list or the query actually changes.
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const repositories = data?.repositories ?? [];
    return needle
      ? repositories.filter(
          (repo) =>
            repo.fullName.toLowerCase().includes(needle) ||
            repo.description?.toLowerCase().includes(needle)
        )
      : repositories;
  }, [data, query]);

  async function handleImport(repo: SourceRepository) {
    setImporting(repo.id);
    setError(null);
    try {
      const project = await importProject({ provider: repo.provider, repositoryId: repo.id });
      // Mark it imported locally so the row updates without refetching.
      setData((current) =>
        current && {
          ...current,
          repositories: current.repositories.map((r) =>
            r.id === repo.id ? { ...r, importedProjectId: project.id } : r
          )
        }
      );
      onImported(project);
    } catch (err) {
      setError(err as Error);
    } finally {
      setImporting(null);
    }
  }

  const needsReauth = error instanceof ApiError && error.code === SOURCE_REAUTH_REQUIRED;

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>Import from GitHub</h2>
          <p>Repositories you've given {BRAND.name} access to through the GitHub App.</p>
        </div>
        <button type="button" className="button button--ghost" onClick={onClose}>
          Done
        </button>
      </div>

      {error && (
        <div className="banner">
          {error.message}
          {needsReauth && (
            <>
              {" "}
              <a href={GITHUB_SIGN_IN_URL}>Reconnect GitHub</a>
            </>
          )}
        </div>
      )}

      {!data && !error && (
        <div className="repo-list" aria-busy="true">
          <div className="skeleton skeleton--sm" />
          <div className="skeleton skeleton--sm" />
          <div className="skeleton skeleton--sm" />
        </div>
      )}

      {data && (
        <>
          {data.repositories.length > 0 && (
            <label className="search">
              <SearchIcon />
              <input
                autoFocus
                type="search"
                placeholder={`Search ${data.repositories.length} repositories`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          )}

          {data.repositories.length === 0 ? (
            <p className="muted">
              No repositories yet. Install the GitHub App on your account or organization to choose
              which repositories {BRAND.name} can see.
            </p>
          ) : visible.length === 0 ? (
            <p className="muted">No repositories match "{query}".</p>
          ) : (
            <ul className="repo-list">
              {visible.map((repo) => (
                <li key={repo.id} className="repo-row">
                  <ProjectAvatar name={repo.name} avatarUrl={repo.ownerAvatarUrl} size={28} />
                  <div className="repo-row__main">
                    <div className="repo-row__name">
                      {repo.fullName}
                      {repo.private && (
                        <span className="tag tag--icon" title="Private repository">
                          <LockIcon /> Private
                        </span>
                      )}
                    </div>
                    {(repo.language || repo.description) && (
                      <div className="repo-row__description">
                        {repo.language && <LanguageBadge language={repo.language} />}
                        {repo.description && <span>{repo.description}</span>}
                      </div>
                    )}
                  </div>
                  {repo.importedProjectId ? (
                    <span className="tag tag--accent">Imported</span>
                  ) : (
                    <button
                      type="button"
                      className="button button--secondary button--sm"
                      disabled={importing !== null}
                      onClick={() => handleImport(repo)}
                    >
                      {importing === repo.id ? "Importing…" : "Import"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {data.installUrl && (
            <p className="panel__footnote">
              Missing a repository?{" "}
              <a href={data.installUrl} target="_blank" rel="noreferrer">
                Grant access on GitHub
              </a>
              , then reopen this panel.
            </p>
          )}
        </>
      )}
    </section>
  );
}
