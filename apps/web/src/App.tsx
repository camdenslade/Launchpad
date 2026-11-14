import { useEffect, useState } from "react";
import type { Project } from "@launchpad/contracts";
import { deleteProject, listProjects } from "./api/projects.js";
import { ProjectList } from "./components/ProjectList.js";
import { RegisterProjectForm } from "./components/RegisterProjectForm.js";
import "./styles.css";

/**
 * App owns the project list state and passes it down. Child components get
 * data through props and report changes through callbacks (`onCreated`,
 * `onDelete`). That "state lives in the parent" pattern is most of React.
 */
function App() {
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
    <main className="app">
      <header className="app__header">
        <h1>Launchpad</h1>
        <p className="muted">Developer platform</p>
      </header>

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
    </main>
  );
}

export default App;
