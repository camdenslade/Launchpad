import { useEffect, useState } from "react";
import type {
  CurrentUser,
  Environment,
  InfrastructureOperation,
  InfrastructureRun,
  InfrastructureRunDetail
} from "@launchpad/contracts";
import {
  approveRun,
  deleteEnvironment,
  getRun,
  planEnvironment,
  rejectRun,
  updateEnvironment
} from "../../api/environments.js";
import { ProviderLogo } from "../cloud/ProviderLogo.js";
import { estimateMonthlyCost, SERVICE_SIZES } from "@launchpad/contracts";
import { PlanReview } from "./PlanReview.js";
import { ACTIVE_STATUSES, RunStatus } from "./RunStatus.js";
import { ServiceSettingsForm } from "./ServiceSettingsForm.js";
import { DeploySetup } from "./DeploySetup.js";
import { DeploymentsPanel } from "./DeploymentsPanel.js";

const POLL_MS = 2500;

interface EnvironmentCardProps {
  environment: Environment;
  currentUser: CurrentUser;
  onChanged: (environment: Environment) => void;
  onDeleted: (environmentId: string) => void;
}

/**
 * One environment: its latest infrastructure run, and the actions that fit
 * that run's state (plan -> review -> approve/reject -> apply progress).
 * Teardown is the same flow with a "destroy" plan.
 */
export function EnvironmentCard({ environment, currentUser, onChanged, onDeleted }: EnvironmentCardProps) {
  const [run, setRun] = useState<InfrastructureRun | InfrastructureRunDetail | null>(environment.latestRun);
  const [log, setLog] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingService, setEditingService] = useState(false);
  const [showDeploySetup, setShowDeploySetup] = useState(false);
  const [showDeployments, setShowDeployments] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const active = run !== null && ACTIVE_STATUSES.includes(run.status);
  const awaitingDecision = run?.status === "planned";
  const isTeardown = run?.operation === "destroy";

  // An applied run is the source of truth for whether infrastructure exists.
  const provisioned = run?.status === "applied" ? run.operation === "apply" : environment.provisioned;

  // While the worker is busy, poll the run until it settles.
  useEffect(() => {
    if (!run || !active) return;
    const timer = setInterval(async () => {
      try {
        setRun(await getRun(run.id));
      } catch {
        // transient; retry next tick
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [run?.id, active]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(action: () => Promise<InfrastructureRun>) {
    setBusy(true);
    setError(null);
    setLog(null);
    try {
      setRun(await action());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function plan(operation: InfrastructureOperation) {
    setSettingsSaved(false);
    return act(() => planEnvironment(environment.id, operation));
  }

  function requestTeardown() {
    const warning =
      `Plan a teardown of "${environment.name}"? This plans the deletion of all its infrastructure ` +
      `in ${environment.cloudAccount.name}. Nothing is deleted until the plan is approved.`;
    if (environment.kind === "production") {
      // Extra friction for production: type the name.
      const typed = window.prompt(`${warning}\n\nType "${environment.name}" to continue.`);
      if (typed !== environment.name) return;
    } else if (!window.confirm(warning)) {
      return;
    }
    void plan("destroy");
  }

  async function handleDelete() {
    if (!window.confirm(`Delete the "${environment.name}" environment from Launchpad? Its history is removed too.`)) return;
    try {
      await deleteEnvironment(environment.id);
      onDeleted(environment.id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleLog() {
    if (log !== null || !run) return setLog(null);
    const detail = await getRun(run.id);
    setLog([detail.planLog, detail.applyLog].filter(Boolean).join("\n") || "No output yet.");
  }

  async function setPolicy(approvalPolicy: Environment["approvalPolicy"]) {
    try {
      onChanged(await updateEnvironment(environment.id, { approvalPolicy }));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const needsOtherApprover =
    awaitingDecision && environment.approvalPolicy === "different_member" && run?.requestedBy === currentUser.login;

  const outputs = run?.status === "applied" && !isTeardown ? run.outputs : null;
  const registryUrl = outputs?.["registry_url"] as string | undefined;
  const serviceUrl = outputs?.["service_url"] as string | undefined;
  const service = environment.serviceSettings;

  const idle = !busy && !active && !awaitingDecision;

  return (
    <article className="env-card">
      <header className="env-card__header">
        <div className="env-card__title">
          <h3>{environment.name}</h3>
          <span className={`kind-pill kind-pill--${environment.kind}`}>{environment.kind}</span>
        </div>
        <div className="row-actions">
          {provisioned && (
            <button type="button" className="button button--ghost button--danger" disabled={!idle} onClick={requestTeardown}>
              Tear down
            </button>
          )}
          {!provisioned && run && idle && (
            <button type="button" className="button button--ghost button--danger" onClick={handleDelete}>
              Delete
            </button>
          )}
          <button
            type="button"
            className="button button--secondary button--sm"
            disabled={!idle}
            onClick={() => plan("apply")}
            title={awaitingDecision ? "Approve or reject the current plan first" : undefined}
          >
            {provisioned ? "Plan changes" : "Plan infrastructure"}
          </button>
        </div>
      </header>

      <div className="env-card__meta">
        <span className="meta-item">
          <ProviderLogo provider={environment.cloudAccount.provider} size={16} />
          {environment.cloudAccount.name}
        </span>
        <span>{environment.region}</span>
        <code className="muted">{environment.slug}</code>
        <label className="policy-select">
          Approval
          <select
            value={environment.approvalPolicy}
            onChange={(e) => setPolicy(e.target.value as Environment["approvalPolicy"])}
          >
            <option value="any_member">Anyone</option>
            <option value="different_member">A second person</option>
          </select>
        </label>
      </div>

      <div className="env-card__service">
        {editingService ? (
          <ServiceSettingsForm
            environment={environment}
            onSaved={(updated) => {
              onChanged(updated);
              setEditingService(false);
              setSettingsSaved(true);
            }}
            onCancel={() => setEditingService(false)}
          />
        ) : (
          <div className="env-card__service-summary">
            <span>
              <strong>Service</strong>{" "}
              {service.enabled ? (
                <span className="muted">
                  {SERVICE_SIZES[service.size].label} × {service.desiredCount} · port {service.containerPort} ·
                  health {service.healthCheckPath} · ~${estimateMonthlyCost(service)}/mo
                </span>
              ) : (
                <span className="muted">Off (registry only)</span>
              )}
            </span>
            <button type="button" className="link-button" onClick={() => setEditingService(true)} disabled={!idle}>
              Edit
            </button>
          </div>
        )}
        {settingsSaved && !editingService && idle && (
          <p className="step__hint">Saved. Plan changes to see what this does before anything is applied.</p>
        )}
        {service.enabled && provisioned && !editingService && (
          showDeploySetup ? (
            <DeploySetup environment={environment} onClose={() => setShowDeploySetup(false)} />
          ) : (
            <div className="env-card__service-summary" style={{ marginTop: 10 }}>
              <span>
                <strong>Deploys</strong> <span className="muted">GitHub Actions → ECR → ECS</span>
              </span>
              <span className="row-actions">
                <button type="button" className="link-button" onClick={() => setShowDeployments((v) => !v)}>
                  {showDeployments ? "Hide history" : "History & rollback"}
                </button>
                <button type="button" className="link-button" onClick={() => setShowDeploySetup(true)}>
                  Set up deploys
                </button>
              </span>
            </div>
          )
        )}
        {service.enabled && provisioned && showDeployments && (
          <DeploymentsPanel environment={environment} currentUser={currentUser} onClose={() => setShowDeployments(false)} />
        )}
      </div>

      {run ? (
        <div className={`env-card__run${isTeardown ? " env-card__run--teardown" : ""}`}>
          <div className="env-card__run-header">
            <RunStatus status={run.status} operation={run.operation} />
            <span className="muted">
              {run.requestedBy ? `by ${run.requestedBy} · ` : ""}
              {new Date(run.createdAt).toLocaleString()}
              {run.approvedBy ? ` · approved by ${run.approvedBy}` : ""}
            </span>
            <button type="button" className="link-button" onClick={toggleLog}>
              {log === null ? "View log" : "Hide log"}
            </button>
          </div>

          {run.summary && ["planned", "approved", "applying", "applied"].includes(run.status) && (
            <PlanReview summary={run.summary} />
          )}

          {awaitingDecision && (
            <div className="env-card__decision">
              {needsOtherApprover ? (
                <p className="muted">Waiting for someone else to approve. You requested this plan.</p>
              ) : isTeardown ? (
                <p className="error">Approving permanently deletes the resources listed above.</p>
              ) : (
                <p className="muted">Nothing changes until this plan is approved.</p>
              )}
              <div className="row-actions">
                <button type="button" className="button button--ghost" disabled={busy} onClick={() => act(() => rejectRun(run.id))}>
                  Reject
                </button>
                <button
                  type="button"
                  className={`button${isTeardown ? " button--destructive" : ""}`}
                  disabled={busy || needsOtherApprover}
                  onClick={() => act(() => approveRun(run.id))}
                >
                  {isTeardown ? "Approve & destroy" : "Approve & apply"}
                </button>
              </div>
            </div>
          )}

          {run.status === "no_changes" && !isTeardown && (
            <p className="muted">Infrastructure already matches the configuration.</p>
          )}
          {run.status === "applied" && isTeardown && (
            <p className="muted">All infrastructure for this environment has been removed. You can delete the environment now.</p>
          )}
          {serviceUrl && (
            <p className="env-card__output">
              URL{" "}
              <a href={serviceUrl} target="_blank" rel="noreferrer" className="text-link">
                {serviceUrl}
              </a>
            </p>
          )}
          {registryUrl && (
            <p className="env-card__output">
              Registry <code>{registryUrl}</code>
            </p>
          )}
          {run.status === "failed" && run.error && <pre className="run-error">{run.error}</pre>}
          {log !== null && <pre className="run-log">{log}</pre>}
        </div>
      ) : (
        <div className="env-card__empty">
          <p className="muted">No infrastructure yet. Plan it to see exactly what will be created before anything happens.</p>
          <button type="button" className="button button--ghost button--danger" onClick={handleDelete}>
            Delete environment
          </button>
        </div>
      )}

      {error && <div className="banner">{error}</div>}
    </article>
  );
}
