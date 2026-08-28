import type { WorkItemType } from "@founderhq/core";
import { workspaceHref } from "./workspace-routes";

export interface OpportunityFactors {
  impact: number;
  confidence: number;
  fit: number;
  effort: number;
}

export function scoreOpportunity(factors: OpportunityFactors): string {
  return (
    (factors.impact * factors.confidence * factors.fit) /
    Math.max(factors.effort, 1)
  ).toFixed(1);
}

export function validateCapture(input: {
  type: WorkItemType;
  title: string;
  dueDate?: string;
}): string[] {
  const errors: string[] = [];
  if (!input.title.trim()) errors.push("A title is required.");
  if (
    (input.type === "milestone" || input.type === "approval") &&
    !input.dueDate
  ) {
    errors.push("A due date is required for milestones and approvals.");
  }
  return errors;
}

const managementViewFor = (type: WorkItemType) => {
  if (type === "decision") return "decisions";
  if (type === "idea") return "ideas";
  if (type === "approval") return "approvals";
  return "my-work";
};

/**
 * Management surfaces are workspace-scoped. Without a workspace there is
 * no single destination, so the caller is sent to the portfolio to pick.
 */
export function routeForWorkItemType(
  type: WorkItemType,
  workspaceSlug?: string,
): string {
  if (!workspaceSlug) return "/app/portfolio";
  return workspaceHref(workspaceSlug, managementViewFor(type));
}
