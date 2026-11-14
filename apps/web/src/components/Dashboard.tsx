import { useEffect, useState } from "react";
import type { Project } from "@launchpad/contracts";
import { deleteProject, listProjects } from "../api/projects.js";
import { BRAND } from "../brand.js";
import { LogoMark } from "./brand/Logo.js";
import { PlusIcon } from "./icons.js";
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
  const [showForm, setShowForm] = useState(false);

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
    setShowForm(false);
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
        {!showForm && !isEmpty && (
          <button type="button" className="button" onClick={() => setShowForm(true)}>
            <PlusIcon />
            Register project
          </button>
        )}
      </div>

      {error && <div className="banner">{error}</div>}

      {showForm && (
        <section className="panel">
          <div className="panel__header">
            <div>
              <h2>Register a project</h2>
              <p>Add an existing repository to the catalog.</p>
            </div>
          </div>
          <RegisterProjectForm onCreated={handleCreated} onCancel={() => setShowForm(false)} />
        </section>
      )}

      {loading ? (
        <div className="project-list" aria-busy="true">
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ) : isEmpty ? (
        !showForm && (
          <div className="empty-state">
            <LogoMark size={44} />
            <h2>Ready for launch</h2>
            <p>Register your first repository to start tracking its environments and deployments.</p>
            <button type="button" className="button" onClick={() => setShowForm(true)}>
              <PlusIcon />
              Register project
            </button>
          </div>
        )
      ) : (
        <ProjectList projects={projects} onDelete={handleDelete} />
      )}
    </>
  );
}
