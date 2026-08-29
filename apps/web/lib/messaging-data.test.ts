import { describe, expect, it } from "vitest";
import {
  conversationGroupFor,
  conversationIdForTeam,
  messagingPeople,
} from "./messaging-data";

describe("messaging people directory", () => {
  it("provides unique searchable identities and email actions", () => {
    expect(new Set(messagingPeople.map((person) => person.id)).size).toBe(
      messagingPeople.length,
    );
    expect(new Set(messagingPeople.map((person) => person.email)).size).toBe(
      messagingPeople.length,
    );
    expect(messagingPeople.every((person) => person.email.includes("@"))).toBe(
      true,
    );
  });
});

describe("conversation organization", () => {
  it("separates team rooms, work rooms, and individual people", () => {
    expect(conversationGroupFor({ kind: "team" })).toBe("teams");
    expect(conversationGroupFor({ kind: "workspace" })).toBe("rooms");
    expect(conversationGroupFor({ kind: "external" })).toBe("rooms");
    expect(conversationGroupFor({ kind: "direct" })).toBe("people");
  });

  it("uses a stable room id for each workspace team", () => {
    expect(conversationIdForTeam("workspace-a-marketing")).toBe(
      "conversation-team-workspace-a-marketing",
    );
  });
});
