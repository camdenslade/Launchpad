import { useEffect, useState } from "react";
import type { Project } from "@launchpad/contracts";
import { deleteProject, listProjects } from "../api/projects.js";
import { BRAND } from "../brand.js";
import { LogoMark } from "./brand/Logo.js";
import { GitHubIcon, PlusIcon } from "./icons.js";
import { ImportRepositoryPanel } from "./ImportRepositoryPanel.js";
import { ProjectList } from "./ProjectList.js";
import { RegisterProjectForm } from "./RegisterProjectForm.js";

/**
 * The signed-in view. Owns the project list state and passes it down;
 * children report changes back through callbacks (`onCreated`, `onDelete`).
 */
export function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Which "add a project" panel is open, if any. */
  const [adding, setAdding] = useState<"import" | "manual" | null>(null);

  // Runs once after the first render (empty dependency array `[]`).
  // The callback can't be async itself, so we define and call an async fn.
  useEffect(() => {
    let cancelled = false; // ignore the result if the component unmounted

    async function load() {
      try {
        const result = await listProjects();
        if (!cancelled) setProjects(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load projects");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleCreated(project: Project) {
    // Prepend instead of refetching: newest first, matching the API's order.
    setProjects((current) => [project, ...current]);
    setAdding(null);
  }

  function handleImported(project: Project) {
    // Keep the import panel open so several repositories can be imported.
    setProjects((current) => [project, ...current]);
  }

  async function handleDelete(project: Project) {
    if (!window.confirm(`Remove "${project.name}" from ${BRAND.name}?`)) return;
    try {
      await deleteProject(project.id);
      setProjects((current) => current.filter((p) => p.id !== project.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove project");
    }
  }

  const isEmpty = !loading && projects.length === 0;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>
            Projects
            {!loading && projects.length > 0 && <span className="count-pill">{projects.length}</span>}
          </h1>
          <p>Every service your team builds and ships, in one catalog.</p>
        </div>
        {!adding && !isEmpty && (
          <div className="page-header__actions">
            <button type="button" className="button" onClick={() => setAdding("import")}>
              <GitHubIcon />
              Import from GitHub
            </button>
            <button type="button" className="button button--secondary" onClick={() => setAdding("manual")}>
              <PlusIcon />
              Add manually
            </button>
          </div>
        )}
      </div>

      {error && <div className="banner">{error}</div>}

      {adding === "import" && (
        <ImportRepositoryPanel onImported={handleImported} onClose={() => setAdding(null)} />
      )}

      {adding === "manual" && (
        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>Add a project manually</h2>
              <p>For repositories outside GitHub, or before the GitHub App is installed.</p>
            </div>
          </div>
          <RegisterProjectForm onCreated={handleCreated} onCancel={() => setAdding(null)} />
        </section>
      )}

      {loading ? (
        <div className="project-list" aria-busy="true">
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ) : isEmpty ? (
        !adding && (
          <div className="empty-state">
            <LogoMark size={44} />
            <h2>Ready for launch</h2>
            <p>Import your first repository to start tracking its environments and deployments.</p>
            <div className="empty-state__actions">
              <button type="button" className="button" onClick={() => setAdding("import")}>
                <GitHubIcon />
                Import from GitHub
            </button>
            <button type="button" className="button button--secondary" onClick={() => setAdding("manual")}>
                <PlusIcon />
                Add manually
            </button>
            </div>
          </div>
        )
      ) : (
        <ProjectList projects={projects} onDelete={handleDelete} />
      )}
    </>
  );
}
