import { expect, test } from "@playwright/test";
import { setup } from "../fixtures/live-workflow-browser";
import type { AccountProfile } from "../../packages/core/src/user-profile";

test("profile editing preserves drafts, saves personal fields and separates verified email changes", async ({
  page,
}, testInfo) => {
  let profile: AccountProfile = {
    id: "user-one",
    name: "Owner",
    email: "owner@example.test",
    emailVerified: true,
    details: {},
    version: "v1",
  };
  let conflict = false;
  const writes: unknown[] = [];
  const emailRequests: unknown[] = [];
  await setup(page, "", {
    view: "account-profile",
    api: async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/profile") {
        if (route.request().method() === "POST") {
          writes.push(route.request().postDataJSON());
          if (conflict) {
            await route.fulfill({
              status: 409,
              json: {
                message:
                  "Your profile changed in another window. Reload it before saving again.",
              },
            });
            return true;
          }
          profile = {
            ...profile,
            ...route.request().postDataJSON(),
            version: "v2",
          };
        }
        await route.fulfill({ json: profile });
        return true;
      }
      if (path === "/api/auth/change-email") {
        const body = route.request().postDataJSON();
        emailRequests.push(body);
        profile.pendingEmail = {
          email: body.newEmail,
          stage: "confirm-current",
          expiresAt: "2026-09-15T12:00:00Z",
        };
        await route.fulfill({ json: { ok: true } });
        return true;
      }
      if (path === "/api/auth/cancel-email-change") {
        delete profile.pendingEmail;
        await route.fulfill({ json: { ok: true } });
        return true;
      }
      return false;
    },
  });
  await expect(
    page.getByRole("heading", { name: "Edit profile" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Primary login email", { exact: true }),
  ).toHaveAttribute("readonly", "");
  await expect(
    page.getByRole("button", { name: "Save profile" }),
  ).toBeDisabled();
  await page.getByLabel("Full name", { exact: true }).fill("Owner Updated");
  await page.getByLabel("Job title", { exact: true }).fill("Product designer");
  await page
    .getByLabel("About you", { exact: true })
    .fill("I design the product.");
  await page.getByLabel("Phone", { exact: true }).fill("+49 1234567");
  await page.getByLabel("Location", { exact: true }).fill("Berlin");
  await page
    .getByLabel("Website", { exact: true })
    .fill("https://example.test/portfolio");
  await page
    .getByLabel("Time zone", { exact: true })
    .selectOption("Europe/Berlin");
  conflict = true;
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("alert")).toContainText("another window");
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "Owner Updated",
  );
  conflict = false;
  await page.getByRole("button", { name: "Reload latest profile" }).click();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "Owner",
  );
  await page.getByLabel("Full name", { exact: true }).fill("Owner Updated");
  await page.getByLabel("Job title", { exact: true }).fill("Designer");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toContainText("Profile saved");
  expect(writes.at(-1)).toMatchObject({
    name: "Owner Updated",
    details: { jobTitle: "Designer" },
    version: "v1",
  });
  expect(writes.at(-1)).not.toHaveProperty("email");
  await page.reload();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "Owner Updated",
  );
  await page.getByText("Change login email", { exact: true }).click();
  await page
    .getByLabel("New login email", { exact: true })
    .fill("new-owner@example.test");
  await page
    .getByLabel("Current password", { exact: true })
    .fill("fictional-test-password");
  await page.getByRole("button", { name: "Send confirmation" }).click();
  expect(emailRequests).toEqual([
    { newEmail: "new-owner@example.test", password: "fictional-test-password" },
  ]);
  await expect(
    page.getByLabel("Current password", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByLabel("Primary login email", { exact: true }),
  ).toHaveValue("owner@example.test");
  await expect(
    page.getByText("Confirm in your current inbox", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel email change" }).click();
  await expect(
    page.getByRole("button", { name: "Cancel email change" }),
  ).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`edit-profile-${width}.png`),
      fullPage: true,
    });
  }
});
