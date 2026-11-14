import { useEffect, useState } from "react";
import type { CurrentUser, Environment, Project } from "@launchpad/contracts";
import { listEnvironments } from "../../api/environments.js";
import { getProject } from "../../api/projects.js";
import { linkProps } from "../../lib/router.js";
import { BranchIcon, GitHubIcon, PlusIcon } from "../icons.js";
import { LanguageBadge, ProjectAvatar } from "../ProjectAvatar.js";
import { AddEnvironmentForm } from "./AddEnvironmentForm.js";
import { EnvironmentCard } from "./EnvironmentCard.js";

interface ProjectPageProps {
  projectId: string;
  currentUser: CurrentUser;
}

export function ProjectPage({ projectId, currentUser }: ProjectPageProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [environments, setEnvironments] = useState<Environment[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getProject(projectId), listEnvironments(projectId)])
      .then(([p, envs]) => {
        setProject(p);
        setEnvironments(envs);
      })
      .catch((err: Error) => setError(err.message));
  }, [projectId]);

  function replace(updated: Environment) {
    setEnvironments((current) => (current ?? []).map((e) => (e.id === updated.id ? updated : e)));
  }

  if (error) {
    return (
      <>
        <a {...linkProps("/")} className="back-link">← Projects</a>
        <div className="banner">{error}</div>
      </>
    );
  }

  if (!project || !environments) {
    return <div className="project-list" aria-busy="true"><div className="skeleton" /></div>;
  }

  return (
    <>
      <a {...linkProps("/")} className="back-link">← Projects</a>

      <div className="page-header project-header">
        <div className="project-header__main">
          <ProjectAvatar name={project.name} avatarUrl={project.avatarUrl} size={52} />
          <div>
            <h1>{project.name}</h1>
            {project.description && <p>{project.description}</p>}
            <div className="project-row__meta">
              <a className="repo-link" href={project.repositoryUrl} target="_blank" rel="noreferrer">
                <GitHubIcon size={13} />
                <span>{project.repositoryUrl.replace(/^https?:\/\/(www\.)?github\.com\//, "")}</span>
              </a>
              {project.language && <LanguageBadge language={project.language} />}
              {project.defaultBranch && (
                <span className="meta-item"><BranchIcon />{project.defaultBranch}</span>
              )}
              {project.owner && <span className="tag">{project.owner}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="section-header">
        <h2>Environments</h2>
        {!adding && environments.length > 0 && (
          <button type="button" className="button button--secondary button--sm" onClick={() => setAdding(true)}>
            <PlusIcon size={14} /> Add environment
          </button>
        )}
      </div>

      {adding && (
        <AddEnvironmentForm
          projectId={project.id}
          onCreated={(env) => {
            setEnvironments((current) => [...(current ?? []), env]);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {environments.length === 0 && !adding ? (
        <div className="empty-state">
          <h2>No environments yet</h2>
          <p>Create a staging or production environment to provision infrastructure for {project.name} in your cloud.</p>
          <button type="button" className="button" onClick={() => setAdding(true)}>
            <PlusIcon /> Add environment
          </button>
        </div>
      ) : (
        <div className="env-list">
          {environments.map((env) => (
            <EnvironmentCard key={env.id} environment={env} currentUser={currentUser} onChanged={replace} />
          ))}
        </div>
      )}
    </>
  );
}
