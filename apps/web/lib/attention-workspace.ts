import type { AttentionSignalDto, WorkItemDto } from "@founderhq/api-contract";
import { workspaceHref } from "./workspace-routes";

export type IssueSection =
  "overview" | "work" | "followup" | "communication" | "update";
export type IssueAction = "resolve" | "snooze" | "dismiss";

export function issueHash(id: string) {
  return `#issue=${encodeURIComponent(id)}`;
}
export function issueIdFromHash(hash: string) {
  if (!hash.startsWith("#issue=")) return null;
  try {
    return decodeURIComponent(hash.slice(7));
  } catch {
    return null;
  }
}
export function issueHref(workspaceSlug: string, id: string) {
  return `${workspaceHref(workspaceSlug, "attention")}${issueHash(id)}`;
}
export function issueWorkItemId(signal: AttentionSignalDto) {
  if (["work_item", "decision", "approval"].includes(signal.entityType))
    return signal.entityId;
  return signal.sourceEvidence.find((source) =>
    ["work_item", "decision", "approval"].includes(source.sourceType),
  )?.sourceId;
}
export function issueResolutionSection(
  signal: AttentionSignalDto,
): IssueSection {
  return issueWorkItemId(signal)
    ? "work"
    : signal.reasonCode === "workspace.update_stale"
      ? "update"
      : "overview";
}
export function issueCategory(signal: AttentionSignalDto) {
  const labels: Record<string, string> = {
    "work_item.overdue": "Overdue work",
    "work_item.blocked": "Blocked work",
    "work_item.unassigned_priority": "Needs an owner",
    "decision.pending": "Decision needed",
    "approval.pending": "Approval needed",
    "waiting.follow_up_due": "Follow-up due",
    "workspace.update_stale": "Workspace update needed",
  };
  return labels[signal.reasonCode] ?? "Needs attention";
}
export function issueContext(
  signal: AttentionSignalDto,
  url: string,
  item?: WorkItemDto,
) {
  return [
    signal.reason,
    signal.recommendedAction,
    item ? `Task: ${item.title}` : "",
    `Issue: ${url}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function issueEmailHref(to: string, subject: string, body: string) {
  // Keep recipients out of the mailto query and prevent header injection.
  const recipients = to
    .replace(/[\r\n]/g, "")
    .split(/[,;]/)
    .map((value) => value.trim())
    .filter(Boolean);
  return `mailto:${recipients.map(encodeURIComponent).join(",")}?subject=${encodeURIComponent(subject.replace(/[\r\n]/g, " "))}&body=${encodeURIComponent(body)}`;
}
export function isActiveIssue(signal: AttentionSignalDto, now: number) {
  return (
    !signal.resolvedAt &&
    !signal.dismissedAt &&
    (!signal.snoozedUntil || Date.parse(signal.snoozedUntil) <= now)
  );
}
