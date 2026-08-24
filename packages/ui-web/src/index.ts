export type Density = "compact" | "comfortable";
export type SemanticTone =
  "neutral" | "primary" | "success" | "warning" | "danger" | "parked";
export function classNames(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ");
}
export function toneForStatus(status: string): SemanticTone {
  if (["done", "approved", "on_track"].includes(status)) return "success";
  if (["blocked", "critical", "rejected"].includes(status)) return "danger";
  if (["watch", "review", "changes_requested"].includes(status))
    return "warning";
  if (["working", "needed"].includes(status)) return "primary";
  if (["parked", "paused", "archived"].includes(status)) return "parked";
  return "neutral";
}
