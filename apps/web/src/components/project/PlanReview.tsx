import type { PlanSummary } from "@launchpad/contracts";

const ACTION_SYMBOL = { create: "+", update: "~", delete: "−", replace: "±" } as const;

/** Human-readable view of what a plan will do, for the approval decision. */
export function PlanReview({ summary }: { summary: PlanSummary }) {
  return (
    <div className="plan-review">
      <div className="plan-review__counts">
        <span className="plan-count plan-count--create">+{summary.add} to add</span>
        <span className="plan-count plan-count--update">~{summary.change} to change</span>
        <span className="plan-count plan-count--delete">−{summary.destroy} to destroy</span>
      </div>
      {summary.resources.length > 0 && (
        <ul className="plan-review__resources">
          {summary.resources.map((resource) => (
            <li key={resource.address} className={`plan-resource plan-resource--${resource.action}`}>
              <span className="plan-resource__symbol" aria-label={resource.action}>
                {ACTION_SYMBOL[resource.action]}
              </span>
              <code>{resource.address}</code>
              <span className="plan-resource__action">{resource.action}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
