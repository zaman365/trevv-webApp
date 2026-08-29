import { expect, type Page } from "@playwright/test";

/**
 * Canonical demo fixtures. Modules live under a workspace since the
 * portfolio/workspace IA landed, so tests address them through these
 * helpers instead of repeating the slug.
 */
export const DEMO_WORKSPACE = "northstar-apparel";
export const STAKEHOLDER_WORKSPACE = "localreach";
export const DEMO_BOARD = "b-northstar-launch";

export const workspaceHome = (slug: string = DEMO_WORKSPACE) =>
  `/app/workspaces/${slug}`;

export const workspaceRoute = (view: string, slug: string = DEMO_WORKSPACE) =>
  `${workspaceHome(slug)}/${view}`;

export const boardRoute = (
  board: string = DEMO_BOARD,
  slug: string = DEMO_WORKSPACE,
) => `${workspaceHome(slug)}/boards/${board}`;

const escapeForRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Navigate and prove we stayed on the requested route.
 *
 * Obsolete flat routes used to redirect to Portfolio, which made a test
 * that only checked for a landmark pass while auditing the wrong page.
 * Asserting the landing URL keeps that class of false positive out.
 */
export async function gotoCanonical(page: Page, route: string) {
  const current = page.url().startsWith("http") ? new URL(page.url()) : null;
  const target = current ? new URL(route, current) : null;
  const isFragmentNavigation =
    current &&
    target &&
    current.origin === target.origin &&
    current.pathname === target.pathname &&
    current.search === target.search &&
    current.hash !== target.hash;

  if (isFragmentNavigation) {
    // A second Page.navigate to the same Next.js document can race the first
    // navigation's hydration and restore its old fragment. Use the browser's
    // native same-document navigation so hash subscribers receive the change.
    await page.evaluate((href) => window.location.assign(href), target.href);
  } else {
    await page.goto(route);
  }
  await expect(page).toHaveURL(
    new RegExp(`${escapeForRegExp(route)}(?:[?#].*)?$`),
  );
}
