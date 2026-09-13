import { describe, expect, it } from "vitest";
import { issueSignals } from "../test-fixtures/attention-workspace-data";
import {
  isActiveIssue,
  issueEmailHref,
  issueHref,
  issueIdFromHash,
  issueResolutionSection,
  issueWorkItemId,
} from "./attention-workspace";
describe("attention issue routing and actions", () => {
  it("opens the cause-specific resolution tools", () => {
    expect(issueResolutionSection(issueSignals[0]!)).toBe("work");
    expect(issueResolutionSection(issueSignals[1]!)).toBe("update");
    expect(issueWorkItemId(issueSignals[0]!)).toBe("item-one");
    expect(issueWorkItemId(issueSignals[1]!)).toBeUndefined();
  });
  it("round trips issue deep links and ignores malformed hashes", () => {
    expect(issueHref("launch", "issue/a")).toBe(
      "/app/workspaces/launch/attention#issue=issue%2Fa",
    );
    expect(issueIdFromHash("#issue=issue%2Fa")).toBe("issue/a");
    expect(issueIdFromHash("#issue=%invalid")).toBeNull();
    expect(issueIdFromHash("#overview")).toBeNull();
  });
  it("excludes active snoozes without hiding them after expiry", () => {
    const signal = {
      ...issueSignals[0]!,
      snoozedUntil: "2026-09-14T10:00:00Z",
    };
    expect(isActiveIssue(signal, Date.parse("2026-09-13T10:00:00Z"))).toBe(
      false,
    );
    expect(isActiveIssue(signal, Date.parse(signal.snoozedUntil))).toBe(true);
    expect(
      isActiveIssue({ ...signal, resolvedAt: signal.snoozedUntil }, Date.now()),
    ).toBe(false);
  });
  it("encodes email context and prevents headers being injected into a draft", () => {
    const href = issueEmailHref(
      "owner@example.test",
      "Issue\r\nBcc: someone",
      "A&B\n#issue=one",
    );
    expect(href).toContain("subject=Issue%20%20Bcc%3A%20someone");
    expect(href).toContain("body=A%26B%0A%23issue%3Done");
    expect(href).not.toContain("\r");
  });
});
