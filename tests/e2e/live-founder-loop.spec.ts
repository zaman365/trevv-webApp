import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { promisify } from "node:util";

const webOrigin = "http://127.0.0.1:3200";
const password = "Live-founder-loop-password-1";
const collaboratorPassword = "Live-collaborator-password-1";
const suffix = crypto.randomUUID().slice(0, 8);
const ownerEmail = `loop-owner-${suffix}@example.test`;
const collaboratorEmail = `loop-collaborator-${suffix}@example.test`;
const organizationName = `Founder Loop ${suffix}`;
const workspaceName = `Operating Loop ${suffix}`;
const workspaceSlug = `operating-loop-${suffix}`;
const capturedTitle = `Recoverable capture ${suffix}`;
const decisionTitle = `Choose launch channel ${suffix}`;
const approvalTitle = `Approve launch budget ${suffix}`;
const execFileAsync = promisify(execFile);

let organizationId = "";
let workspaceId = "";
let boardId = "";
let capturedItemId = "";
let ownerUserId = "";

interface MailRecord {
  message: { to: string; subject: string; text: string };
}

test.describe.serial("live founder operating loop", () => {
  test.beforeAll(async () => {
    await rm(requiredMailSink(), { force: true });
  });

  test.afterAll(async () => {
    await rm(requiredMailSink(), { force: true });
  });

  test("persists capture through evidence-backed resolution and weekly memory", async ({
    browser,
  }) => {
    test.setTimeout(360_000);
    const context = await browser.newContext({
      extraHTTPHeaders: clientHeaders(111),
    });
    const page = await context.newPage();

    await signUpAndVerify(
      page,
      context,
      "Founder Loop Owner",
      ownerEmail,
      password,
    );
    await submitSignIn(page, ownerEmail, password);
    await page.waitForURL("**/onboarding");
    await completeOnboarding(page);
    await expect(page.getByTestId("live-portfolio")).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);

    const session = await browserJson(page, "/api/v1/session");
    expect(session.status).toBe(200);
    const ownerSession = session.body as {
      organizationId: string;
      user: { id: string };
    };
    organizationId = String(ownerSession.organizationId);
    ownerUserId = ownerSession.user.id;

    await page.getByTestId("create-workspace-open").click();
    const workspaceDialog = page.getByTestId("create-workspace-dialog");
    await workspaceDialog.getByLabel("Name").fill(workspaceName);
    await workspaceDialog
      .getByLabel("Current priority")
      .fill("Close the founder operating loop");
    await workspaceDialog
      .getByRole("button", { name: "Create workspace" })
      .click();
    await expect(
      page.getByText(`Server confirmed “${workspaceName}”`),
    ).toBeVisible();
    await page.getByRole("link", { name: "Open workspace" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/app/workspaces/${workspaceSlug}$`),
    );
    await expect(page.getByTestId("live-workspace-overview")).toBeVisible();

    const workspaceRecords = await browserJson(page, "/api/v1/workspaces");
    const workspace = (
      workspaceRecords.body as Array<{ id: string; slug: string }>
    ).find((record) => record.slug === workspaceSlug);
    expect(workspace).toBeDefined();
    workspaceId = workspace!.id;
    const boardRecords = await browserJson(
      page,
      `/api/v1/boards?workspaceId=${encodeURIComponent(workspaceId)}`,
    );
    const firstBoard = (boardRecords.body as Array<{ id: string }>)[0];
    expect(firstBoard).toBeDefined();
    boardId = firstBoard!.id;

    let simulatedLostResponse = false;
    await page.route("**/api/v1/inbox", async (route) => {
      if (route.request().method() === "POST" && !simulatedLostResponse) {
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        simulatedLostResponse = true;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });
    await page.keyboard.press("q");
    const capture = page.getByTestId("live-quick-capture");
    await capture.getByTestId("live-capture-title").fill(capturedTitle);
    await capture.getByLabel("Priority").selectOption("urgent");
    await capture.getByTestId("live-capture-submit").click();
    await expect(
      capture.locator(
        '[data-live-state="offline"], [data-live-state="terminal-error"]',
      ),
    ).toBeVisible();
    await expect(capture.getByTestId("live-capture-title")).toHaveValue(
      capturedTitle,
    );
    await page.unroute("**/api/v1/inbox");
    await capture.getByTestId("live-capture-submit").click();
    await expect(
      page.getByText(
        "The original server-confirmed result was recovered safely.",
      ),
    ).toBeVisible();

    const inboxResponse = await browserJson(page, "/api/v1/inbox");
    const inboxRecord = (
      inboxResponse.body as Array<{
        id: string;
        title: string;
        version: number;
        convertedItemId?: string;
      }>
    ).find((record) => record.title === capturedTitle);
    expect(inboxRecord).toBeDefined();
    capturedItemId = inboxRecord!.id;

    await page.goto(`/app/workspaces/${workspaceSlug}/inbox`);
    const inboxCard = page.getByTestId(`inbox-item-${capturedItemId}`);
    await expect(inboxCard).toContainText(capturedTitle);
    await inboxCard.getByRole("button", { name: "Mark done" }).click();
    await expect(page.getByTestId("inbox-undo")).toBeVisible();
    await page.getByTestId("inbox-undo").click();
    await expect(page.getByText(/Server confirmed undo/)).toBeVisible();
    await inboxCard
      .getByRole("button", { name: "Convert to WorkItem" })
      .click();
    await expect(page.getByText(/Server confirmed conversion/)).toBeVisible();

    const converted = await browserJson(page, "/api/v1/inbox");
    const convertedRecord = (
      converted.body as Array<{ id: string; convertedItemId?: string }>
    ).find((record) => record.id === capturedItemId);
    expect(convertedRecord?.convertedItemId).toBe(capturedItemId);
    const canonicalItem = await browserJson(
      page,
      `/api/v1/items/${encodeURIComponent(capturedItemId)}`,
    );
    expect(canonicalItem.status).toBe(200);
    expect(canonicalItem.body).toMatchObject({
      id: capturedItemId,
      title: capturedTitle,
      workspaceId,
      boardId,
    });

    await page.goto(
      `/app/workspaces/${workspaceSlug}/boards/${encodeURIComponent(boardId)}`,
    );
    await expect(page.getByTestId("live-board")).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
    await page.getByRole("button", { name: capturedTitle }).click();
    const detail = page.getByTestId("work-item-detail");
    await detail.getByTestId(`assign-item-${capturedItemId}`).click();
    await expect(
      page.getByText(/Assignment to Founder Loop Owner is durable/),
    ).toBeVisible();
    await detail
      .getByLabel("Reason or follow-up note")
      .fill("Waiting on the signed launch terms");
    await detail.getByTestId(`block-item-${capturedItemId}`).click();
    await expect(
      page.getByText(/Attention recomputation is queued/),
    ).toBeVisible();
    await detail
      .getByLabel("Reason or follow-up note")
      .fill("Launch partner confirmation");
    const followUp = detail.getByLabel("Next follow-up");
    if (await followUp.count()) {
      await followUp.fill(todayDate());
    }
    await detail.getByTestId(`waiting-item-${capturedItemId}`).click();
    await expect(page.getByText(/Waiting record .* is durable/)).toBeVisible();
    await detail
      .getByRole("button", { name: "Close work item details" })
      .click();

    await runInternalWorker();
    await page.goto(`/app/workspaces/${workspaceSlug}/attention`);
    const blockedSignal = page
      .locator('[data-testid^="attention-signal-"]')
      .filter({ hasText: "work_item.blocked" });
    await expect(blockedSignal).toBeVisible();
    await expect(blockedSignal).toContainText(capturedTitle);
    await expect(blockedSignal).toContainText(capturedItemId);
    await expectNoSeriousAccessibilityViolations(page);

    await page.goto(`/app/workspaces/${workspaceSlug}/waiting`);
    const waitingRecord = page
      .locator('[data-testid^="waiting-record-"]')
      .filter({
        hasText: capturedTitle,
      });
    await expect(waitingRecord).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept("Partner confirmed receipt"));
    await waitingRecord.getByRole("button", { name: "Nudge" }).click();
    await expect(page.getByText("Server confirmed nudge")).toBeVisible();

    await createDirectCapture(page, decisionTitle, "decision");
    await createDirectCapture(page, approvalTitle, "approval");
    await runInternalWorker();

    await page.goto(`/app/workspaces/${workspaceSlug}/decisions`);
    let decisionCard = page
      .locator("article")
      .filter({ hasText: decisionTitle });
    await decisionCard
      .getByLabel("Rationale")
      .fill("Direct founder reach is the fastest validated path.");
    await decisionCard
      .getByLabel("Evidence · Optional")
      .fill("Three customer interviews preferred founder-led outreach.");
    await page.reload();
    decisionCard = page.locator("article").filter({ hasText: decisionTitle });
    await expect(decisionCard.getByLabel("Rationale")).toHaveValue(
      "Direct founder reach is the fastest validated path.",
    );
    await expect(decisionCard.getByLabel("Evidence · Optional")).toHaveValue(
      "Three customer interviews preferred founder-led outreach.",
    );
    let lostDecisionResponse = false;
    await page.route("**/api/v1/items/*/decision", async (route) => {
      if (route.request().method() === "POST" && !lostDecisionResponse) {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        lostDecisionResponse = true;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });
    await decisionCard.getByRole("button", { name: "Record outcome" }).click();
    await expect(
      page.locator(
        '[data-live-state="offline"], [data-live-state="terminal-error"]',
      ),
    ).toBeVisible();
    await page.unroute("**/api/v1/items/*/decision");
    await page.reload();
    decisionCard = page.locator("article").filter({ hasText: decisionTitle });
    await expect(decisionCard.getByLabel("Rationale")).toHaveValue(
      "Direct founder reach is the fastest validated path.",
    );
    await decisionCard.getByRole("button", { name: "Record outcome" }).click();
    await expect(
      page.getByText("Server confirmed decision transition"),
    ).toBeVisible();

    await page.goto(`/app/workspaces/${workspaceSlug}/approvals`);
    const approvalCard = page
      .locator("article")
      .filter({ hasText: approvalTitle });
    await approvalCard
      .getByLabel("Rationale")
      .fill("Budget fits the validated acquisition cap.");
    await approvalCard
      .getByLabel("Evidence · Optional")
      .fill("Approved forecast version 3.");
    await approvalCard.getByRole("button", { name: "Record outcome" }).click();
    await expect(
      page.getByText("Server confirmed approval transition"),
    ).toBeVisible();

    await page.goto(`/app/workspaces/${workspaceSlug}/waiting`);
    const activeWait = page.locator('[data-testid^="waiting-record-"]').filter({
      hasText: capturedTitle,
    });
    page.once("dialog", (dialog) => dialog.accept("Signed terms received"));
    await activeWait.getByRole("button", { name: "Resolve" }).click();
    await expect(page.getByText("Server confirmed resolve")).toBeVisible();

    await page.goto(
      `/app/workspaces/${workspaceSlug}/boards/${encodeURIComponent(boardId)}#${encodeURIComponent(capturedItemId)}`,
    );
    await expect(page.getByTestId("work-item-detail")).toBeVisible();
    const freshDetail = page.getByTestId("work-item-detail");
    await freshDetail
      .getByRole("textbox", { name: "Evidence", exact: true })
      .fill("Signed launch terms are stored in the approved contract record.");
    await freshDetail.getByTestId(`evidence-item-${capturedItemId}`).click();
    await expect(page.getByText(/Evidence .* is durable/)).toBeVisible();
    await freshDetail
      .getByRole("textbox", { name: "Evidence", exact: true })
      .fill("Launch partner acknowledged the signed terms and start date.");
    await freshDetail.getByTestId(`resolve-item-${capturedItemId}`).click();
    await expect(
      page.getByText(/Resolution and evidence are durable/),
    ).toBeVisible();
    await expect(
      freshDetail.getByRole("heading", { name: "Change history" }),
    ).toBeVisible();
    await expect(freshDetail.getByText("item_resolved")).toBeVisible();

    await runInternalWorker();
    await page.goto(`/app/workspaces/${workspaceSlug}/attention`);
    await expect(page.getByText(capturedTitle)).toHaveCount(0);

    await page.goto(`/app/workspaces/${workspaceSlug}/reviews`);
    const review = page.getByTestId("weekly-review-form");
    await review
      .getByLabel("Progress this week")
      .fill("Validated the complete capture-to-resolution loop.");
    await review.getByLabel("Current blocker").fill("No current blocker");
    await review
      .getByLabel("Next milestone")
      .fill("Invite the private-alpha cohort");
    await review
      .getByLabel("Decision needed · Optional")
      .fill("Select the first five founders");
    await review
      .getByLabel("Priority next week")
      .fill("Observe real founder usage");
    await review.getByTestId("weekly-review-submit").click();
    await expect(page.getByText("Weekly review is durable")).toBeVisible();
    await expect(page.getByTestId("weekly-review-history")).toContainText(
      "Validated the complete capture-to-resolution loop.",
    );
    await expect(
      page.getByTestId("workspace-snapshots").locator("article"),
    ).toHaveCount(1);
    await page.reload();
    await expect(page.getByTestId("weekly-review-history")).toContainText(
      "Validated the complete capture-to-resolution loop.",
    );
    await expectNoSeriousAccessibilityViolations(page);

    await browserJson(page, "/api/web/sign-out", { method: "POST" });
    await page.goto("/sign-in");
    await submitSignIn(page, ownerEmail, password);
    await page.waitForURL("**/app/portfolio");
    await page.goto(`/app/workspaces/${workspaceSlug}/reviews`);
    await expect(page.getByTestId("weekly-review-history")).toContainText(
      "Validated the complete capture-to-resolution loop.",
    );
    await context.close();
  });

  test("shares changes, resolves conflicts, and fails visibly under injected faults", async ({
    browser,
  }) => {
    test.setTimeout(360_000);
    const ownerContext = await browser.newContext({
      extraHTTPHeaders: clientHeaders(112),
    });
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto("/sign-in");
    await submitSignIn(ownerPage, ownerEmail, password);
    await ownerPage.waitForURL("**/app/portfolio");

    const unknown = await ownerPage.goto(
      `/app/workspaces/not-visible-${suffix}`,
    );
    expect(unknown?.status()).toBe(404);
    await ownerPage.goto("/app/account/invitations");
    await ownerPage
      .getByRole("textbox", { name: "Email", exact: true })
      .fill(collaboratorEmail);
    await ownerPage.getByLabel("Organization role").selectOption("admin");
    await ownerPage.getByRole("button", { name: "Send invitation" }).click();
    await expect(ownerPage.getByRole("status")).toContainText(
      `Invitation sent to ${collaboratorEmail}`,
    );
    const invitationUrl = await waitForMailAction(
      collaboratorEmail,
      "You are invited to TREVV",
    );

    const collaboratorContext = await browser.newContext({
      extraHTTPHeaders: clientHeaders(113),
    });
    const collaboratorPage = await collaboratorContext.newPage();
    const invitationLanding = await normalizeMailAction(
      collaboratorContext,
      invitationUrl,
    );
    await collaboratorPage.goto(invitationLanding);
    await collaboratorPage.waitForURL("**/sign-in?next=**");
    await collaboratorPage
      .getByRole("link", { name: "Create an account" })
      .click();
    await signUpAndVerify(
      collaboratorPage,
      collaboratorContext,
      "Founder Loop Collaborator",
      collaboratorEmail,
      collaboratorPassword,
      false,
    );
    await collaboratorPage.waitForURL("**/sign-in?next=**");
    await submitSignIn(
      collaboratorPage,
      collaboratorEmail,
      collaboratorPassword,
    );
    await collaboratorPage.waitForURL("**/app/portfolio");
    await expect(
      collaboratorPage.getByTestId(`workspace-card-${workspaceSlug}`),
    ).toBeVisible();

    const teamName = `Launch Team ${suffix}`;
    const ownerMessage = `Owner coordination note ${suffix}`;
    const collaboratorMessage = `Collaborator acknowledgement ${suffix}`;
    await collaboratorPage.goto(`/app/workspaces/${workspaceSlug}/messages`);
    await expect(collaboratorPage.getByTestId("live-messages")).toBeVisible();
    await ownerPage.goto(`/app/workspaces/${workspaceSlug}/teams`);
    await expect(ownerPage.getByTestId("live-teams")).toBeVisible();
    await ownerPage.getByRole("button", { name: "Create Team" }).click();
    const teamCreator = ownerPage.getByRole("dialog", {
      name: "Create Team",
    });
    await teamCreator.getByLabel("Team name").fill(teamName);
    await teamCreator.getByLabel("Feature preset").selectOption("technology");
    await teamCreator
      .getByRole("checkbox", { name: /Founder Loop Owner/ })
      .check();
    await teamCreator
      .getByRole("checkbox", { name: /Founder Loop Collaborator/ })
      .check();
    await teamCreator
      .getByLabel("Team lead")
      .selectOption({ label: "Founder Loop Owner" });
    await teamCreator
      .getByRole("button", { name: "Create Team and room" })
      .click();
    await expect(
      ownerPage.getByText(`Team “${teamName}” and its room were saved.`),
    ).toBeVisible();
    await expect(
      ownerPage.getByText("Technology preset defaults"),
    ).toBeVisible();

    const collaboratorTeamRoom = collaboratorPage.getByRole("button", {
      name: new RegExp(teamName),
    });
    await expect(collaboratorTeamRoom).toBeVisible({ timeout: 15_000 });
    await collaboratorTeamRoom.click();
    await collaboratorPage
      .getByRole("textbox", { name: "Message" })
      .fill(collaboratorMessage);
    await collaboratorPage.getByRole("button", { name: "Send" }).click();
    await expect(collaboratorPage.getByText("Message sent")).toBeVisible();
    const collaboratorRootMessage = collaboratorPage
      .locator("[data-message-id]")
      .filter({ hasText: collaboratorMessage })
      .first();
    await collaboratorRootMessage
      .getByRole("button", { name: /Reply to Founder Loop Collaborator/ })
      .click();
    const collaboratorThread = collaboratorPage.getByRole("region", {
      name: "Replies to Founder Loop Collaborator",
    });
    await expect(collaboratorThread).toBeVisible();

    await ownerPage.goto(`/app/workspaces/${workspaceSlug}/messages`);
    const ownerTeamRoom = ownerPage.getByRole("button", {
      name: new RegExp(teamName),
    });
    await expect(ownerTeamRoom).toBeVisible();
    await ownerTeamRoom.click();
    await expect(ownerPage.getByText(collaboratorMessage)).toBeVisible({
      timeout: 15_000,
    });
    const ownerRootMessage = ownerPage
      .locator("[data-message-id]")
      .filter({ hasText: collaboratorMessage })
      .first();
    await ownerRootMessage
      .getByRole("button", { name: /Reply to Founder Loop Collaborator/ })
      .click();
    await expect(
      ownerPage.getByRole("region", {
        name: "Replies to Founder Loop Collaborator",
      }),
    ).toBeVisible();
    await ownerPage
      .getByRole("textbox", { name: "Message" })
      .fill(ownerMessage);
    await ownerPage.getByRole("button", { name: "Send" }).click();
    await expect(ownerPage.getByText("Message sent")).toBeVisible();
    await expect(
      collaboratorThread.getByText(ownerMessage, { exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    const messageLayout = ownerPage.getByRole("region", {
      name: "Messaging workspace",
    });
    for (const width of [1_024, 1_180, 1_280, 1_440]) {
      await ownerPage.setViewportSize({ width, height: 820 });
      const geometry = await messageLayout.evaluate((element) => {
        const layout = element as HTMLElement;
        const thread = layout.querySelector(
          '[class*="threadPane"]',
        ) as HTMLElement;
        const composer = layout.querySelector("textarea") as HTMLElement;
        const labels = [...layout.querySelectorAll("nav strong")];
        const composerRect = composer.getBoundingClientRect();
        return {
          layoutFits: layout.scrollWidth <= layout.clientWidth + 1,
          threadWidth: thread.getBoundingClientRect().width,
          composerRight: composerRect.right,
          composerBottom: composerRect.bottom,
          labelsFit: labels.every(
            (label) => label.scrollWidth <= label.clientWidth + 1,
          ),
        };
      });
      expect(geometry.layoutFits).toBe(true);
      expect(geometry.threadWidth).toBeGreaterThan(380);
      expect(geometry.composerRight).toBeLessThanOrEqual(width);
      expect(geometry.composerBottom).toBeLessThanOrEqual(820);
      expect(geometry.labelsFit).toBe(true);
      if (width <= 1_280) {
        await expect(
          ownerPage.getByRole("button", {
            name: "Open conversation context",
          }),
        ).toBeVisible();
      }
    }

    await ownerPage.setViewportSize({ width: 1_180, height: 820 });
    await expect(
      ownerPage.getByRole("button", { name: "Collapse conversations" }),
    ).toBeHidden();
    const contextToggle = ownerPage.getByRole("button", {
      name: "Open conversation context",
    });
    await contextToggle.click();
    await expect(ownerPage.getByRole("dialog")).toBeVisible();
    await ownerPage.keyboard.press("Escape");
    await expect(contextToggle).toBeFocused();

    await ownerPage.setViewportSize({ width: 1_440, height: 820 });
    const railResizer = ownerPage.getByRole("separator", {
      name: "Resize conversation list",
    });
    await expect(railResizer).toBeVisible();
    await railResizer.focus();
    await ownerPage.keyboard.press("End");
    await expect(railResizer).toHaveAttribute("aria-valuenow", "352");
    await ownerPage.reload();
    await expect(
      ownerPage.getByRole("separator", {
        name: "Resize conversation list",
      }),
    ).toHaveAttribute("aria-valuenow", "352");

    await ownerPage.setViewportSize({ width: 900, height: 820 });
    await ownerPage
      .getByRole("button", { name: "Collapse conversations" })
      .click();
    await expect(
      ownerPage.getByRole("button", { name: "Show conversations" }),
    ).toBeVisible();
    await ownerPage.reload();
    await expect(
      ownerPage.getByRole("button", { name: "Show conversations" }),
    ).toBeVisible();
    await ownerPage.getByRole("button", { name: "Show conversations" }).click();
    await expect(
      ownerPage.getByRole("button", { name: "Collapse conversations" }),
    ).toBeVisible();
    await expectNoSeriousAccessibilityViolations(ownerPage);
    await ownerPage.setViewportSize({ width: 1_280, height: 720 });

    await ownerPage.goto(`/app/workspaces/${workspaceSlug}/teams`);
    await ownerPage.getByRole("button", { name: `Manage ${teamName}` }).click();
    await ownerPage
      .getByRole("button", {
        name: `Remove Founder Loop Collaborator from ${teamName}`,
      })
      .click();
    await expect(collaboratorTeamRoom).toHaveCount(0, { timeout: 15_000 });

    for (const name of [
      "Marketing",
      "Technology",
      "Sales",
      "Operations",
      "Customer Success",
    ]) {
      const response = await browserJson(
        ownerPage,
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/teams`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            workspaceId,
            name: `${name} ${suffix}`,
            purpose: `${name} coordination for the founder operating loop.`,
            preset: "custom",
            featureCapabilities: ["work", "messages"],
            memberIds: [ownerUserId],
            leadUserId: ownerUserId,
          }),
        },
      );
      expect(response.status).toBe(201);
    }
    await ownerPage.reload();
    await ownerPage.setViewportSize({ width: 1_280, height: 900 });
    const teamCards = ownerPage.locator('[data-testid^="team-card-"]');
    await expect(teamCards).toHaveCount(6);
    for (let index = 0; index < 6; index += 1) {
      await expect(teamCards.nth(index)).toBeInViewport();
    }
    await expect(
      teamCards.filter({ hasText: "options available to" }).first(),
    ).toBeVisible();

    const collaborationTitle = `Cross-browser update ${suffix}`;
    await collaboratorPage.goto(
      `/app/workspaces/${workspaceSlug}/boards/${encodeURIComponent(boardId)}`,
    );
    await collaboratorPage.getByTestId("create-item-open").click();
    const createItem = collaboratorPage.getByTestId("create-item-dialog");
    await createItem.getByLabel("Title").fill(collaborationTitle);
    await createItem.getByRole("button", { name: "Create item" }).click();
    await expect(
      collaboratorPage.getByText(`Server confirmed “${collaborationTitle}”`),
    ).toBeVisible();

    await ownerPage.goto(
      `/app/workspaces/${workspaceSlug}/boards/${encodeURIComponent(boardId)}`,
    );
    await expect(
      ownerPage
        .getByTestId("live-board")
        .getByRole("button")
        .filter({ hasText: collaborationTitle }),
    ).toBeVisible({ timeout: 12_000 });
    const collaborationItemResponse = await browserJson(
      ownerPage,
      `/api/v1/items?workspaceId=${encodeURIComponent(workspaceId)}&limit=100`,
    );
    const collaborationItem = (
      collaborationItemResponse.body as {
        data: Array<{ id: string; title: string; version: number }>;
      }
    ).data.find((item) => item.title === collaborationTitle);
    expect(collaborationItem).toBeDefined();

    await collaboratorPage.reload();
    const staleRow = collaboratorPage.getByTestId(
      `work-item-${collaborationItem!.id}`,
    );
    const latestBeforeConflict = await browserJson(
      ownerPage,
      `/api/v1/items/${encodeURIComponent(collaborationItem!.id)}`,
    );
    const currentVersion = (latestBeforeConflict.body as { version: number })
      .version;
    const ownerMutation = await browserJson(
      ownerPage,
      `/api/v1/items/${encodeURIComponent(collaborationItem!.id)}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "if-match": `"${currentVersion}"`,
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ status: "working" }),
      },
    );
    expect(ownerMutation.status).toBe(200);
    await staleRow
      .getByLabel(`Status for ${collaborationTitle}`)
      .selectOption("review");
    await expect(
      collaboratorPage.locator('[data-live-state="version-conflict"]'),
    ).toBeVisible();
    await collaboratorPage.getByRole("button", { name: "Load latest" }).click();
    await expect(
      collaboratorPage.getByText("Loaded the latest server version"),
    ).toBeVisible();

    await ownerPage.goto(`/app/workspaces/${workspaceSlug}`);
    await assertTimedOutCapture(ownerPage, `Timed out capture ${suffix}`);
    await assertInjectedCaptureFailure(
      ownerPage,
      422,
      "validation",
      "Invalid capture",
    );
    await assertInjectedCaptureFailure(
      ownerPage,
      429,
      "rate-limit",
      "Rate limited capture",
    );
    await assertInjectedCaptureFailure(
      ownerPage,
      500,
      "terminal-error",
      "Failed capture",
    );

    await ownerPage.route("**/api/v1/workspaces", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "session_required",
            message: "The injected session expired.",
            requestId: `fault-401-${suffix}`,
          },
        }),
      });
    });
    await expect(ownerPage.getByText("Your access has changed")).toBeVisible({
      timeout: 12_000,
    });
    await ownerPage.unroute("**/api/v1/workspaces");
    await ownerPage.reload();
    await expect(
      ownerPage.getByTestId("live-workspace-overview"),
    ).toBeVisible();

    const memberships = await browserJson(ownerPage, "/api/v1/memberships");
    const collaboratorMembership = (
      memberships.body as Array<{ user: { id: string; email: string } }>
    ).find((membership) => membership.user.email === collaboratorEmail);
    expect(collaboratorMembership).toBeDefined();
    const removal = await browserJson(
      ownerPage,
      `/api/v1/memberships/${encodeURIComponent(collaboratorMembership!.user.id)}`,
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
    await expect(
      collaboratorPage.getByText("Your access has changed"),
    ).toBeVisible({
      timeout: 12_000,
    });
    expect(
      (await browserJson(collaboratorPage, "/api/v1/session")).status,
    ).toBe(403);

    await collaboratorContext.close();
    await ownerContext.close();
  });
});

async function completeOnboarding(page: Page) {
  await page.getByLabel("Organization name").fill(organizationName);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Workspace name").fill(`Initial ${suffix}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Create organization" }).click();
  await page.waitForURL("**/app/portfolio");
}

async function createDirectCapture(
  page: Page,
  title: string,
  type: "decision" | "approval",
) {
  await page.goto(`/app/workspaces/${workspaceSlug}`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: "Create work", exact: true }).click();
  const dialog = page.getByTestId("live-quick-capture");
  await dialog.getByLabel("Direct to board").check();
  await dialog.getByTestId("live-capture-title").fill(title);
  await dialog.getByLabel("Work type").selectOption(type);
  await dialog.getByTestId("live-capture-submit").click();
  await expect(
    page.getByText(`Saved as a canonical board item.`),
  ).toBeVisible();
}

async function assertInjectedCaptureFailure(
  page: Page,
  status: 422 | 429 | 500,
  expectedState: "validation" | "rate-limit" | "terminal-error",
  title: string,
) {
  await page.route("**/api/v1/inbox", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code:
            status === 422
              ? "validation_error"
              : status === 429
                ? "rate_limited"
                : "repository_unavailable",
          message: `Injected HTTP ${status}; no record was saved.`,
          requestId: `fault-${status}-${suffix}`,
          ...(status === 429 ? { details: { retryAfterSeconds: 1 } } : {}),
        },
      }),
    });
  });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Create work", exact: true }).click();
  const dialog = page.getByTestId("live-quick-capture");
  await dialog.getByTestId("live-capture-title").fill(`${title} ${suffix}`);
  await dialog.getByTestId("live-capture-submit").click();
  await expect(
    dialog.locator(`[data-live-state="${expectedState}"]`),
  ).toBeVisible();
  await expect(dialog.getByTestId("live-capture-title")).toHaveValue(
    `${title} ${suffix}`,
  );
  await dialog.getByRole("button", { name: "Close capture" }).click();
  await page.unroute("**/api/v1/inbox");
}

async function assertTimedOutCapture(page: Page, title: string) {
  await page.route("**/api/v1/inbox", async (route) => {
    if (route.request().method() === "POST") {
      await route.abort("timedout");
      return;
    }
    await route.continue();
  });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Create work", exact: true }).click();
  const dialog = page.getByTestId("live-quick-capture");
  await dialog.getByTestId("live-capture-title").fill(title);
  await dialog.getByTestId("live-capture-submit").click();
  await expect(dialog.locator('[data-live-state="offline"]')).toBeVisible();
  await expect(dialog.getByTestId("live-capture-title")).toHaveValue(title);
  await page.unroute("**/api/v1/inbox");
  await dialog.getByTestId("live-capture-submit").click();
  await expect(page.getByText("Saved to the canonical Inbox.")).toBeVisible();
  const inbox = await browserJson(page, "/api/v1/inbox");
  expect(
    (inbox.body as Array<{ title: string }>).filter(
      (record) => record.title === title,
    ),
  ).toHaveLength(1);
}

async function runInternalWorker() {
  const databaseUrl = requiredLiveDatabase();
  for (let pass = 0; pass < 8; pass += 1) {
    const { stdout } = await execFileAsync(
      "pnpm",
      ["--filter", "@founderhq/worker", "run:once"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          DEMO_MODE: "false",
          NODE_ENV: "test",
          WORKER_ID: "live-e2e-worker",
        },
      },
    );
    const resultLine = stdout
      .split("\n")
      .findLast((line) => line.trim().startsWith("{"));
    if (!resultLine)
      throw new Error("The internal worker returned no result record.");
    const result = JSON.parse(resultLine) as {
      outbox: { processed: number; failed: number };
    };
    if (result.outbox.processed === 0 && result.outbox.failed === 0) break;
  }
}

async function signUpAndVerify(
  page: Page,
  context: BrowserContext,
  name: string,
  email: string,
  accountPassword: string,
  navigate = true,
) {
  if (navigate) await page.goto("/sign-up?next=%2Fonboarding");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(accountPassword);
  await page.getByLabel("Confirm password").fill(accountPassword);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/verify-email?**");
  const verificationUrl = await waitForMailAction(
    email,
    "Verify your TREVV email",
  );
  const callback = await normalizeMailAction(context, verificationUrl);
  await page.goto(callback);
  await page.waitForURL((url) => url.pathname !== "/verify-email");
}

async function submitSignIn(
  page: Page,
  email: string,
  accountPassword: string,
) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(accountPassword);
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
  if (!action) throw new Error(`The mail sink did not receive ${subject}.`);
  return action;
}

async function readMail(): Promise<MailRecord[]> {
  try {
    return (await readFile(requiredMailSink(), "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as MailRecord);
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
      headers: clientHeaders(198),
      redirect: "manual",
    });
    const location = response.headers.get("location");
    if (!location)
      throw new Error("The mail action did not return a callback.");
    current = new URL(location, current);
  }
  if (current.origin === webOrigin && current.searchParams.has("token")) {
    const response = await fetch(current, {
      headers: clientHeaders(198),
      redirect: "manual",
    });
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

function clientHeaders(lastOctet: number): Record<string, string> {
  return { "x-trevv-client-ip": `192.0.2.${lastOctet}` };
}

function requiredLiveDatabase(): string {
  const value = process.env.LIVE_E2E_DATABASE_URL?.trim();
  if (!value)
    throw new Error("LIVE_E2E_DATABASE_URL is required for the live worker.");
  return value;
}

function todayDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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
