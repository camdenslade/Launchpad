import type { InfrastructureRunStatus } from "@launchpad/contracts";

const LABELS: Record<InfrastructureRunStatus, string> = {
  queued: "Queued",
  planning: "Planning…",
  planned: "Awaiting approval",
  no_changes: "Up to date",
  approved: "Approved",
  applying: "Applying…",
  applied: "Applied",
  rejected: "Rejected",
  superseded: "Superseded",
  failed: "Failed"
};

const TONE: Record<InfrastructureRunStatus, "neutral" | "busy" | "attention" | "ok" | "error"> = {
  queued: "busy",
  planning: "busy",
  planned: "attention",
  no_changes: "ok",
  approved: "busy",
  applying: "busy",
  applied: "ok",
  rejected: "neutral",
  superseded: "neutral",
  failed: "error"
};

/** States where the worker is still doing something (poll while in these). */
export const ACTIVE_STATUSES: InfrastructureRunStatus[] = ["queued", "planning", "approved", "applying"];

export function RunStatus({ status }: { status: InfrastructureRunStatus }) {
  const tone = TONE[status];
  return (
    <span className={`run-status run-status--${tone}`}>
      {tone === "busy" && <span className="run-status__spinner" aria-hidden="true" />}
      {LABELS[status]}
    </span>
  );
}
