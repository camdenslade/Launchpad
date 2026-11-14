import { useEffect, useState } from "react";
import type { DeployWorkflow, Environment } from "@launchpad/contracts";
import { getDeployWorkflow } from "../../api/deployments.js";
import { CopyBlock } from "../CopyBlock.js";

/**
 * Guides wiring GitHub Actions to an environment: create the GitHub
 * environment (the deploy role only trusts jobs running in it), add the
 * generated workflow, then push or run it.
 */
export function DeploySetup({ environment, onClose }: { environment: Environment; onClose: () => void }) {
  const [workflow, setWorkflow] = useState<DeployWorkflow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDeployWorkflow(environment.id)
      .then(setWorkflow)
      .catch((err: Error) => setError(err.message));
  }, [environment.id]);

  return (
    <div className="deploy-setup">
      <div className="deploy-setup__header">
        <strong>Deploy with GitHub Actions</strong>
        <button type="button" className="link-button" onClick={onClose}>Close</button>
      </div>

      {error && <div className="banner">{error}</div>}
      {!workflow && !error && <p className="muted">Loading…</p>}

      {workflow && !workflow.ready && <p className="muted">{workflow.reason}</p>}

      {workflow?.ready && workflow.content && (
        <ol className="steps">
          <li className="step step--active">
            <div className="step__title">Create the "{workflow.githubEnvironment}" environment on GitHub</div>
            <p className="step__text">
              The deploy role only trusts jobs running in this GitHub environment of{" "}
              <code>{workflow.githubRepository}</code>.
              {environment.kind === "production"
                ? " For production, add required reviewers so every deploy needs approval."
                : " Optionally restrict it to the " + workflow.branch + " branch."}
            </p>
            {workflow.environmentsSettingsUrl && (
              <a className="button button--secondary button--sm" href={workflow.environmentsSettingsUrl} target="_blank" rel="noreferrer">
                Open environment settings ↗
              </a>
            )}
          </li>

          <li className="step step--active">
            <div className="step__title">Add the workflow to the repository</div>
            <p className="step__text">
              Opens GitHub's editor with <code>{workflow.path}</code> filled in. Commit it to{" "}
              <code>{workflow.branch}</code>. It assumes a <code>Dockerfile</code> at the repository root; edit the
              build step if yours lives elsewhere.
            </p>
            <div className="button-row">
              {workflow.createFileUrl && (
                <a className="button button--sm" href={workflow.createFileUrl} target="_blank" rel="noreferrer">
                  Create file on GitHub ↗
                </a>
              )}
            </div>
            <details className="disclosure">
              <summary>View the workflow</summary>
              <CopyBlock label={workflow.path} text={workflow.content} />
            </details>
          </li>

          <li className="step step--active">
            <div className="step__title">Deploy</div>
            <p className="step__text">
              {workflow.trigger === "push"
                ? `Every push to ${workflow.branch} builds and deploys automatically.`
                : "Production deploys run when started from the repository's Actions tab (Run workflow)."}{" "}
              No AWS keys are stored in GitHub: the job signs in with a short-lived OIDC token.
            </p>
          </li>
        </ol>
      )}
    </div>
  );
}
