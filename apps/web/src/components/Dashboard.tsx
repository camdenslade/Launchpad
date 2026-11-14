import { useEffect, useState } from "react";
import type { Project } from "@launchpad/contracts";
import { deleteProject, listProjects } from "../api/projects.js";
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
  }

  async function handleDelete(project: Project) {
    if (!window.confirm(`Remove "${project.name}" from Launchpad?`)) return;
    try {
      await deleteProject(project.id);
      setProjects((current) => current.filter((p) => p.id !== project.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove project");
    }
  }

  return (
    <>
      <section className="panel">
        <h2>Register a project</h2>
        <RegisterProjectForm onCreated={handleCreated} />
      </section>

      <section className="panel">
        <h2>Projects</h2>
        {error && <p className="error">{error}</p>}
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <ProjectList projects={projects} onDelete={handleDelete} />
        )}
      </section>
    </>
  );
}
