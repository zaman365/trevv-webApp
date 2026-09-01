import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InboxExperience } from "./email-inbox-workflow";

describe("unified Inbox composition", () => {
  it("preserves email, actionable work, and durable capture together", () => {
    const markup = renderToStaticMarkup(
      createElement(InboxExperience, {
        capturedWork: createElement(
          "section",
          null,
          "Server-saved captured work",
        ),
        initialArea: "captured",
      }),
    );

    expect(markup).toContain("Sample Email");
    expect(markup).toContain("Workspace Actionable");
    expect(markup).toContain("Captured work");
    expect(markup).toContain("Server-saved captured work");
    expect(markup).toContain('data-layout="full-width"');
  });
});
