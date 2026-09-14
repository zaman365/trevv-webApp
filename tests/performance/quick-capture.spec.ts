import { expect, test } from "@playwright/test";
import { setup } from "../fixtures/live-workflow-browser";
import { item } from "../../apps/web/test-fixtures/live-workflow-data";

test("assignment invitations load on expansion and retain their draft when collapsed", async ({
  page,
}) => {
  let invitationReads = 0;
  await setup(page, "", {
    view: "capture",
    api: async (route) => {
      if (!new URL(route.request().url()).pathname.endsWith("/invitations"))
        return false;
      invitationReads++;
      await route.fulfill({ json: [] });
      return true;
    },
  });
  await page
    .getByRole("button", { name: "Quick capture", exact: true })
    .click();
  const form = page.getByTestId("live-quick-capture");
  const toggle = form
    .locator("summary")
    .filter({ hasText: /Add people to assign work|Missing someone/ });
  await expect(toggle).toBeVisible();
  expect(invitationReads).toBe(0);
  await toggle.click();
  const email = form.getByLabel("Email address", { exact: true });
  await expect(email).toBeVisible();
  await email.fill("teammate@example.test");
  await toggle.click();
  await expect(email).toBeHidden();
  await toggle.click();
  await expect(email).toHaveValue("teammate@example.test");
  expect(invitationReads).toBe(1);
});

test("a recovered task never silently switches to a different available board", async ({
  page,
}) => {
  const state = await setup(page, "", { view: "capture" });
  const open = page.getByRole("button", { name: "Quick capture", exact: true });
  await open.click();
  const form = page.getByTestId("live-quick-capture");
  await form
    .getByLabel("Title", { exact: true })
    .fill("Draft for the original board");
  await form.getByRole("button", { name: "Close capture" }).click();
  await page.evaluate(() => {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)!;
      if (!key.startsWith("trevv:live-draft:v1:")) continue;
      const draft = JSON.parse(localStorage.getItem(key)!);
      draft.payload.boardId = "board-no-longer-accessible";
      localStorage.setItem(key, JSON.stringify(draft));
    }
  });
  await open.click();
  await expect(form.getByLabel("Destination board")).toHaveValue("");
  await expect(form.getByTestId("live-capture-submit")).toBeDisabled();
  await expect(form.getByLabel("Title", { exact: true })).toHaveValue(
    "Draft for the original board",
  );
  expect(state.creations).toHaveLength(0);
  await form.getByLabel("Destination board").selectOption("board-one");
  await form.getByTestId("live-capture-submit").click();
  await expect(form).toBeHidden();
  expect(state.creations).toHaveLength(1);
  expect(state.creations[0].boardId).toBe("board-one");
});

for (const failure of [
  "missing receipt",
  "unreadable response",
  "lost connection",
]) {
  test(`task retry after ${failure} recovers the same saved task across reload`, async ({
    page,
  }) => {
    const requests: Array<{ key: string; input: Record<string, unknown> }> = [];
    let saved: Record<string, unknown> | undefined;
    await setup(page, "", {
      view: "dashboard",
      styled: true,
      dashboard: true,
      api: async (route) => {
        const request = route.request();
        if (
          new URL(request.url()).pathname !== "/api/v1/items" ||
          request.method() !== "POST"
        )
          return false;
        const input = request.postDataJSON();
        requests.push({ key: request.headers()["idempotency-key"], input });
        saved ??= {
          ...item,
          ...input,
          id: "confirmed-task",
          assignees: [{ id: "user-one", name: "Owner" }],
        };
        if (requests.length === 1) {
          if (failure === "lost connection")
            await route.abort("connectionreset");
          else if (failure === "unreadable response")
            await route.fulfill({
              status: 502,
              contentType: "text/html",
              body: "Gateway error",
            });
          else await route.fulfill({ status: 201, json: saved });
        } else
          await route.fulfill({
            status: 201,
            json: saved,
            headers: { etag: '"1"', "idempotency-replayed": "true" },
          });
        return true;
      },
    });
    const open = page.getByRole("button", { name: "New task", exact: true });
    await open.click();
    const form = page.getByTestId("live-quick-capture");
    await form.getByLabel("Title", { exact: true }).fill("Demo Task");
    await form.getByLabel("Due date · Optional").fill("2026-09-15");
    await form
      .getByRole("button", { name: "Create task", exact: true })
      .click();
    await expect(
      form.getByRole("button", { name: "Retry save" }),
    ).toBeVisible();
    await expect(form.getByLabel("Title", { exact: true })).toHaveValue(
      "Demo Task",
    );
    // Re-selecting an unchanged field must not turn a retry into a new task.
    await form.getByLabel("Priority").selectOption("normal");
    await form.getByRole("button", { name: "Close capture" }).click();
    await page.reload();
    await open.click();
    await expect(form.getByLabel("Title", { exact: true })).toHaveValue(
      "Demo Task",
    );
    await form.getByTestId("live-capture-submit").click();
    await expect(form).toBeHidden();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    await open.click();
    await expect(form.getByLabel("Title", { exact: true })).toHaveValue("");
  });
}

for (const width of [1440, 390]) {
  test(`Dashboard New task opens task creation and preserves separate capture drafts at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const state = await setup(page, "", { view: "capture", styled: true });
    const captureUrl = page.url();
    await page
      .getByRole("button", { name: "Quick capture", exact: true })
      .click();
    const form = page.getByTestId("live-quick-capture");
    await form.getByRole("tab", { name: "Other items" }).click();
    await form.getByRole("radio", { name: /Request/ }).check();
    await form
      .getByLabel("Title", { exact: true })
      .fill("Keep the general request draft");
    await form.getByRole("button", { name: "Close capture" }).click();

    const dashboardUrl = new URL(captureUrl);
    dashboardUrl.searchParams.set("view", "dashboard");
    await page.setViewportSize({ width, height: 900 });
    await page.goto(dashboardUrl.href);
    const newTask = page.getByRole("button", { name: "New task", exact: true });
    await newTask.click();
    await expect(
      page.getByRole("dialog", { name: "Create Task", exact: true }),
    ).toBeVisible();
    await expect(
      form.getByRole("tab", { name: "Task", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(form.getByLabel("Title", { exact: true })).toHaveValue("");
    await form
      .getByLabel("Title", { exact: true })
      .fill("Dashboard task with an owner");
    await form.getByLabel("Choose assignee").selectOption("user-two");
    await form.getByLabel("Due date · Optional").fill("2026-10-10");
    await form.getByLabel("Priority").selectOption("high");
    await page.screenshot({ path: testInfo.outputPath("create-task.png") });

    await form.getByRole("tab", { name: "Other items" }).click();
    await form.getByRole("radio", { name: /Request/ }).check();
    await expect(
      page.getByRole("dialog", { name: "Create Request", exact: true }),
    ).toBeVisible();
    await form
      .getByLabel("Title", { exact: true })
      .fill("Optional request draft");
    await form.getByRole("button", { name: "Close capture" }).click();
    await page.reload();
    await newTask.click();
    await expect(
      page.getByRole("dialog", { name: "Create Task", exact: true }),
    ).toBeVisible();
    await expect(
      form.getByRole("tab", { name: "Task", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(form.getByLabel("Title", { exact: true })).toHaveValue(
      "Dashboard task with an owner",
    );
    await expect(form.getByLabel("Choose assignee")).toHaveValue("user-two");
    await expect(form.getByLabel("Due date · Optional")).toHaveValue(
      "2026-10-10",
    );
    await expect(form.getByLabel("Priority")).toHaveValue("high");
    await form.getByRole("tab", { name: "Other items" }).click();
    await form.getByRole("radio", { name: /Request/ }).check();
    await expect(form.getByLabel("Title", { exact: true })).toHaveValue(
      "Optional request draft",
    );
    await form.getByRole("tab", { name: "Task", exact: true }).click();
    await form
      .getByRole("button", { name: "Create task", exact: true })
      .click();
    await expect(form).toBeHidden();
    expect(state.creations).toHaveLength(1);
    expect(state.creations[0]).toMatchObject({
      type: "task",
      title: "Dashboard task with an owner",
      assigneeIds: ["user-two"],
      boardId: "board-one",
      priority: "high",
    });
    expect(state.creations[0].dueDate).toContain("2026-10-10");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(captureUrl);
    await page
      .getByRole("button", { name: "Quick capture", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Quick capture", exact: true }),
    ).toBeVisible();
    await expect(form.getByRole("radio", { name: /Request/ })).toBeChecked();
    await expect(form.getByLabel("Title", { exact: true })).toHaveValue(
      "Keep the general request draft",
    );
  });
}

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
    const visualStyle = (element: Element) => {
      const style = getComputedStyle(element);
      return {
        color: style.color,
        background: style.backgroundColor,
        border: style.borderWidth,
      };
    };
    expect(await button.evaluate(visualStyle)).toEqual(
      await neighbor.evaluate(visualStyle),
    );
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
