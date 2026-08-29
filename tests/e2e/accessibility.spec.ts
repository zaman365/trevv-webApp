import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  boardRoute,
  gotoCanonical,
  STAKEHOLDER_WORKSPACE,
  workspaceHome,
  workspaceRoute,
} from "./routes";

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
  "/app/portfolio",
  workspaceHome(),
  workspaceRoute("dashboard"),
  workspaceRoute("attention"),
  workspaceRoute("waiting"),
  workspaceRoute("decisions"),
  workspaceRoute("messages"),
  workspaceRoute("teams"),
  workspaceRoute("blueprints"),
  boardRoute(),
  `${workspaceHome(STAKEHOLDER_WORKSPACE)}/stakeholder`,
] as const;

for (const route of routes) {
  test(`${route} has no serious automated accessibility violations`, async ({
    page,
  }) => {
    await gotoCanonical(page, route);
    // Wait for the page's own landmark rather than networkidle, so Axe
    // never audits a shell that has not rendered its content yet. Some
    // pages hide their heading at mobile widths, so assert the landmark
    // has real content instead of requiring an h1.
    const main = page.locator("main");
    await expect(main).toBeVisible();
    await expect(main).not.toBeEmpty();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(seriousViolations(results.violations)).toEqual([]);
  });
}

test("item detail panel has no serious automated accessibility violations", async ({
  page,
}) => {
  await gotoCanonical(page, boardRoute());
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

test("primary actions keep AA contrast when enabled and in either theme", async ({
  page,
}) => {
  await gotoCanonical(page, workspaceRoute("reviews"));
  const primaryAction = page.locator(".primary-button:visible").first();
  await expect(primaryAction).toBeEnabled();
  await primaryAction.evaluate((element) => {
    element.setAttribute("data-contrast-probe", "");
  });

  expect(
    await primaryAction.evaluate(
      (element) => getComputedStyle(element).transitionProperty,
    ),
  ).toBe("transform");

  for (const theme of ["light", "dark"] as const) {
    await page.locator("html").evaluate((element, nextTheme) => {
      element.dataset.theme = nextTheme;
    }, theme);
    const results = await new AxeBuilder({ page })
      .include("[data-contrast-probe]")
      .withRules(["color-contrast"])
      .analyze();
    expect(seriousViolations(results.violations)).toEqual([]);
  }
});
