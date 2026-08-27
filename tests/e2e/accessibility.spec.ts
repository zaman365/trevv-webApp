import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const seriousViolations = (
  violations: Array<{
    id: string;
    impact: string | null;
    nodes: Array<{ target: string[] }>;
  }>,
) =>
  violations
    .filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    )
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodeCount: violation.nodes.length,
      targets: violation.nodes
        .slice(0, 12)
        .map((node) => node.target.join(" ")),
    }));

const routes = [
  "/sign-in",
  "/onboarding",
  "/app/home",
  "/app/portfolio",
  "/app/dashboard",
  "/app/attention",
  "/app/waiting",
  "/app/hubs/northstar-apparel",
  "/app/hubs/northstar-apparel/boards/b-northstar-launch",
  "/app/hubs/localreach/stakeholder",
  "/app/decisions",
  "/app/messages",
  "/app/blueprints",
] as const;

for (const route of routes) {
  test(`${route} has no serious automated accessibility violations`, async ({
    page,
  }) => {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(seriousViolations(results.violations)).toEqual([]);
  });
}

test("item detail panel has no serious automated accessibility violations", async ({
  page,
}) => {
  await page.goto("/app/hubs/northstar-apparel/boards/b-northstar-launch");
  const panel = page.getByRole("complementary", {
    name: "Choose storefront launch offer",
  });
  if (!(await panel.isVisible())) {
    await page
      .getByRole("button", {
        name: "Choose storefront launch offer",
        exact: true,
      })
      .click();
  }
  const results = await new AxeBuilder({ page })
    .include(".item-panel")
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();
  expect(seriousViolations(results.violations)).toEqual([]);
});
