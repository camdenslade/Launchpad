import type { Project } from "@launchpad/contracts";
import { GitHubIcon } from "./icons.js";

interface ProjectListProps {
  projects: Project[];
  /** Called when the user clicks "Remove" on a project. */
  onDelete: (project: Project) => void;
}

/**
 * Pure display component: it receives data via props and reports clicks via
 * callbacks. It doesn't fetch or own any state; Dashboard owns the data.
 */
export function ProjectList({ projects, onDelete }: ProjectListProps) {
  return (
    <ul className="project-list">
      {/* `key` lets React track each row between renders; use a stable id. */}
      {projects.map((project) => (
        <li key={project.id} className="project-row">
          <div className="project-row__icon" aria-hidden="true">
            {project.name.charAt(0).toUpperCase()}
          </div>

          <div style={{ minWidth: 0 }}>
            <h3 className="project-row__name">{project.name}</h3>
            {project.description && (
              <p className="project-row__description">{project.description}</p>
            )}
            <div className="project-row__meta">
              <a className="repo-link" href={project.repositoryUrl} target="_blank" rel="noreferrer">
                <GitHubIcon size={13} />
                <span>{shortRepo(project.repositoryUrl)}</span>
              </a>
              {project.owner && <span className="tag">{project.owner}</span>}
              <span>Added {formatDate(project.createdAt)}</span>
            </div>
          </div>

          <div className="project-row__actions">
            <button
              type="button"
              className="button button--ghost button--danger"
              onClick={() => onDelete(project)}
              aria-label={`Remove ${project.name}`}
            >
              Remove
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** "https://github.com/acme/api" -> "acme/api" (falls back to the full URL). */
function shortRepo(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const path = pathname.replace(/^\/|\.git$|\/$/g, "");
    return hostname === "github.com" && path ? path : `${hostname}${pathname}`;
  } catch {
    return url;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}
