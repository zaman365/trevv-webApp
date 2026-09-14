import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import reviewPolicy from "../../config/live-axe-incomplete-reviews.json";

const wcagTags: string[] = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
];

type AxeFinding = {
  id: string;
  impact?: string | null;
  nodes: Array<{
    target: unknown[];
    failureSummary?: string;
  }>;
};

const summarizeFindings = (findings: AxeFinding[]) =>
  findings.map((finding) => ({
    id: finding.id,
    impact: finding.impact,
    nodeCount: finding.nodes.length,
    nodes: finding.nodes.slice(0, 12).map((node) => ({
      target: node.target.map(String).join(" "),
      failureSummary: node.failureSummary,
    })),
  }));

/**
 * Live pages contain durable, tenant-specific records, so their Axe results
 * cannot truthfully reuse the demo suite's static selector fingerprints.
 * Violations always fail. An incomplete result is accepted only when a live
 * PostgreSQL-backed run produced an exact, owned, unexpired fingerprint for
 * this semantic surface and browser engine; every unlisted delta fails.
 */
export async function expectNoLiveWcagFindings(page: Page, surface: string) {
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();

  expect(summarizeFindings(results.violations)).toEqual([]);
  // A compact dashboard can put real text below an inner scroll viewport.
  // Bring only those obscured nodes into view and measure their actual contrast
  // before consulting the review register. A missing/skipped measurement is
  // still incomplete; a measured violation still fails immediately.
  const remainingIncomplete = [];
  for (const finding of results.incomplete) {
    const remainingNodes = [];
    for (const node of finding.nodes) {
      const selector = node.target[0];
      const canMeasureAfterScrolling =
        surface.startsWith("visual-dashboard-") &&
        finding.id === "color-contrast" &&
        node.target.length === 1 &&
        typeof selector === "string" &&
        node.any.length > 0 &&
        node.any.every(
          (check) => check.data?.messageKey === "elmPartiallyObscured",
        );
      if (canMeasureAfterScrolling) {
        const element = page.locator(selector);
        if ((await element.count()) === 1 && (await element.isVisible())) {
          await element.evaluate((target) =>
            target.scrollIntoView({ block: "center", inline: "nearest" }),
          );
          const measured = await new AxeBuilder({ page })
            .include(selector)
            .withRules(["color-contrast"])
            .analyze();
          expect(summarizeFindings(measured.violations)).toEqual([]);
          if (
            measured.incomplete.length === 0 &&
            measured.passes.some(
              (result) => result.id === "color-contrast" && result.nodes.length,
            )
          )
            continue;
        }
      }
      remainingNodes.push(node);
    }
    if (remainingNodes.length)
      remainingIncomplete.push({ ...finding, nodes: remainingNodes });
  }
  const browserName = page.context().browser()?.browserType().name() ?? "none";
  const today = new Date().toISOString().slice(0, 10);
  const unreviewed = remainingIncomplete.filter((finding) => {
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
    return !reviewPolicy.fingerprints.some(
      (candidate) =>
        reviewPolicy.status === "accepted_deferred" &&
        reviewPolicy.expiresOn >= today &&
        candidate.surfaces.includes(surface) &&
        candidate.browsers.includes(browserName) &&
        candidate.ruleId === finding.id &&
        candidate.nodeCount === finding.nodes.length &&
        candidate.sha256 === fingerprint,
    );
  });
  if (unreviewed.length > 0) {
    await test.info().attach(`${surface}-unreviewed-accessibility`, {
      body: Buffer.from(JSON.stringify(unreviewed, null, 2)),
      contentType: "application/json",
    });
    const screenshotPath = test.info().outputPath(`${surface}-full-page.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await test.info().attach(`${surface}-full-page`, {
      path: screenshotPath,
      contentType: "image/png",
    });
  }
  expect(summarizeFindings(unreviewed)).toEqual([]);
}
