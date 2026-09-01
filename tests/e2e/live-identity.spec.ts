import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readFile, rm } from "node:fs/promises";
import { expectNoLiveWcagFindings } from "./live-accessibility";

const webOrigin = "http://127.0.0.1:3200";
const originalPassword = "Live-e2e-owner-password-1";
const replacementPassword = "Live-e2e-owner-password-2";
const inviteePassword = "Live-e2e-invitee-password-1";
const registrationBootstrapSecret =
  "live-e2e-registration-bootstrap-secret-only";

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

test("a terminal invitation failure offers a safe account-recovery path", async ({
  browser,
}) => {
  const context = await browser.newContext({
    extraHTTPHeaders: clientHeaders(99),
  });
  const page = await context.newPage();
  let signOutRequests = 0;

  await page.route("**/api/web/readyz", (route) =>
    route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({ status: "ready", mode: "live", api: "ready" }),
    }),
  );
  await page.route("**/api/web/invitations/accept", (route) =>
    route.fulfill({
      contentType: "application/json",
      status: 404,
      body: JSON.stringify({
        error: "This invitation is invalid, expired, revoked, or already used.",
      }),
    }),
  );
  await page.route("**/api/web/sign-out", (route) => {
    signOutRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({ success: true }),
    });
  });

  await page.goto("/invite/accept?resume=1");
  await expect(
    page.getByRole("heading", { name: "Invitation unavailable" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "invalid, expired, revoked, or already used",
  );
  await expect(
    page.getByText("Ask the Workspace owner to send a replacement invitation"),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Sign out and switch account" })
    .click();
  await page.waitForURL("**/sign-in");
  expect(new URL(page.url()).search).toBe("");
  expect(signOutRequests).toBe(1);
  await context.close();
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
    headers: clientHeaders(100),
    redirect: "manual",
  });
  expect(anonymous.status).toBeGreaterThanOrEqual(300);
  expect(anonymous.status).toBeLessThan(400);
  expect(anonymous.headers.get("location")).toContain("/sign-in");
  expect(await anonymous.text()).not.toContain("Northstar Apparel");

  const ownerContext = await browser.newContext({
    extraHTTPHeaders: {
      ...clientHeaders(101),
      "x-trevv-test-registration-bootstrap": registrationBootstrapSecret,
    },
  });
  const ownerPage = await ownerContext.newPage();
  await signUpAndVerify(
    ownerPage,
    ownerContext,
    "Live Owner",
    ownerEmail,
    originalPassword,
    "/onboarding",
    true,
    true,
  );

  await ownerPage.goto("/sign-in?next=%2Fonboarding");
  await expect(ownerPage.locator(".auth-mini-portfolio")).toHaveCount(0);
  await expect(ownerPage.getByText("Northstar Apparel")).toHaveCount(0);
  await expect(ownerPage.getByText("MealFlow")).toHaveCount(0);
  await expect(ownerPage.getByText("LocalReach")).toHaveCount(0);
  await expectNoLiveWcagFindings(ownerPage, "sign-in");
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

  await ownerPage.goto("/app/account/privacy");
  await expectNoLiveWcagFindings(ownerPage, "privacy-center");
  await expect(
    ownerPage.getByRole("heading", { name: "Privacy center", level: 1 }),
  ).toBeVisible();
  await expect(ownerPage.getByText(/not enforced/).first()).toBeVisible();
  const privacyRequestForm = ownerPage.getByRole("region", {
    name: "Submit a privacy request",
  });
  await privacyRequestForm
    .locator("select")
    .first()
    .selectOption("portability");
  await privacyRequestForm
    .getByRole("button", { name: "Submit for review" })
    .click();
  await expect(
    ownerPage.getByRole("status").filter({
      hasText:
        "No export, erasure, restriction, or provider effect has happened yet.",
    }),
  ).toBeVisible();
  await expect(
    ownerPage.getByRole("heading", { name: "Portable export", level: 3 }),
  ).toBeVisible();
  await ownerPage.getByRole("button", { name: "Cancel" }).click();
  await expect(
    ownerPage
      .getByRole("status")
      .filter({ hasText: "Cancellation recorded durably." }),
  ).toBeVisible();

  const secondOwnerContext = await browser.newContext({
    extraHTTPHeaders: clientHeaders(102),
  });
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
  await expectNoLiveWcagFindings(ownerPage, "invitations");
  await ownerPage
    .getByRole("textbox", { name: "Email", exact: true })
    .fill(inviteeEmail);
  await ownerPage.getByLabel("Organization role").selectOption("member");
  await ownerPage
    .getByLabel("Workspace access")
    .selectOption({ label: workspaceName });
  await ownerPage.getByRole("button", { name: "Send invitation" }).click();
  await expect(ownerPage.getByRole("status")).toContainText(
    `Invitation sent to ${inviteeEmail}`,
  );
  const invitationUrl = await waitForMailAction(
    inviteeEmail,
    "You are invited to TREVV",
  );

  const invitationRegistrationContext = await browser.newContext({
    extraHTTPHeaders: clientHeaders(103),
  });
  const invitationRegistrationPage =
    await invitationRegistrationContext.newPage();
  const invitationLanding = await normalizeMailAction(
    invitationRegistrationContext,
    invitationUrl,
  );
  await invitationRegistrationPage.goto(invitationLanding);
  await invitationRegistrationPage.waitForURL("**/sign-in?next=**");
  await invitationRegistrationPage
    .getByRole("link", { name: "Create invited account" })
    .click();
  const inviteeVerificationUrl = await submitSignUp(
    invitationRegistrationPage,
    "Live Invitee",
    inviteeEmail,
    inviteePassword,
    "/invite/accept?resume=1",
    false,
  );

  // Registration durably binds the invitation to the new identity. Email
  // verification and acceptance must therefore survive a different browser
  // with none of the scoped raw-token cookies from the invitation link.
  await invitationRegistrationContext.clearCookies();
  expect(await invitationCookies(invitationRegistrationContext)).toEqual([]);
  await invitationRegistrationContext.close();

  const inviteeContext = await browser.newContext({
    extraHTTPHeaders: clientHeaders(104),
  });
  const inviteePage = await inviteeContext.newPage();
  expect(await invitationCookies(inviteeContext)).toEqual([]);
  const anonymousClaimRecovery = inviteePage.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/web/invitations/accept" &&
      response.request().method() === "POST",
    { timeout: 20_000 },
  );
  await verifyEmailAction(inviteePage, inviteeContext, inviteeVerificationUrl);
  expect((await anonymousClaimRecovery).status()).toBe(401);
  await inviteePage.waitForURL("**/sign-in?next=**");
  expect(await invitationCookies(inviteeContext)).toEqual([]);
  const authenticatedClaimRecovery = inviteePage.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/web/invitations/accept" &&
      response.request().method() === "POST" &&
      response.status() === 200,
    { timeout: 20_000 },
  );
  await submitSignIn(inviteePage, inviteeEmail, inviteePassword);
  expect((await authenticatedClaimRecovery).status()).toBe(200);
  await inviteePage.waitForURL("**/app/portfolio");
  const inviteeSession = await browserJson(inviteePage, "/api/v1/session");
  expect(inviteeSession.status).toBe(200);
  expect(inviteeSession.body).toMatchObject({
    organizationId,
    user: { email: inviteeEmail, role: "member" },
  });
  await expect(
    inviteePage.getByRole("link", { name: new RegExp(workspaceName) }),
  ).toBeVisible();

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
  await expectNoLiveWcagFindings(ownerPage, "forgot-password");
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

  const replayContext = await browser.newContext({
    extraHTTPHeaders: clientHeaders(105),
  });
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

  await ownerPage.goto("/app/account/sessions");
  await ownerPage.evaluate(() => {
    window.localStorage.setItem(
      "trevv:live-draft:v1:private-org:private-user:message%3Aprivate-room",
      "confidential recoverable draft",
    );
    window.localStorage.setItem(
      "trevv:messages-layout:v1:private-org:private-user:workspace",
      "272",
    );
  });
  await ownerPage
    .getByRole("button", { name: "Sign out this browser" })
    .click();
  await ownerPage.waitForURL("**/sign-in?signedOut=1");
  await expect(
    ownerPage.evaluate(() => ({
      draft: window.localStorage.getItem(
        "trevv:live-draft:v1:private-org:private-user:message%3Aprivate-room",
      ),
      preference: window.localStorage.getItem(
        "trevv:messages-layout:v1:private-org:private-user:workspace",
      ),
    })),
  ).resolves.toEqual({ draft: null, preference: "272" });
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
  bootstrapRegistration = false,
) {
  const verificationUrl = await submitSignUp(
    page,
    name,
    email,
    password,
    returnTo,
    navigate,
    bootstrapRegistration,
  );
  await verifyEmailAction(page, context, verificationUrl);
}

async function submitSignUp(
  page: Page,
  name: string,
  email: string,
  password: string,
  returnTo: string,
  navigate = true,
  bootstrapRegistration = false,
): Promise<string> {
  if (navigate) {
    await page.goto(`/sign-up?next=${encodeURIComponent(returnTo)}`);
    await expectNoLiveWcagFindings(page, "sign-up");
  }
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  if (bootstrapRegistration) {
    await page.route("**/api/auth/sign-up/email", (route) =>
      route.continue({
        headers: {
          ...route.request().headers(),
          "x-trevv-test-registration-bootstrap": registrationBootstrapSecret,
        },
      }),
    );
  }
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/verify-email?**");
  if (bootstrapRegistration) await page.unroute("**/api/auth/sign-up/email");
  const verificationUrl = await waitForMailAction(
    email,
    "Verify your TREVV email",
  );
  return verificationUrl;
}

async function verifyEmailAction(
  page: Page,
  context: BrowserContext,
  verificationUrl: string,
) {
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

async function invitationCookies(context: BrowserContext) {
  const names = new Set([
    "trevv.pending_invitation",
    "trevv.registration_invitation",
  ]);
  return (await context.cookies()).filter((cookie) => names.has(cookie.name));
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
    const response = await fetch(current, {
      headers: clientHeaders(199),
      redirect: "manual",
    });
    const location = response.headers.get("location");
    if (!location)
      throw new Error("The mail action did not return a callback.");
    current = new URL(location, current);
  }
  if (current.origin === webOrigin && current.searchParams.has("token")) {
    const response = await fetch(current, {
      headers: clientHeaders(199),
      redirect: "manual",
    });
    const cookies = setCookieValues(response.headers);
    const location = response.headers.get("location");
    if (!cookies.length || !location)
      throw new Error("The Web boundary did not normalize the action token.");
    for (const cookie of cookies) await installActionCookie(context, cookie);
    current = new URL(location, current);
  }
  return `${current.pathname}${current.search}`;
}

function setCookieValues(headers: Headers): string[] {
  const values = headers.getSetCookie?.() ?? [];
  if (values.length) return values;
  const combined = headers.get("set-cookie");
  return combined
    ? combined.split(/,(?=\s*[^;,=\s]+=[^;,]*)/u).map((value) => value.trim())
    : [];
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

function clientHeaders(lastOctet: number): Record<string, string> {
  const projectSubnet = test.info().project.name.includes("webkit") ? 10 : 0;
  const retrySubnet = test.info().retry * 20;
  return {
    "x-trevv-client-ip": `10.200.${projectSubnet + retrySubnet}.${lastOctet}`,
  };
}
