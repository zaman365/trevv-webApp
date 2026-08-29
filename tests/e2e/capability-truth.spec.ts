import { expect, test } from "@playwright/test";
import {
  boardRoute,
  gotoCanonical,
  workspaceHome,
  workspaceRoute,
} from "./routes";

test("authentication preview accepts no credentials and opens only sample data", async ({
  page,
}) => {
  await page.goto("/sign-in");

  await expect(
    page.getByLabel("Unavailable capability: Authentication is not active"),
  ).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Explore fictional sample workspace" }),
  ).toBeVisible();
});

test("the application persistently identifies fictional browser-local data", async ({
  page,
}) => {
  await page.goto("/app/workspaces/centralops/messages");

  await expect(
    page.getByLabel(
      "Technical preview · fictional data · changes stay in this browser",
    ),
  ).toBeVisible();
  await expect(
    page.getByLabel("Demo only capability: Messages are not delivered"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add to sample conversation" }),
  ).toBeVisible();
});

test("sample email and invitations cannot imply external delivery", async ({
  page,
}) => {
  await page.goto("/app/mail");
  await expect(
    page.getByLabel("Demo only capability: Email is a fictional mailbox"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Draft sample" }).click();
  await expect(
    page.getByRole("button", { name: "Add to sample Sent folder" }),
  ).toBeVisible();

  await page.goto("/app/workspaces/centralops/settings#members");
  await page.getByRole("button", { name: "Prepare sample invite" }).click();
  const invitationDialog = page.getByRole("dialog", {
    name: "Prepare a sample invitation",
  });
  await expect(
    invitationDialog.getByLabel("Demo only capability: Invitations are drafts"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Prepare invitation draft" }),
  ).toBeVisible();
});

test("security and import stay disabled or explicitly simulated", async ({
  page,
}) => {
  await page.goto("/app/workspaces/centralops/settings#security");
  await expect(
    page.getByLabel(
      "Unavailable capability: Account security controls are not active",
    ),
  ).toBeVisible();
  await expect(page.getByRole("switch").first()).toBeDisabled();
  await expect(page.getByLabel("Session timeout")).toBeDisabled();

  await page.goto("/app/workspaces/centralops/settings/import");
  await expect(
    page.getByLabel("Preview capability: Import is a dry-run preview"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preview mapping" }).click();
  await page.getByRole("button", { name: "Preview sample outcome" }).click();
  await page.getByRole("button", { name: "Simulate 179-row outcome" }).click();
  const outcome = page.getByRole("status");
  await expect(outcome).toBeVisible();
  await expect(outcome).toContainText("No work item was created.");
});

test("follow-ups, updates, and reviews expose only local preview actions", async ({
  page,
}) => {
  await gotoCanonical(page, workspaceRoute("waiting"));
  await page.getByRole("button", { name: /^Waiting on External/ }).click();
  await page
    .locator(".waiting-list article")
    .first()
    .getByRole("button", { name: "Draft follow-up" })
    .click();
  const followUp = page.getByRole("dialog", {
    name: "Prepare a focused nudge",
  });
  await expect(
    followUp.getByLabel("Preview capability: Follow-ups are drafts"),
  ).toBeVisible();
  await expect(
    followUp.getByRole("button", { name: "Save local preview" }),
  ).toBeVisible();

  await gotoCanonical(page, workspaceHome());
  await page.getByRole("button", { name: "Draft sample update" }).click();
  const update = page.getByRole("dialog", {
    name: "Draft a sample workspace update",
  });
  await expect(
    update.getByLabel("Demo only capability: Updates are local previews"),
  ).toBeVisible();
  await expect(
    update.getByRole("button", { name: "Save local preview" }),
  ).toBeVisible();

  await gotoCanonical(page, workspaceRoute("reviews"));
  await expect(
    page.getByLabel("Demo only capability: Updates are local previews"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save sample review locally" }),
  ).toBeVisible();
});

test("integrations and exports identify their preview boundaries", async ({
  page,
}) => {
  await gotoCanonical(page, `${workspaceRoute("settings")}#integrations`);
  await expect(
    page.getByLabel("Preview capability: Provider connections are previews"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Manage preview" }).first(),
  ).toBeVisible();

  await gotoCanonical(page, `${workspaceRoute("settings")}#export`);
  await expect(
    page.getByLabel(
      "Demo only capability: Exports contain sample browser data",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download sample JSON" }),
  ).toBeVisible();
});

test("automation and uploads cannot imply a background or secure effect", async ({
  page,
}) => {
  await gotoCanonical(page, boardRoute());
  const initialPanel = page.locator(".item-panel");
  if (await initialPanel.isVisible()) {
    await initialPanel.getByLabel("Close").click();
  }
  await page
    .getByRole("main")
    .locator("header")
    .getByRole("button", { name: "Automate" })
    .click();
  const automation = page.getByRole("dialog", { name: "Board automation" });
  await expect(
    automation.getByLabel("Preview capability: Automations are previews"),
  ).toBeVisible();
  await expect(
    automation.getByRole("button", { name: "Save local preview" }),
  ).toBeVisible();
  await automation.getByRole("button", { name: "Close automation" }).click();

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
  await expect(
    panel.getByRole("button", {
      name: "File upload unavailable in technical preview",
    }),
  ).toBeDisabled();
  await expect(
    panel.getByRole("button", { name: "Add sample comment" }),
  ).toBeVisible();
});
