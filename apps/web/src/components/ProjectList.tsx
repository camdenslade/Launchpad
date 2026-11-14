import type { Project } from "@launchpad/contracts";

interface ProjectListProps {
  projects: Project[];
  /** Called when the user clicks "Remove" on a project. */
  onDelete: (project: Project) => void;
}

/**
 * Pure display component: it receives data via props and reports clicks via
 * callbacks. It doesn't fetch or own any state, which makes it easy to reuse
 * and reason about. App.tsx owns the data.
 */
export function ProjectList({ projects, onDelete }: ProjectListProps) {
  if (projects.length === 0) {
    return <p className="muted">No projects registered yet.</p>;
  }

  return (
    <ul className="project-list">
      {/* `key` lets React track each row between renders; use a stable id. */}
      {projects.map((project) => (
        <li key={project.id} className="project-card">
          <div className="project-card__main">
            <h3>{project.name}</h3>
            {project.description && <p>{project.description}</p>}
            <a href={project.repositoryUrl} target="_blank" rel="noreferrer">
              {project.repositoryUrl}
            </a>
          </div>
          <div className="project-card__meta">
            <span>{project.owner ?? "No owner"}</span>
            <span className="muted">
              Added {new Date(project.createdAt).toLocaleDateString()}
            </span>
            <button
              type="button"
              className="button button--danger"
              onClick={() => onDelete(project)}
            >
              Remove
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
