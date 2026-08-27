import type { WorkItemType } from "@founderhq/core";

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

export function routeForWorkItemType(type: WorkItemType): string {
  if (type === "decision") return "/app/decisions";
  if (type === "idea") return "/app/ideas";
  if (type === "approval") return "/app/approvals";
  return "/app/my-work";
}
