import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
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
  const browserName = page.context().browser()?.browserType().name() ?? "none";
  const today = new Date().toISOString().slice(0, 10);
  const unreviewed = results.incomplete.filter((finding) => {
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
  expect(summarizeFindings(unreviewed)).toEqual([]);
}
