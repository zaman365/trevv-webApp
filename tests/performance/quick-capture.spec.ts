import { expect, test } from "@playwright/test";
import { setup } from "../fixtures/live-workflow-browser";

for (const type of [
  "Task",
  "Idea",
  "Decision",
  "Approval",
  "Milestone",
  "Request",
]) {
  test(`Quick capture saves a ${type.toLowerCase()} with its assignment and context`, async ({
    page,
  }) => {
    const state = await setup(page, "", { view: "capture" });
    await page
      .getByRole("button", { name: "Quick capture", exact: true })
      .click();
    const form = page.getByRole("dialog", { name: "Quick capture" });
    if (type === "Milestone" || type === "Request") {
      await form.getByRole("tab", { name: "Other items" }).click();
      await form.getByRole("radio", { name: new RegExp(type) }).check();
    } else {
      await form.getByRole("tab", { name: type, exact: true }).click();
    }
    await form
      .getByLabel("Title", { exact: true })
      .fill(`${type} with context`);
    await form
      .getByLabel("Context · Optional", { exact: true })
      .fill("Keep the goal and supporting context");
    await form.getByLabel("Choose assignee").selectOption("user-two");
    await form.getByLabel("Due date · Optional").fill("2026-10-10");
    await form
      .getByRole("button", {
        name: `Create ${type.toLowerCase()}`,
        exact: true,
      })
      .click();
    await expect(form).toHaveCount(0);
    expect(state.creations).toHaveLength(1);
    expect(state.creations[0]).toMatchObject({
      type: type.toLowerCase(),
      title: `${type} with context`,
      description: "Keep the goal and supporting context",
      assigneeIds: ["user-two"],
      boardId: "board-one",
    });
    expect(state.creations[0].dueDate).toContain("2026-10-10");
  });
}

test("tab navigation preserves fields, the Other selection, and a recovered draft", async ({
  page,
}) => {
  await setup(page, "", { view: "capture" });
  const open = page.getByRole("button", { name: "Quick capture", exact: true });
  await open.click();
  const form = page.getByTestId("live-quick-capture");
  await form
    .getByLabel("Title", { exact: true })
    .fill("Keep the draft while choosing");
  await form
    .getByLabel("Context · Optional", { exact: true })
    .fill("Negotiation context");
  await form.getByLabel("Due date · Optional").fill("2026-10-12");
  await form.getByLabel("Priority").selectOption("high");
  await form.getByLabel("Choose assignee").selectOption("user-two");
  await form.getByRole("tab", { name: "Task", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    form.getByRole("tab", { name: "Idea", exact: true }),
  ).toBeFocused();
  await expect(
    form.getByRole("button", { name: "Create idea", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("End");
  await expect(form.getByRole("tab", { name: "Other items" })).toBeFocused();
  await form.getByRole("radio", { name: /Request/ }).check();
  await form.getByRole("tab", { name: "Decision", exact: true }).click();
  await form.getByRole("tab", { name: "Other items" }).click();
  await expect(form.getByRole("radio", { name: /Request/ })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  await page.reload();
  await open.click();
  await expect(form.getByRole("radio", { name: /Request/ })).toBeChecked();
  await expect(form.getByRole("tab", { name: "Other items" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(form.getByLabel("Title", { exact: true })).toHaveValue(
    "Keep the draft while choosing",
  );
  await expect(
    form.getByLabel("Context · Optional", { exact: true }),
  ).toHaveValue("Negotiation context");
  await expect(form.getByLabel("Choose assignee")).toHaveValue("user-two");
  await expect(form.getByLabel("Due date · Optional")).toHaveValue(
    "2026-10-12",
  );
  await expect(form.getByLabel("Priority")).toHaveValue("high");
  await form.getByRole("tab", { name: "Other items" }).focus();
  await page.keyboard.press("Home");
  await expect(
    form.getByRole("tab", { name: "Task", exact: true }),
  ).toBeFocused();
});

test("Other items can still go to Inbox with the selected type and owner", async ({
  page,
}) => {
  const inputs: Array<Record<string, unknown>> = [];
  await setup(page, "", {
    view: "capture",
    api: async (route) => {
      if (
        route.request().method() === "POST" &&
        new URL(route.request().url()).pathname === "/api/v1/inbox"
      )
        inputs.push(route.request().postDataJSON());
      return false;
    },
  });
  await page
    .getByRole("button", { name: "Quick capture", exact: true })
    .click();
  const form = page.getByTestId("live-quick-capture");
  await form.getByRole("tab", { name: "Other items" }).click();
  await form.getByRole("radio", { name: /Request/ }).check();
  await form
    .getByText("Optional: save to Inbox for later", { exact: true })
    .click();
  await form.getByRole("radio", { name: /Inbox first/ }).check();
  await form.getByLabel("Title", { exact: true }).fill("Arrange a follow-up");
  await form.getByLabel("Choose assignee").selectOption("user-two");
  await form
    .getByRole("button", { name: "Save to Inbox", exact: true })
    .click();
  await expect(form).toHaveCount(0);
  expect(inputs).toHaveLength(1);
  expect(inputs[0]).toMatchObject({
    category: "request",
    resource: { type: "request", assigneeId: "user-two" },
  });
});

for (const theme of ["light", "dark"]) {
  test(`toolbar sizing and capture layout work on desktop and mobile in ${theme}`, async ({
    page,
  }, testInfo) => {
    await setup(page, "", { view: "capture" });
    await page.evaluate(
      (value) => document.documentElement.setAttribute("data-theme", value),
      theme,
    );
    const button = page.getByRole("button", {
      name: "Quick capture",
      exact: true,
    });
    const neighbor = page.getByRole("link", { name: "Attention", exact: true });
    const buttonBounds = await button.boundingBox();
    const neighborBounds = await neighbor.boundingBox();
    expect(buttonBounds?.width).toBe(neighborBounds?.width);
    expect(buttonBounds?.height).toBe(neighborBounds?.height);
    expect(buttonBounds?.height).toBe(32);
    expect((await page.locator(".topbar").boundingBox())?.height).toBe(56);
    expect((await button.locator("svg").boundingBox())?.width).toBe(16);
    expect(
      await button.evaluate((element) => {
        const style = getComputedStyle(element);
        return (
          style.color !== style.backgroundColor && style.borderWidth === "1px"
        );
      }),
    ).toBe(true);
    await button.click();
    const form = page.getByRole("dialog", { name: "Quick capture" });
    await form
      .getByLabel("Title", { exact: true })
      .fill("Choose the right next step");
    await page.screenshot({ path: testInfo.outputPath("capture-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await form.getByRole("tab", { name: "Other items" }).click();
    await form.getByRole("radio", { name: /Request/ }).check();
    await form.getByRole("tab", { name: "Other items" }).focus();
    await expect(
      form.getByRole("button", { name: "Create request", exact: true }),
    ).toBeInViewport();
    for (const tab of await form.getByRole("tab").all())
      await expect(tab).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("capture-mobile.png") });
    await page.keyboard.press("Escape");
    await expect(form).toHaveCount(0);
  });
}
