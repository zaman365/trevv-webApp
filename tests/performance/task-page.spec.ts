import { expect, test } from "@playwright/test";
import type {
  WorkItemDto,
  WorkItemHistoryEntryDto,
} from "@founderhq/api-contract";
import { applyTaskReview } from "../../packages/core/src/task-review";
import {
  item,
  members,
  session,
} from "../../apps/web/test-fixtures/live-workflow-data";
import { setup } from "../fixtures/live-workflow-browser";

test("task cards open a structured page, send to multiple reviewers, retain notes on retry and expose the review queue", async ({
  page,
}) => {
  const records: WorkItemDto[] = [
    {
      ...structuredClone(item),
      status: "working" as const,
      assignees: [session.user],
      description:
        "Prepare the launch package and verify the published results.",
    },
  ];
  const history: WorkItemHistoryEntryDto[] = [];
  const keys: string[] = [];
  let failOnce = true;
  await setup(page, "", {
    view: "personal",
    styled: true,
    records,
    api: async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/v1/reviews/weekly" || path === "/api/v1/snapshots") {
        await route.fulfill({ json: [] });
        return true;
      }
      if (path.endsWith(`/items/${item.id}/history`)) {
        await route.fulfill({ json: history });
        return true;
      }
      if (path.endsWith(`/items/${item.id}/review`)) {
        const command = route.request().postDataJSON();
        keys.push(route.request().headers()["idempotency-key"]!);
        if (failOnce) {
          failOnce = false;
          await route.fulfill({
            status: 503,
            json: {
              error: {
                code: "repository_unavailable",
                message: "Try again",
                requestId: "test-review",
              },
            },
          });
          return true;
        }
        const now = new Date().toISOString();
        const next = applyTaskReview(records[0]!, command, {
          actor: session.user,
          now,
          newId: "review-one",
          reviewers: members.map((member) => member.user),
        });
        records[0] = {
          ...records[0]!,
          ...next,
          version: records[0]!.version + 1,
          updatedAt: now,
        };
        history.push({
          id: "review-event",
          type: "item_updated",
          reasonCode: "review_request",
          summary: "Review sent to Owner and Teammate",
          actor: session.user,
          occurredAt: now,
          itemVersion: records[0]!.version,
          metadata: { review: next.review },
        });
        await route.fulfill({
          json: records[0],
          headers: {
            etag: `"${records[0]!.version}"`,
            "idempotency-key": keys.at(-1)!,
            "idempotency-replayed": "false",
          },
        });
        return true;
      }
      return false;
    },
  });
  await page
    .getByTestId(`work-item-${item.id}`)
    .getByRole("link", { name: /Ship the launch/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`/tasks/${item.id}$`));
  await expect(page.getByRole("heading", { name: "Task brief" })).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Task sections" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit task", exact: true }).click();
  await page.getByText("Assign an owner", { exact: true }).click();
  await expect(page.getByLabel("Choose assignee")).toBeVisible();
  await page
    .getByRole("button", { name: "Send for review", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "Owner (you)" }).check();
  await page.getByRole("checkbox", { name: "Teammate" }).check();
  const notes =
    "Please check the launch results https://drive.google.com/example";
  await page
    .getByRole("textbox", { name: "Review notes", exact: true })
    .fill(notes);
  await page
    .getByRole("button", { name: "Send for review", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("textbox", { name: "Review notes", exact: true }),
  ).toHaveValue(notes);
  await expect(page.getByRole("alert")).toContainText("Try again");
  await page
    .getByRole("button", { name: "Send for review", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("region", { name: "Review round 1" }),
  ).toContainText("Teammate");
  await expect(
    page
      .getByRole("region", { name: "Review round 1" })
      .getByText("Awaiting response", { exact: true }),
  ).toHaveCount(2);
  expect(keys[0]).toBe(keys[1]);
  await page
    .getByRole("button", { name: "Activity & evidence", exact: true })
    .click();
  await expect(
    page.getByText("Review sent to Owner and Teammate").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({
    path: "/private/tmp/trevv-task-page-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Task brief" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/private/tmp/trevv-task-page-mobile.png",
    fullPage: true,
  });
  await page.goto("https://trevv.test/?view=page-reviews");
  await page
    .getByRole("button", { name: "Refresh connection", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reviews for me" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Ship the launch/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Weekly review", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Weekly Review/i }),
  ).toBeVisible();
});
