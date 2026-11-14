import { useCallback, useEffect, useState } from "react";
import type { CurrentUser, Deployment, DeploymentHistory, Environment, RollbackRequest } from "@launchpad/contracts";
import { approveRollback, getDeploymentHistory, rejectRollback, requestRollback } from "../../api/deployments.js";

const POLL_MS = 5000;

const ROLLBACK_LABEL: Record<RollbackRequest["status"], string> = {
  pending_approval: "awaiting approval",
  queued: "queued",
  running: "rolling out",
  succeeded: "completed",
  failed: "failed",
  rejected: "rejected"
};

interface DeploymentsPanelProps {
  environment: Environment;
  currentUser: CurrentUser;
  onClose: () => void;
}

/**
 * Deployment history for an environment's service, read live from the cloud,
 * with rollback to any earlier revision.
 */
export function DeploymentsPanel({ environment, currentUser, onClose }: DeploymentsPanelProps) {
  const [history, setHistory] = useState<DeploymentHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setHistory(await getDeploymentHistory(environment.id));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [environment.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeRollback = history?.rollbacks.find((r) => ["pending_approval", "queued", "running"].includes(r.status));
  const latestRollback = history?.rollbacks[0];

  // Keep refreshing while something is changing.
  useEffect(() => {
    if (!history?.rollingOut && !activeRollback) return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [history?.rollingOut, activeRollback?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function rollBack(deployment: Deployment) {
    const approval =
      environment.approvalPolicy === "different_member" ? " Someone else will need to approve it." : "";
    const label = deployment.commitSha ? `commit ${deployment.commitSha.slice(0, 7)}` : `revision ${deployment.revision}`;
    if (!window.confirm(`Roll ${environment.name} back to ${label}?${approval}`)) return;
    void act(() => requestRollback(environment.id, deployment.revision));
  }

  return (
    <div className="deploy-setup">
      <div className="deploy-setup__header">
        <strong>Deployments</strong>
        <span className="row-actions">
          <button type="button" className="link-button" onClick={() => void load()} disabled={busy}>Refresh</button>
          <button type="button" className="link-button" onClick={onClose}>Close</button>
        </span>
      </div>

      {error && <div className="banner">{error}</div>}
      {!history && !error && <p className="muted">Reading from the cloud…</p>}
      {history && !history.ready && <p className="muted">{history.reason}</p>}

      {latestRollback && (activeRollback || latestRollback.status === "failed") && (
        <div className={`rollback-banner rollback-banner--${latestRollback.status}`}>
          <span>
            Rollback to revision {latestRollback.targetRevision}{" "}
            <strong>{ROLLBACK_LABEL[latestRollback.status]}</strong>
            {latestRollback.requestedBy ? ` · requested by ${latestRollback.requestedBy}` : ""}
            {latestRollback.error ? ` · ${latestRollback.error}` : ""}
          </span>
          {latestRollback.status === "pending_approval" && (
            <span className="row-actions">
              <button type="button" className="button button--ghost button--sm" disabled={busy} onClick={() => act(() => rejectRollback(latestRollback.id))}>
                Reject
              </button>
              <button
                type="button"
                className="button button--sm"
                disabled={busy || latestRollback.requestedBy === currentUser.login}
                title={latestRollback.requestedBy === currentUser.login ? "Needs someone else's approval" : undefined}
                onClick={() => act(() => approveRollback(latestRollback.id))}
              >
                Approve rollback
              </button>
            </span>
          )}
        </div>
      )}

      {history?.ready && history.deployments.length === 0 && (
        <p className="muted">No deployments yet. Push to the repository once the deploy workflow is set up.</p>
      )}

      {history?.ready && history.deployments.length > 0 && (
        <ul className="deployment-list">
          {history.deployments.map((d) => (
            <li key={d.id} className={`deployment-row${d.current ? " deployment-row--current" : ""}`}>
              <span className="deployment-row__rev">#{d.revision}</span>
              <span className="deployment-row__main">
                {d.commitSha ? (
                  d.commitUrl ? (
                    <a href={d.commitUrl} target="_blank" rel="noreferrer" className="text-link"><code>{d.commitSha.slice(0, 7)}</code></a>
                  ) : (
                    <code>{d.commitSha.slice(0, 7)}</code>
                  )
                ) : (
                  <code className="muted">{d.image?.split("/").pop() ?? "unknown image"}</code>
                )}
                <span className="muted">
                  {d.registeredAt ? new Date(d.registeredAt).toLocaleString() : ""}
                  {d.registeredBy ? ` · ${d.registeredBy}` : ""}
                </span>
              </span>
              <span className="deployment-row__state">
                {d.current && <span className="tag tag--accent">Live</span>}
                {d.state === "in_progress" && <span className="tag">Rolling out</span>}
                {d.state === "failed" && <span className="tag tag--danger" title={d.stateReason ?? undefined}>Failed</span>}
                {!d.current && d.state !== "in_progress" && (
                  <button
                    type="button"
                    className="link-button"
                    disabled={busy || Boolean(activeRollback) || history.rollingOut}
                    onClick={() => rollBack(d)}
                  >
                    Roll back to this
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
