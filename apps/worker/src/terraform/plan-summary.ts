/**
 * Turns `terraform show -json <plan>` into the summary shown for approval.
 * https://developer.hashicorp.com/terraform/internals/json-format
 */

export type ResourceAction = "create" | "update" | "delete" | "replace";

export interface PlanSummary {
  add: number;
  change: number;
  destroy: number;
  resources: { address: string; type: string; action: ResourceAction }[];
}

interface PlanJson {
  resource_changes?: {
    address: string;
    type: string;
    change: { actions: string[] };
  }[];
}

export function summarizePlan(planJson: string): PlanSummary {
  const plan = JSON.parse(planJson) as PlanJson;
  const summary: PlanSummary = { add: 0, change: 0, destroy: 0, resources: [] };

  for (const resource of plan.resource_changes ?? []) {
    const action = toAction(resource.change.actions);
    if (!action) continue; // no-op / read

    if (action === "create") summary.add++;
    if (action === "update") summary.change++;
    if (action === "delete") summary.destroy++;
    if (action === "replace") {
      summary.add++;
      summary.destroy++;
    }
    summary.resources.push({ address: resource.address, type: resource.type, action });
  }

  return summary;
}

export function hasChanges(summary: PlanSummary): boolean {
  return summary.resources.length > 0;
}

function toAction(actions: string[]): ResourceAction | null {
  const key = actions.join(",");
  switch (key) {
    case "create":
      return "create";
    case "update":
      return "update";
    case "delete":
      return "delete";
    case "delete,create":
    case "create,delete":
      return "replace";
    default:
      return null; // "no-op", "read"
  }
}
