import { useEffect, useState } from "react";
import type { CurrentUser, Environment, InfrastructureRun, InfrastructureRunDetail } from "@launchpad/contracts";
import { approveRun, getRun, planEnvironment, rejectRun, updateEnvironment } from "../../api/environments.js";
import { ProviderLogo } from "../cloud/ProviderLogo.js";
import { PlanReview } from "./PlanReview.js";
import { ACTIVE_STATUSES, RunStatus } from "./RunStatus.js";

const POLL_MS = 2500;

interface EnvironmentCardProps {
  environment: Environment;
  currentUser: CurrentUser;
  onChanged: (environment: Environment) => void;
}

/**
 * One environment: its latest infrastructure run, and the actions that fit
 * that run's state (plan -> review -> approve/reject -> apply progress).
 */
export function EnvironmentCard({ environment, currentUser, onChanged }: EnvironmentCardProps) {
  const [run, setRun] = useState<InfrastructureRun | InfrastructureRunDetail | null>(environment.latestRun);
  const [log, setLog] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = run !== null && ACTIVE_STATUSES.includes(run.status);

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
    run?.status === "planned" &&
    environment.approvalPolicy === "different_member" &&
    run.requestedBy === currentUser.login;

  const registryUrl = run?.status === "applied" ? (run.outputs?.["registry_url"] as string | undefined) : undefined;

  return (
    <article className="env-card">
      <header className="env-card__header">
        <div className="env-card__title">
          <h3>{environment.name}</h3>
          <span className={`kind-pill kind-pill--${environment.kind}`}>{environment.kind}</span>
        </div>
        <button
          type="button"
          className="button button--secondary button--sm"
          disabled={busy || active || run?.status === "planned"}
          onClick={() => act(() => planEnvironment(environment.id))}
          title={run?.status === "planned" ? "Approve or reject the current plan first" : undefined}
        >
          Plan changes
        </button>
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

      {run ? (
        <div className="env-card__run">
          <div className="env-card__run-header">
            <RunStatus status={run.status} />
            <span className="muted">
              {run.requestedBy ? `by ${run.requestedBy} · ` : ""}
              {new Date(run.createdAt).toLocaleString()}
              {run.approvedBy ? ` · approved by ${run.approvedBy}` : ""}
            </span>
            <button type="button" className="link-button" onClick={toggleLog}>
              {log === null ? "View log" : "Hide log"}
            </button>
          </div>

          {run.summary && (run.status === "planned" || run.status === "approved" || run.status === "applying" || run.status === "applied") && (
            <PlanReview summary={run.summary} />
          )}

          {run.status === "planned" && (
            <div className="env-card__decision">
              {needsOtherApprover ? (
                <p className="muted">Waiting for someone else to approve. You requested this plan.</p>
              ) : (
                <p className="muted">Nothing changes until this plan is approved.</p>
              )}
              <div className="row-actions">
                <button type="button" className="button button--ghost" disabled={busy} onClick={() => act(() => rejectRun(run.id))}>
                  Reject
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={busy || needsOtherApprover}
                  onClick={() => act(() => approveRun(run.id))}
                >
                  Approve &amp; apply
                </button>
              </div>
            </div>
          )}

          {run.status === "no_changes" && <p className="muted">Infrastructure already matches the configuration.</p>}
          {registryUrl && (
            <p className="env-card__output">
              Registry <code>{registryUrl}</code>
            </p>
          )}
          {run.status === "failed" && run.error && <pre className="run-error">{run.error}</pre>}
          {log !== null && <pre className="run-log">{log}</pre>}
        </div>
      ) : (
        <p className="muted env-card__empty">No infrastructure yet. Plan changes to see what will be created.</p>
      )}

      {error && <div className="banner">{error}</div>}
    </article>
  );
}
