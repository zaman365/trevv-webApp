import { describe, expect, it } from "vitest";
import { messagingPeople } from "./messaging-data";

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
