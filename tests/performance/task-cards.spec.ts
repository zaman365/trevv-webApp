import { expect, test } from "@playwright/test";
import { setup } from "../fixtures/live-workflow-browser";
import { item } from "../../apps/web/test-fixtures/live-workflow-data";

for (const width of [1440, 390]) {
  test(`task cards open from their background and keep status actions separate at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 950 });
    await setup(page, "", {
      styled: true,
      records: [
        {
          ...item,
          description:
            "Prepare the final assets and confirm the launch checklist.",
          assignees: [{ id: "user-one", name: "Owner" }],
          dueDate: "2026-09-15",
          priority: "high",
        },
        {
          ...item,
          id: "task-two",
          title:
            "Review customer feedback and agree the next steps for the upcoming release",
          description:
            "Share the findings with the team before the next sprint.",
          priority: "normal",
        },
      ],
    });
    const board = page.getByTestId("live-board");
    const card = board.getByTestId(`work-item-${item.id}`);
    await expect(
      board.getByRole("button", { name: "Cards", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(card).toContainText("Prepare the final assets");
    await expect(card).toContainText("Open task");
    const bounds = await card.boundingBox();
    expect(bounds!.width).toBeLessThan(650);
    expect(
      await card.evaluate(
        (element) => getComputedStyle(element).borderTopWidth,
      ),
    ).toBe("1px");
    await card.getByLabel(`Status for ${item.title}`).selectOption("working");
    await expect(card.getByLabel(`Status for ${item.title}`)).toHaveValue(
      "working",
    );
    await expect(page.getByTestId("work-item-detail")).toBeHidden();
    const owner = card.getByRole("button", { name: "Owner", exact: true });
    await owner.click();
    await expect(owner).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("work-item-detail")).toBeHidden();
    await page.keyboard.press("Escape");
    await page.screenshot({
      path: testInfo.outputPath(`task-cards-${width}.png`),
      fullPage: true,
    });
    const current = await card.boundingBox();
    await card.click({ position: { x: 12, y: current!.height - 12 } });
    await expect(page.getByTestId("work-item-detail")).toBeVisible();
    await expect(page.getByTestId("work-item-detail")).toContainText(
      item.title,
    );
    await page.keyboard.press("Escape");
    await card.getByRole("button", { name: new RegExp(item.title) }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("work-item-detail")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("large card collections keep every task reachable and preserve list and board modes", async ({
  page,
}) => {
  const records = Array.from({ length: 125 }, (_, index) => ({
    ...item,
    id: `task-${index}`,
    title: `Task ${String(index).padStart(3, "0")}`,
  }));
  await setup(page, "", { styled: true, records });
  const board = page.getByTestId("live-board");
  const pages = board.getByRole("navigation", { name: "Task card pages" });
  await expect(board.locator('article[data-testid^="work-item-"]')).toHaveCount(
    24,
  );
  for (let pageNumber = 0; pageNumber < 5; pageNumber++)
    await pages.getByRole("button", { name: "Next tasks" }).click();
  await expect(board.getByTestId("work-item-task-124")).toBeVisible();
  await expect(
    pages.getByRole("button", { name: "Next tasks" }),
  ).toBeDisabled();
  await board.getByLabel("Search tasks").fill("Task 000");
  await expect(board.getByTestId("work-item-task-0")).toBeVisible();
  await expect(pages).toBeHidden();
  await board.getByLabel("Search tasks").fill("");
  await board.getByRole("button", { name: "List", exact: true }).click();
  await expect(
    board.getByRole("list", { name: "Board work items" }),
  ).toHaveAttribute("data-windowed-count", "125");
  expect(
    await board.locator('article[data-testid^="work-item-"]').count(),
  ).toBeLessThan(50);
  await board.getByRole("button", { name: "Board", exact: true }).click();
  await expect(
    board.getByRole("region", { name: /^not started/ }),
  ).toContainText("Task 000");
  await expect(board.getByTestId("work-item-task-0")).toContainText(
    "Open task",
  );
});

for (const view of ["personal", "page-my-work"] as const) {
  test(`${view} defaults to actionable task cards with their original destinations`, async ({
    page,
  }) => {
    await setup(page, "", {
      view,
      styled: true,
      records: [{ ...item, assignees: [{ id: "user-one", name: "Owner" }] }],
    });
    const card = page.getByTestId(`work-item-${item.id}`);
    await expect(
      page.getByRole("button", { name: "Cards", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      card.getByRole("link", { name: new RegExp(item.title) }),
    ).toHaveAttribute(
      "href",
      `/app/workspaces/launch/boards/board-one#${item.id}`,
    );
  });
}
