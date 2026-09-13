import { describe, expect, it } from "vitest";
import {
  directConversationFor,
  personEmailHref,
  personHref,
  personWorkspaceRecords,
  recoverChatTabs,
} from "./people-workspace";
import {
  teamBoards,
  teamConversation,
  teamItems,
} from "../test-fixtures/team-workspace-data";
import { teams } from "../test-fixtures/live-workflow-data";
import { workspaceShellRoute } from "./workspace-shell-route";

describe("person workspace access and navigation", () => {
  it("includes only this person's assigned work and workspace, with truthful project membership", () => {
    const crossWorkspace = {
      ...teamItems[1]!,
      id: "outside",
      workspaceId: "other-workspace",
    };
    const records = personWorkspaceRecords(
      "user-two",
      "workspace-one",
      [...teamItems, crossWorkspace],
      teamBoards,
      teams,
      "2026-09-13",
    );
    expect(records.work.map((entry) => entry.id)).toEqual(["launch-blocked"]);
    expect(records.blocked).toHaveLength(1);
    expect(records.projects.map((entry) => entry.id)).toEqual(["board-one"]);
    expect(records.overdue).toHaveLength(0);
  });
  it("never reuses a team room, a larger direct room or another workspace's conversation", () => {
    const direct = { ...teamConversation, kind: "direct" as const };
    expect(
      directConversationFor(
        [teamConversation],
        "workspace-one",
        "user-one",
        "user-two",
      ),
    ).toBeUndefined();
    expect(
      directConversationFor(
        [{ ...direct, workspaceId: "other" }],
        "workspace-one",
        "user-one",
        "user-two",
      ),
    ).toBeUndefined();
    expect(
      directConversationFor([direct], "workspace-one", "user-one", "user-two"),
    ).toBe(direct);
  });
  it("encodes person links and email drafts, while keeping routes inside the persistent shell", () => {
    expect(personHref("my team", "user/id")).toBe(
      "/app/workspaces/my%20team/people/user%2Fid",
    );
    expect(personEmailHref("person+work@example.com", "Scope & dates")).toBe(
      "mailto:person%2Bwork%40example.com?subject=Scope%20%26%20dates",
    );
    expect(workspaceShellRoute(personHref("launch", "user-one"))).toMatchObject(
      { active: "teams", workspaceSlug: "launch", requiresRecords: true },
    );
    expect(
      workspaceShellRoute("/app/workspaces/launch/people/user-one/unknown"),
    ).toBeNull();
  });
  it("recovers bounded unique tab identifiers and handles corrupt device state", () => {
    expect(recoverChatTabs("broken")).toEqual({ ids: [], activeId: null });
    expect(
      recoverChatTabs(
        JSON.stringify({ ids: [null, "a", "a", "b", 3], activeId: "removed" }),
      ),
    ).toEqual({ ids: ["a", "b"], activeId: "a" });
    expect(
      recoverChatTabs(
        JSON.stringify({
          ids: Array.from({ length: 40 }, (_, index) => String(index)),
        }),
      ).ids,
    ).toHaveLength(12);
  });
});
