import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readFile, rm } from "node:fs/promises";

const webOrigin = "http://127.0.0.1:3200";
const originalPassword = "Live-e2e-owner-password-1";
const replacementPassword = "Live-e2e-owner-password-2";
const inviteePassword = "Live-e2e-invitee-password-1";

interface MailRecord {
  message: { to: string; subject: string; text: string };
}

test.beforeAll(async () => {
  const file = requiredMailSink();
  await rm(file, { force: true });
});

test.afterAll(async () => {
  await rm(requiredMailSink(), { force: true });
});

test("live identity, onboarding, invitation, revocation, and recovery fail closed", async ({
  browser,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const ownerEmail = `owner-${suffix}@example.test`;
  const inviteeEmail = `invitee-${suffix}@example.test`;
  const organizationName = `Live E2E ${suffix}`;
  const workspaceName = `Operations ${suffix}`;

  const anonymous = await fetch(`${webOrigin}/app/portfolio`, {
    redirect: "manual",
  });
  expect(anonymous.status).toBeGreaterThanOrEqual(300);
  expect(anonymous.status).toBeLessThan(400);
  expect(anonymous.headers.get("location")).toContain("/sign-in");
  expect(await anonymous.text()).not.toContain("Northstar Apparel");

  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await signUpAndVerify(
    ownerPage,
    ownerContext,
    "Live Owner",
    ownerEmail,
    originalPassword,
    "/onboarding",
  );

  await ownerPage.goto("/sign-in?next=%2Fonboarding");
  await expectNoSeriousAccessibilityViolations(ownerPage);
  await submitSignIn(ownerPage, ownerEmail, "incorrect-test-password");
  await expect(ownerPage.getByRole("status")).toContainText(
    "Email or password is incorrect",
  );
  await submitSignIn(ownerPage, ownerEmail, originalPassword);
  await ownerPage.waitForURL("**/onboarding");

  await ownerPage.getByLabel("Organization name").fill(organizationName);
  await ownerPage.getByRole("button", { name: "Continue" }).click();
  await expect(
    ownerPage.getByRole("heading", { name: "Create your first Workspace" }),
  ).toBeVisible();
  await ownerPage.getByLabel("Workspace name").fill(workspaceName);
  await ownerPage.getByRole("button", { name: "Continue" }).click();
  await expect(
    ownerPage.getByRole("heading", { name: "Choose a starter Blueprint" }),
  ).toBeVisible();
  await ownerPage.getByRole("button", { name: "Continue" }).click();
  await ownerPage.getByRole("button", { name: "Create organization" }).click();
  await ownerPage.waitForURL("**/app/portfolio");

  const ownerSession = await browserJson(ownerPage, "/api/v1/session");
  expect(ownerSession.status).toBe(200);
  expect(ownerSession.body).toMatchObject({
    user: { email: ownerEmail, role: "owner" },
    organization: { name: organizationName, role: "owner" },
  });
  const organizationId = String(
    (ownerSession.body as { organizationId: string }).organizationId,
  );
  const inaccessibleWorkspace = await ownerPage.goto(
    `/app/workspaces/not-authorized-${suffix}`,
  );
  expect(inaccessibleWorkspace?.status()).toBe(404);
  await ownerPage.goto("/app/portfolio");

  const secondOwnerContext = await browser.newContext();
  const secondOwnerPage = await secondOwnerContext.newPage();
  await secondOwnerPage.goto("/sign-in");
  await submitSignIn(secondOwnerPage, ownerEmail, originalPassword);
  await secondOwnerPage.waitForURL("**/app/portfolio");
  const secondSession = await browserJson(secondOwnerPage, "/api/v1/session");
  expect(secondSession.body).toMatchObject({ organizationId });

  const sessions = await browserJson(ownerPage, "/api/web/sessions");
  expect(sessions.status).toBe(200);
  const otherSession = (
    sessions.body as Array<{ id: string; current: boolean }>
  ).find((session) => !session.current);
  expect(otherSession).toBeDefined();
  const revokedSession = await browserJson(
    ownerPage,
    `/api/web/sessions/${encodeURIComponent(otherSession!.id)}`,
    { method: "DELETE" },
  );
  expect(revokedSession.status).toBe(200);
  expect((await browserJson(secondOwnerPage, "/api/v1/session")).status).toBe(
    401,
  );
  await secondOwnerContext.close();

  await ownerPage.goto("/app/account/invitations");
  await expectNoSeriousAccessibilityViolations(ownerPage);
  await ownerPage
    .getByRole("textbox", { name: "Email", exact: true })
    .fill(inviteeEmail);
  await ownerPage.getByLabel("Organization role").selectOption("member");
  await ownerPage.getByRole("button", { name: "Send invitation" }).click();
  await expect(ownerPage.getByRole("status")).toContainText(
    `Invitation sent to ${inviteeEmail}`,
  );
  const invitationUrl = await waitForMailAction(
    inviteeEmail,
    "You are invited to TREVV",
  );

  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();
  const invitationLanding = await normalizeMailAction(
    inviteeContext,
    invitationUrl,
  );
  await inviteePage.goto(invitationLanding);
  await inviteePage.waitForURL("**/sign-in?next=**");
  await inviteePage.getByRole("link", { name: "Create an account" }).click();
  await signUpAndVerify(
    inviteePage,
    inviteeContext,
    "Live Invitee",
    inviteeEmail,
    inviteePassword,
    "/invite/accept?resume=1",
    false,
  );
  await inviteePage.waitForURL("**/sign-in?next=**");
  await submitSignIn(inviteePage, inviteeEmail, inviteePassword);
  await inviteePage.waitForURL("**/app/portfolio");
  const inviteeSession = await browserJson(inviteePage, "/api/v1/session");
  expect(inviteeSession.status).toBe(200);
  expect(inviteeSession.body).toMatchObject({
    organizationId,
    user: { email: inviteeEmail, role: "member" },
  });

  const memberships = await browserJson(ownerPage, "/api/v1/memberships");
  const inviteeMembership = (
    memberships.body as Array<{
      user: { id: string; email: string };
      active: boolean;
    }>
  ).find((membership) => membership.user.email === inviteeEmail);
  expect(inviteeMembership).toMatchObject({ active: true });
  const removal = await browserJson(
    ownerPage,
    `/api/v1/memberships/${encodeURIComponent(inviteeMembership!.user.id)}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "idempotency-key": crypto.randomUUID(),
      },
      body: JSON.stringify({ active: false }),
    },
  );
  expect(removal.status).toBe(200);
  expect(removal.body).toMatchObject({ active: false });
  const removedSession = await browserJson(inviteePage, "/api/v1/session");
  expect(removedSession.status).toBe(403);
  expect(removedSession.body).toMatchObject({
    error: { code: "identity_access_unavailable" },
  });
  await inviteeContext.close();

  await ownerPage.goto("/forgot-password");
  await expectNoSeriousAccessibilityViolations(ownerPage);
  await ownerPage.getByLabel("Email").fill(ownerEmail);
  await ownerPage.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    ownerPage.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
  const resetUrl = await waitForMailAction(
    ownerEmail,
    "Reset your TREVV password",
  );
  const resetLanding = await normalizeMailAction(ownerContext, resetUrl);
  await ownerPage.goto(resetLanding);
  await ownerPage
    .getByLabel("New password", { exact: true })
    .fill(replacementPassword);
  await ownerPage.getByLabel("Confirm new password").fill(replacementPassword);
  await ownerPage.getByRole("button", { name: "Reset password" }).click();
  await ownerPage.waitForURL("**/sign-in?reset=1");
  await submitSignIn(ownerPage, ownerEmail, originalPassword);
  await expect(ownerPage.getByRole("status")).toContainText(
    "Email or password is incorrect",
  );
  await submitSignIn(ownerPage, ownerEmail, replacementPassword);
  await ownerPage.waitForURL("**/app/portfolio");
  expect((await browserJson(ownerPage, "/api/v1/session")).body).toMatchObject({
    organizationId,
  });

  const replayContext = await browser.newContext();
  const replayPage = await replayContext.newPage();
  const replayLanding = await normalizeMailAction(replayContext, resetUrl);
  await replayPage.goto(replayLanding);
  await expect(
    replayPage.getByRole("button", { name: "Reset password" }),
  ).toBeDisabled();
  await expect(replayPage.getByRole("status")).toContainText(
    "invalid, expired, or has already been used",
  );
  await replayContext.close();
  await ownerContext.close();
});

async function signUpAndVerify(
  page: Page,
  context: BrowserContext,
  name: string,
  email: string,
  password: string,
  returnTo: string,
  navigate = true,
) {
  if (navigate) {
    await page.goto(`/sign-up?next=${encodeURIComponent(returnTo)}`);
    await expectNoSeriousAccessibilityViolations(page);
  }
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/verify-email?**");
  const verificationUrl = await waitForMailAction(
    email,
    "Verify your TREVV email",
  );
  const callback = await normalizeMailAction(context, verificationUrl);
  const verificationResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/web/verify-email",
    { timeout: 20_000 },
  );
  await page.goto(callback);
  const response = await verificationResponse;
  if (response.status() !== 200) {
    const verificationHeaders = await response.request().allHeaders();
    throw new Error(
      `Email verification failed with HTTP ${response.status()} (${JSON.stringify(
        {
          origin: verificationHeaders.origin,
          referer: verificationHeaders.referer,
          secFetchSite: verificationHeaders["sec-fetch-site"],
        },
      )})`,
    );
  }
  await page.waitForURL((url) => url.pathname !== "/verify-email");
}

async function submitSignIn(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function browserJson(
  page: Page,
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<{ status: number; body: unknown }> {
  return page.evaluate(
    async ({ requestPath, requestInit }) => {
      const response = await fetch(requestPath, {
        ...requestInit,
        credentials: "same-origin",
        cache: "no-store",
      });
      return {
        status: response.status,
        body: await response.json().catch(() => null),
      };
    },
    { requestPath: path, requestInit: init },
  );
}

async function waitForMailAction(email: string, subject: string) {
  let action: string | null = null;
  await expect
    .poll(
      async () => {
        const messages = await readMail();
        const record = messages
          .toReversed()
          .find(
            ({ message }) =>
              message.to === email && message.subject === subject,
          );
        action = record?.message.text.match(/https?:\/\/\S+/u)?.[0] ?? null;
        return action === null ? "waiting" : "received";
      },
      { timeout: 15_000 },
    )
    .toBe("received");
  if (!action)
    throw new Error(`The test mail sink did not receive ${subject}.`);
  return action;
}

async function readMail(): Promise<MailRecord[]> {
  try {
    const lines = (await readFile(requiredMailSink(), "utf8"))
      .split("\n")
      .filter(Boolean);
    return lines.map((line) => JSON.parse(line) as MailRecord);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function normalizeMailAction(
  context: BrowserContext,
  actionUrl: string,
): Promise<string> {
  let current = new URL(actionUrl);
  if (current.origin !== webOrigin) {
    const response = await fetch(current, { redirect: "manual" });
    const location = response.headers.get("location");
    if (!location)
      throw new Error("The mail action did not return a callback.");
    current = new URL(location, current);
  }
  if (current.origin === webOrigin && current.searchParams.has("token")) {
    const response = await fetch(current, { redirect: "manual" });
    const cookie = response.headers.get("set-cookie");
    const location = response.headers.get("location");
    if (!cookie || !location)
      throw new Error("The Web boundary did not normalize the action token.");
    await installActionCookie(context, cookie);
    current = new URL(location, current);
  }
  return `${current.pathname}${current.search}`;
}

async function installActionCookie(context: BrowserContext, header: string) {
  const segments = header.split(";").map((part) => part.trim());
  const [name, ...valueParts] = (segments[0] ?? "").split("=");
  const value = valueParts.join("=");
  const path =
    segments
      .find((segment) => segment.toLowerCase().startsWith("path="))
      ?.slice(5) ?? "/";
  if (!name || !value) throw new Error("The action cookie was invalid.");
  await context.addCookies([
    {
      name,
      value,
      domain: "127.0.0.1",
      path,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

function requiredMailSink(): string {
  const value = process.env.LIVE_E2E_MAIL_SINK_FILE?.trim();
  if (!value) throw new Error("LIVE_E2E_MAIL_SINK_FILE is not configured.");
  return value;
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations
      .filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? ""),
      )
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.map((node) => node.target.join(" ")),
      })),
  ).toEqual([]);
}
