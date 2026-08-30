import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import incompleteReviewPolicy from "../../config/axe-incomplete-reviews.json";
import { themePreferenceCookie } from "../../apps/web/lib/display-preferences";
import {
  boardRoute,
  gotoCanonical,
  STAKEHOLDER_WORKSPACE,
  workspaceHome,
  workspaceRoute,
} from "./routes";

const wcagViolations = (
  violations: Array<{
    id: string;
    impact: string | null;
    nodes: Array<{ target: string[] }>;
  }>,
) =>
  violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodeCount: violation.nodes.length,
    targets: violation.nodes.slice(0, 12).map((node) => node.target.join(" ")),
  }));

type AxeFinding = Parameters<typeof wcagViolations>[0][number];

const unreviewedIncomplete = (
  route: string,
  theme: "light" | "dark",
  projectName: string,
  findings: AxeFinding[],
) => {
  const today = new Date().toISOString().slice(0, 10);
  return findings.flatMap((finding) => {
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          id: finding.id,
          impact: finding.impact,
          targets: finding.nodes
            .map((node) => node.target.map(String).join(" "))
            .sort(),
        }),
      )
      .digest("hex");
    const review = incompleteReviewPolicy.fingerprints.find(
      (candidate) =>
        candidate.ruleId === finding.id &&
        incompleteReviewPolicy.status === "accepted_deferred" &&
        incompleteReviewPolicy.expiresOn >= today &&
        candidate.themes.includes(theme) &&
        candidate.projects.includes(projectName) &&
        candidate.routes.includes(route) &&
        candidate.nodeCount === finding.nodes.length &&
        candidate.sha256 === fingerprint,
    );
    return review
      ? []
      : [
          {
            id: finding.id,
            impact: finding.impact,
            nodeCount: finding.nodes.length,
            targets: finding.nodes
              .slice(0, 12)
              .map((node) => node.target.join(" ")),
            sha256: fingerprint,
          },
        ];
  });
};

const routes = [
  "/sign-in",
  "/privacy",
  "/terms",
  "/onboarding",
  "/app/portfolio",
  "/app/account/privacy",
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
  test(`${route} has no WCAG A/AA violations and keeps dark-theme contrast`, async ({
    context,
    page,
  }, testInfo) => {
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
    expect(wcagViolations(results.violations)).toEqual([]);
    expect(
      unreviewedIncomplete(
        route,
        "light",
        testInfo.project.name,
        results.incomplete,
      ),
    ).toEqual([]);

    await context.addCookies([
      {
        name: themePreferenceCookie,
        value: "dark",
        url: new URL("/", page.url()).href,
      },
    ]);
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const darkContrast = await new AxeBuilder({ page })
      .withRules(["color-contrast"])
      .analyze();
    expect(wcagViolations(darkContrast.violations)).toEqual([]);
    expect(
      unreviewedIncomplete(
        route,
        "dark",
        testInfo.project.name,
        darkContrast.incomplete,
      ),
    ).toEqual([]);
  });
}

test("item detail panel has no automated WCAG A/AA violations", async ({
  page,
}, testInfo) => {
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
  expect(wcagViolations(results.violations)).toEqual([]);
  expect(
    unreviewedIncomplete(
      `${boardRoute()}#item-panel`,
      "light",
      testInfo.project.name,
      results.incomplete,
    ),
  ).toEqual([]);
});

test("primary actions keep AA contrast when enabled and in either theme", async ({
  page,
}, testInfo) => {
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
    expect(wcagViolations(results.violations)).toEqual([]);
    expect(
      unreviewedIncomplete(
        `${workspaceRoute("reviews")}#primary-action`,
        theme,
        testInfo.project.name,
        results.incomplete,
      ),
    ).toEqual([]);
  }
});
