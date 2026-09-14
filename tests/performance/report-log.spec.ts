import { expect, test, type Route } from "@playwright/test";
import { setup } from "../fixtures/live-workflow-browser";
import {
  saveReportPlanSchema,
  type ReportPlanDto,
} from "../../packages/api-contract/src/report-plan";
import { session } from "../../apps/web/test-fixtures/live-workflow-data";
import AxeBuilder from "@axe-core/playwright";

function reportApi() {
  const rows: ReportPlanDto[] = [];
  const keys: string[] = [];
  let failNext = false;
  let denied = false;
  const api = async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (!url.pathname.includes("report-plans")) return false;
    const respond = async (json: unknown, status = 200) => {
      await route.fulfill({ status, json });
      return true;
    };
    const error = (status: number, message: string) =>
      respond(
        {
          error: { code: "request_failed", message, requestId: "report-test" },
        },
        status,
      );
    if (denied) return error(403, "Workspace access removed");
    const id = url.pathname.split("/").at(-1);
    const row = rows.find((row) => row.id === id);
    if (req.method() === "GET") {
      if (row) return respond(row);
      const data = rows.filter(
        (row) =>
          !row.archivedAt &&
          (!url.searchParams.get("kind") ||
            row.kind === url.searchParams.get("kind")) &&
          (!url.searchParams.get("state") ||
            row.state === url.searchParams.get("state")) &&
          (!url.searchParams.get("authorId") ||
            row.authorId === url.searchParams.get("authorId")),
      );
      return respond({ data, page: 1, hasMore: false });
    }
    keys.push(req.headers()["idempotency-key"]!);
    if (failNext) {
      failNext = false;
      return error(503, "Please retry; your draft is still here.");
    }
    if (row && req.headers()["if-match"] !== `"${row.version}"`)
      return error(409, "This update changed");
    if (req.method() === "DELETE" && row) {
      row.archivedAt = new Date().toISOString();
      row.version++;
      return respond(row);
    }
    const parsed = saveReportPlanSchema.safeParse(req.postDataJSON());
    if (!parsed.success) return error(422, "Invalid report fields");
    const now = new Date().toISOString();
    const saved: ReportPlanDto = {
      ...parsed.data,
      id: row?.id ?? `report-${rows.length}`,
      workspaceId: "workspace-one",
      authorId: session.user.id,
      authorName: session.user.name,
      version: (row?.version ?? -1) + 1,
      createdAt: row?.createdAt ?? now,
      updatedAt: now,
      archivedAt: null,
      publishedAt:
        parsed.data.state === "published" ? (row?.publishedAt ?? now) : null,
    };
    if (row) Object.assign(row, saved);
    else rows.push(saved);
    return respond(saved, row ? 200 : 201);
  };
  return {
    rows,
    keys,
    api,
    fail() {
      failNext = true;
    },
    deny() {
      denied = true;
    },
  };
}

test("logs working time, progress and Drive resources; retries retain data and published edits stay shared", async ({
  page,
}) => {
  const fixture = reportApi();
  await setup(page, "", { view: "report-log", styled: true, api: fixture.api });
  await page
    .getByRole("button", { name: "Log work / time", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Work & time log",
    exact: true,
  });
  await dialog.getByLabel("Title", { exact: true }).fill("Delivery log");
  await dialog.getByLabel("Progress percentage", { exact: true }).fill("75");
  await dialog
    .getByLabel("Results and impact", { exact: false })
    .fill("Delivered the campaign assets");
  await dialog.getByRole("tab", { name: "Working time", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Add time entry", exact: true })
    .click();
  await dialog.getByLabel("Activity 1", { exact: true }).fill("Prepare assets");
  await dialog
    .getByLabel("Entry method 1", { exact: true })
    .selectOption("clock");
  await dialog.getByLabel("End time 1", { exact: true }).fill("12:00");
  await dialog.getByLabel("Break minutes 1", { exact: true }).fill("30");
  await expect(dialog).toContainText("2h 30m of work");
  await dialog
    .getByRole("tab", { name: "Links & resources", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Add resource link", exact: true })
    .click();
  await dialog
    .getByLabel("Link name 1", { exact: true })
    .fill("Campaign assets");
  await dialog
    .getByLabel("Resource URL 1", { exact: true })
    .fill("https://drive.google.com/drive/folders/assets");
  fixture.fail();
  await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Please retry");
  await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.keys[0]).toBe(fixture.keys[1]);
  expect(fixture.rows[0]).toMatchObject({
    kind: "log",
    state: "draft",
    content: {
      progressPercent: 75,
      results: "Delivered the campaign assets",
      timeEntries: [{ minutes: 150, breakMinutes: 30 }],
      resources: [
        {
          label: "Campaign assets",
          url: "https://drive.google.com/drive/folders/assets",
        },
      ],
    },
  });
  await page.reload();
  await page.getByText("Read full log", { exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Campaign assets", exact: true }),
  ).toHaveAttribute("rel", "noopener noreferrer");
  await expect(
    page.getByRole("link", { name: "Campaign assets", exact: true }),
  ).toHaveAttribute("target", "_blank");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export time on this page" }).click();
  expect((await download).suggestedFilename()).toContain("trevv-work-time");
  await page.getByRole("button", { name: "Edit draft", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Publish to workspace", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.rows[0]!.state).toBe("published");
  await page
    .getByRole("button", { name: "Use as template", exact: true })
    .click();
  await dialog.getByRole("tab", { name: "Working time", exact: true }).click();
  await expect(dialog.getByLabel("Activity 1", { exact: true })).toHaveCount(0);
  await dialog.getByRole("tab", { name: /Links & resources/ }).click();
  await expect(
    dialog.getByLabel("Resource URL 1", { exact: true }),
  ).toHaveValue("https://drive.google.com/drive/folders/assets");
  await dialog.getByRole("button", { name: "Close editor" }).click();
  fixture.deny();
  await page.getByRole("button", { name: "Refresh reports and logs" }).click();
  await expect(page.getByRole("alert")).toContainText("no longer have access");
  await expect(page.getByRole("heading", { name: "Delivery log" })).toHaveCount(
    0,
  );
});

test("templates produce real reports and preserve the original plan workflow", async ({
  page,
}) => {
  const fixture = reportApi();
  await setup(page, "", {
    view: "report-plan",
    styled: true,
    api: fixture.api,
  });
  await page.getByRole("tab", { name: "Templates", exact: true }).click();
  await page
    .getByRole("button", { name: "Use Weekly report", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Progress report" });
  await expect(
    dialog.getByRole("combobox", { name: "Period", exact: true }),
  ).toHaveValue("week");
  await dialog
    .getByLabel("Results and impact", { exact: false })
    .fill("Reduced support response time by 15%");
  await dialog
    .getByRole("button", { name: "Publish to workspace", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.rows[0]!.content.templateId).toBe("weekly");
  await page.getByRole("tab", { name: "Plans", exact: true }).click();
  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Work plan", exact: true });
  await dialog
    .getByLabel("Goals and priorities", { exact: false })
    .fill("Launch the campaign");
  await dialog
    .getByLabel("Next steps", { exact: false })
    .fill("Review and publish the assets");
  await dialog
    .getByRole("tab", { name: "Links & resources", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Add resource link", exact: true })
    .click();
  await dialog.getByLabel("Link name 1", { exact: true }).fill("Brief");
  await dialog
    .getByLabel("Resource URL 1", { exact: true })
    .fill("javascript:alert(1)");
  await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("http or https");
  expect(fixture.rows).toHaveLength(1);
  await dialog
    .getByLabel("Resource URL 1", { exact: true })
    .fill("https://docs.google.com/document/d/brief");
  await dialog
    .getByRole("button", { name: "Publish to workspace", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Plan next period", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Goals and priorities", { exact: false }),
  ).toHaveValue("Launch the campaign");
  await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.rows.at(-1)?.state).toBe("draft");
  await page.getByRole("button", { name: "Edit draft", exact: true }).click();
  await dialog.getByRole("button", { name: "Archive", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Archive update", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.rows.at(-1)?.archivedAt).toBeTruthy();
});

for (const width of [1440, 390])
  test(`Report & Log is usable at ${width}px with keyboard navigation`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await setup(page, "", {
      view: "report-log",
      styled: true,
      api: reportApi().api,
    });
    const tabs = page.getByRole("tablist", {
      name: "Report & Log views",
      exact: true,
    });
    await tabs.getByRole("tab", { name: "All updates" }).focus();
    await page.keyboard.press("End");
    await expect(tabs.getByRole("tab", { name: "Templates" })).toBeFocused();
    await expect(
      page.getByRole("heading", { name: "Start with a template" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`report-log-${width}.png`),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Use Daily work log", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("tab", { name: "Working time", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Add time entry", exact: true })
      .click();
    expect(
      await dialog.evaluate(
        (el) => el.getBoundingClientRect().right <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`report-log-editor-${width}.png`),
    });
    const scan = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .disableRules(["color-contrast"])
      .analyze();
    expect(
      scan.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact ?? ""),
      ),
    ).toEqual([]);
  });
