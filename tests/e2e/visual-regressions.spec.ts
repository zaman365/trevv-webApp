import {
  expect,
  type BrowserContext,
  type Locator,
  type Page,
  test,
  type TestInfo,
} from "@playwright/test";
import { themePreferenceCookie } from "../../apps/web/lib/display-preferences";
import { gotoCanonical, workspaceRoute } from "./routes";

const onboardingWidths = [320, 390, 768, 1280] as const;
const visualDiffPixelRatio = 0.005;
const visualScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  maxDiffPixelRatio: visualDiffPixelRatio,
} as const;

const rectanglesOverlap = (
  first: { top: number; right: number; bottom: number; left: number },
  second: { top: number; right: number; bottom: number; left: number },
) =>
  first.left < second.right &&
  first.right > second.left &&
  first.top < second.bottom &&
  first.bottom > second.top;

async function expectCompactChoiceControl(control: Locator) {
  await expect(control).toBeVisible();
  const measurements = await control.evaluate((element) => {
    const input = element as HTMLInputElement;
    const inputRect = input.getBoundingClientRect();
    const label = input.closest("label");
    const textRects = [...(label?.querySelectorAll("strong, small") ?? [])].map(
      (text) => {
        const range = document.createRange();
        range.selectNodeContents(text);
        return range.getBoundingClientRect();
      },
    );
    const styles = getComputedStyle(input);

    return {
      width: styles.width,
      height: styles.height,
      inputRect: {
        top: inputRect.top,
        right: inputRect.right,
        bottom: inputRect.bottom,
        left: inputRect.left,
      },
      textRects: textRects.map((rect) => ({
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      })),
    };
  });

  expect(measurements.width).toBe("18px");
  expect(measurements.height).toBe("18px");
  for (const textRect of measurements.textRects) {
    expect(rectanglesOverlap(measurements.inputRect, textRect)).toBe(false);
  }
}

async function expectChoiceGrid(page: Page, selector: string) {
  const controls = page.locator(`${selector} input`);
  expect(await controls.count()).toBeGreaterThan(0);
  for (let index = 0; index < (await controls.count()); index += 1) {
    await expectCompactChoiceControl(controls.nth(index));
  }
}

async function goToOnboardingStep(page: Page, step: number) {
  await page.goto("/onboarding");
  for (let currentStep = 1; currentStep < step; currentStep += 1) {
    await page.getByRole("button", { name: "Continue" }).click();
  }
}

async function expectDeterministicVisualFont(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() => document.fonts.check('16px "TREVV Sans"')),
  ).toBe(true);
  await expect(page.locator("body")).toHaveCSS("font-family", /TREVV Sans/);
}

function requireChromiumVisualBaseline(testInfo: TestInfo) {
  test.skip(
    testInfo.project.name !== "chromium",
    "Chromium is the visual-baseline project; WebKit remains a behavioral and accessibility gate.",
  );
}

async function enableDarkTheme(context: BrowserContext, page: Page) {
  await context.addCookies([
    {
      name: themePreferenceCookie,
      value: "dark",
      url: new URL("/", page.url()).href,
    },
  ]);
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
}

async function expectTechnicalPreviewBadgeFullyVisible(page: Page) {
  const badge = page.getByRole("note", {
    name: /Technical preview · fictional data · changes stay in this browser/i,
  });
  await expect(badge).toBeVisible();

  const geometry = await badge.evaluate((element) => {
    const badgeRect = element.getBoundingClientRect();
    const text = element.querySelector<HTMLElement>("span:last-child");
    const textRects = [...element.querySelectorAll("strong, small")].map(
      (node) => node.getBoundingClientRect(),
    );
    return {
      badgeLeft: badgeRect.left,
      badgeRight: badgeRect.right,
      contentLeft: Math.min(...textRects.map((rect) => rect.left)),
      contentRight: Math.max(...textRects.map((rect) => rect.right)),
      textClientWidth: text?.clientWidth ?? 0,
      textScrollWidth: text?.scrollWidth ?? 1,
      viewportWidth: document.documentElement.clientWidth,
    };
  });

  expect(geometry.badgeLeft).toBeGreaterThanOrEqual(0);
  expect(geometry.badgeRight).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.contentLeft).toBeGreaterThanOrEqual(geometry.badgeLeft - 1);
  expect(geometry.contentRight).toBeLessThanOrEqual(geometry.badgeRight + 1);
  expect(geometry.textClientWidth).toBeGreaterThanOrEqual(
    geometry.textScrollWidth,
  );
}

async function focusWithKeyboard(
  page: Page,
  startingPoint: Locator,
  target: Locator,
  key: "Tab" | "Alt+Tab" = "Tab",
) {
  // WebKit keeps a sequential-navigation starting point separately from
  // document.activeElement. Blurring a Continue button that React replaces
  // between onboarding steps can therefore strand later Tab presses on body.
  // Start from the stable preceding link, then use only keyboard traversal to
  // prove the choice control participates in the browser's tab order.
  await startingPoint.focus();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.keyboard.press(key);
    if (
      await target.evaluate((element) => document.activeElement === element)
    ) {
      return;
    }
  }
  throw new Error("Choice control was not reachable in the keyboard tab order");
}

test("onboarding choice controls stay compact, legible, and keyboard operable", async ({
  page,
}) => {
  const steps = [
    {
      step: 1,
      selector: ".managing-grid",
      heading: "What are you managing?",
      control: "radio",
    },
    {
      step: 3,
      selector: ".blueprint-choice-grid",
      heading: "Choose a starter Blueprint",
      control: "radio",
    },
    {
      step: 4,
      selector: ".setup-option-grid",
      heading: "Bring your team and context",
      control: "checkbox",
    },
  ] as const;

  for (const scenario of steps) {
    await goToOnboardingStep(page, scenario.step);
    await expect(
      page.getByRole("heading", { name: scenario.heading, level: 1 }),
    ).toBeVisible();

    for (const width of onboardingWidths) {
      await page.setViewportSize({ width, height: 900 });
      await expectChoiceGrid(page, scenario.selector);
    }

    const firstControl = page
      .locator(`${scenario.selector} input[type="${scenario.control}"]`)
      .first();
    const keyboardStartingPoint = page.getByRole("link", {
      name: "Exit setup",
    });
    // Safari on macOS may follow the platform's reduced tab-order default.
    // Try the portable Tab path first, then its Option+Tab fallback without
    // making Linux WebKit emulate a macOS-only keyboard convention.
    try {
      await focusWithKeyboard(page, keyboardStartingPoint, firstControl, "Tab");
    } catch {
      await focusWithKeyboard(
        page,
        keyboardStartingPoint,
        firstControl,
        "Alt+Tab",
      );
    }
    await expect(firstControl).toBeFocused();
    await expect(firstControl.locator("xpath=..")).toHaveCSS(
      "outline-width",
      "2px",
    );

    if (scenario.control === "radio") {
      await page.keyboard.press("ArrowDown");
      await expect(
        page.locator(`${scenario.selector} input[type="radio"]`).nth(1),
      ).toBeChecked();
    } else {
      const wasChecked = await firstControl.isChecked();
      await page.keyboard.press("Space");
      if (wasChecked) {
        await expect(firstControl).not.toBeChecked();
      } else {
        await expect(firstControl).toBeChecked();
      }
    }

    // CSS zoom gives the browser a deterministic 200% rendering pass. The
    // geometry assertion catches a choice control covering its title/copy.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator("html").evaluate((html) => {
      html.style.zoom = "2";
    });
    await expectChoiceGrid(page, scenario.selector);
  }
});

for (const height of [768, 820, 900, 945] as const) {
  test(`sidebar keeps all regions reachable at ${height}px high`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height });
    await gotoCanonical(page, workspaceRoute("dashboard"));

    const sidebar = page.locator("aside.sidebar");
    const header = sidebar.locator(".brand-row");
    const navigation = sidebar.getByRole("navigation", {
      name: "Primary navigation",
    });
    const footer = sidebar.locator(".sidebar-foot");

    await expect(header).toBeVisible();
    await expect(navigation).toBeVisible();
    await expect(footer).toBeVisible();

    const regionMetrics = await sidebar.evaluate((element) => {
      const aside = element as HTMLElement;
      const nav = aside.querySelector("nav") as HTMLElement;
      const foot = aside.querySelector(".sidebar-foot") as HTMLElement;
      const brand = aside.querySelector(".brand-row") as HTMLElement;
      const asideRect = aside.getBoundingClientRect();
      const navRect = nav.getBoundingClientRect();
      const footRect = foot.getBoundingClientRect();
      const brandRect = brand.getBoundingClientRect();

      return {
        asideBottom: asideRect.bottom,
        asideScrollHeight: aside.scrollHeight,
        asideClientHeight: aside.clientHeight,
        brandBottom: brandRect.bottom,
        navTop: navRect.top,
        navBottom: navRect.bottom,
        navScrollHeight: nav.scrollHeight,
        navClientHeight: nav.clientHeight,
        navOverflowY: getComputedStyle(nav).overflowY,
        footTop: footRect.top,
        footBottom: footRect.bottom,
      };
    });

    expect(regionMetrics.navTop).toBeGreaterThanOrEqual(
      regionMetrics.brandBottom,
    );
    expect(regionMetrics.navBottom).toBeLessThanOrEqual(regionMetrics.footTop);
    expect(regionMetrics.footBottom).toBeLessThanOrEqual(
      regionMetrics.asideBottom,
    );
    expect(regionMetrics.asideScrollHeight).toBeLessThanOrEqual(
      regionMetrics.asideClientHeight + 1,
    );
    expect(regionMetrics.navOverflowY).toBe("auto");
    expect(regionMetrics.navScrollHeight).toBeGreaterThan(
      regionMetrics.navClientHeight,
    );

    const footerTopBeforeScroll = regionMetrics.footTop;
    const navigationItems = navigation.locator(".nav-item");
    for (let index = 0; index < (await navigationItems.count()); index += 1) {
      const item = navigationItems.nth(index);
      await item.scrollIntoViewIfNeeded();
      await expect(item).toBeInViewport();
      await item.focus();
      expect(
        await item.evaluate((element) => document.activeElement === element),
      ).toBe(true);

      const [itemBox, navBox] = await Promise.all([
        item.boundingBox(),
        navigation.boundingBox(),
      ]);
      expect(itemBox).not.toBeNull();
      expect(navBox).not.toBeNull();
      expect(itemBox!.y).toBeGreaterThanOrEqual(navBox!.y);
      expect(itemBox!.y + itemBox!.height).toBeLessThanOrEqual(
        navBox!.y + navBox!.height,
      );
    }

    const footerTopAfterScroll = await footer.evaluate(
      (element) => element.getBoundingClientRect().top,
    );
    expect(footerTopAfterScroll).toBeCloseTo(footerTopBeforeScroll, 1);
    await expect(
      footer.getByRole("link", { name: "Settings", exact: true }),
    ).toBeVisible();
  });
}

test("theme follows the system until an explicit choice and then persists", async ({
  context,
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await gotoCanonical(page, workspaceRoute("dashboard"));

  const html = page.locator("html");
  await expect(html).toHaveAttribute("lang", "en");
  await expect(html).not.toHaveAttribute("data-theme");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(17, 21, 34)",
  );

  const userMenuButton = page.getByRole("button", { name: "Open user menu" });
  let preferenceRegion: Locator;
  if (await userMenuButton.isVisible()) {
    await userMenuButton.click();
    preferenceRegion = page.getByRole("menu");
  } else {
    await page.getByRole("button", { name: "More", exact: true }).click();
    preferenceRegion = page.locator("aside.sidebar");
    await expect(preferenceRegion).toHaveClass(/sidebar-open/);
  }
  const languageStatus = preferenceRegion.getByLabel("Language: English only");
  await expect(languageStatus).toBeVisible();
  await expect(languageStatus).toBeDisabled();
  await expect(preferenceRegion).not.toContainText("German");

  await preferenceRegion
    .getByText("Switch to light mode", { exact: true })
    .click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(245, 246, 250)",
  );
  expect(
    (await context.cookies()).find(
      (cookie) => cookie.name === themePreferenceCookie,
    )?.value,
  ).toBe("light");

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await gotoCanonical(page, workspaceRoute("attention"));
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await gotoCanonical(page, `${workspaceRoute("settings")}#organization`);
  const languageSelect = page.getByLabel("Default language");
  await expect(languageSelect).toBeDisabled();
  await expect(languageSelect).toHaveValue("English");
  await expect(languageSelect.locator("option")).toHaveCount(1);
  await expect(page.getByText("English only in this release.")).toBeVisible();
});

test("Messages keeps its context drawer inside a 1024px viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 820 });
  await gotoCanonical(page, workspaceRoute("messages"));

  const contextAside = page.locator(".conversation-context");
  const openContext = page.getByRole("button", { name: "Open room context" });
  const expectNoHorizontalOverflow = async () => {
    const metrics = await page.evaluate(() => {
      const shell = document.querySelector(".messaging-shell");
      return {
        bodyWidth: document.body.scrollWidth,
        documentWidth: document.documentElement.scrollWidth,
        shellRight: shell?.getBoundingClientRect().right ?? 0,
        viewportWidth: window.innerWidth,
      };
    });

    expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    expect(metrics.documentWidth).toBeLessThanOrEqual(
      metrics.viewportWidth + 1,
    );
    expect(metrics.shellRight).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  };

  await expect(openContext).toBeVisible();
  await expect(contextAside).toBeHidden();
  await expect(contextAside).toHaveCSS("display", "none");
  await expectNoHorizontalOverflow();

  await openContext.click();
  await expect(contextAside).toBeVisible();
  const drawer = await contextAside.boundingBox();
  expect(drawer).not.toBeNull();
  expect(drawer!.x).toBeGreaterThanOrEqual(0);
  expect(drawer!.x + drawer!.width).toBeLessThanOrEqual(1025);
  expect(drawer!.y).toBeGreaterThanOrEqual(0);
  expect(drawer!.y + drawer!.height).toBeLessThanOrEqual(821);
  await expectNoHorizontalOverflow();

  await page.getByRole("button", { name: "Close room context" }).click();
  await expect(contextAside).toBeHidden();
  await expect(contextAside).toHaveCSS("display", "none");
});

test("Messages preserves a readable thread at sidebar and context breakpoints", async ({
  page,
}) => {
  for (const width of [
    820, 821, 900, 901, 961, 962, 963, 964, 1281, 1300, 1340,
  ] as const) {
    await page.setViewportSize({ width, height: 820 });
    await gotoCanonical(page, workspaceRoute("messages"));

    const layout = await page.evaluate(() => {
      const context = document.querySelector<HTMLElement>(
        ".conversation-context",
      );
      const thread = document.querySelector<HTMLElement>(".message-column");
      return {
        bodyWidth: document.body.scrollWidth,
        contextDisplay: context ? getComputedStyle(context).display : "missing",
        documentWidth: document.documentElement.scrollWidth,
        threadWidth: thread?.getBoundingClientRect().width ?? 0,
        viewportWidth: window.innerWidth,
      };
    });

    expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.threadWidth).toBeGreaterThanOrEqual(420);
    expect(layout.contextDisplay).toBe(width <= 1320 ? "none" : "flex");
  }
});

test("pseudo-localized long content stays contained at a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoCanonical(page, workspaceRoute("messages"));

  const pseudoTitle =
    "⟦ Ŧḗȧḿ ḿḗşşȧɠḗş ƒőř ȧ ḿűƈħ łőƞɠḗř ƥřőḓűƈŧ ƞȧḿḗ ȧƞḓ ƈőƞŧḗẋŧ ⟧";
  const pseudoMessage =
    "⟦ Ŧħīş ḗẋƥȧƞḓḗḓ ƥşḗűḓő-łőƈȧłīzḗḓ ḿḗşşȧɠḗ ȧḓḓş ḓīȧƈřīŧīƈş ȧƞḓ ḗẋŧřȧ ŵőřḓş ŧő ƥřőṽḗ ŧħȧŧ łőƞɠ ƈőƞŧḗƞŧ ŵřȧƥş ŵīŧħőűŧ ƥűşħīƞɠ ƈőƞŧřőłş őƒƒ şƈřḗḗƞ. ⟧";

  await page.locator(".conversation-header h2").evaluate((node, value) => {
    node.textContent = value;
  }, pseudoTitle);
  await page
    .locator(".message-content > p")
    .first()
    .evaluate((node, value) => {
      node.textContent = value;
    }, pseudoMessage);

  await expect(page.locator(".conversation-header h2")).toHaveText(pseudoTitle);
  await expect(page.locator(".message-content > p").first()).toHaveText(
    pseudoMessage,
  );
  await expect(
    page.getByRole("button", { name: "Open room context" }),
  ).toBeVisible();
  await expect(page.locator(".message-composer textarea")).toBeVisible();

  const layout = await page.evaluate(() => {
    const title = document.querySelector(".conversation-header h2");
    const message = document.querySelector(".message-content > p");
    const viewportWidth = document.documentElement.clientWidth;
    return {
      bodyWidth: document.body.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
      messageRight: message?.getBoundingClientRect().right ?? 0,
      titleRight: title?.getBoundingClientRect().right ?? 0,
      viewportWidth,
    };
  });

  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.titleRight).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.messageRight).toBeLessThanOrEqual(layout.viewportWidth + 1);
});

test("the global technical-preview badge remains fully visible at constrained widths", async ({
  page,
}) => {
  for (const scenario of [
    { width: 1024, height: 820, route: workspaceRoute("messages") },
    { width: 390, height: 844, route: workspaceRoute("teams") },
    { width: 320, height: 700, route: workspaceRoute("teams") },
  ]) {
    await page.setViewportSize(scenario);
    await gotoCanonical(page, scenario.route);
    await expectDeterministicVisualFont(page);
    await expectTechnicalPreviewBadgeFullyVisible(page);
  }
});

test("Portfolio light matches its reviewed visual baseline", async ({
  page,
}, testInfo) => {
  requireChromiumVisualBaseline(testInfo);
  await page.setViewportSize({ width: 1280, height: 900 });
  await gotoCanonical(page, "/app/portfolio");
  await expectDeterministicVisualFont(page);
  await expect(page).toHaveScreenshot(
    "portfolio-light.png",
    visualScreenshotOptions,
  );
});

test("Portfolio dark matches its reviewed visual baseline", async ({
  context,
  page,
}, testInfo) => {
  requireChromiumVisualBaseline(testInfo);
  await page.setViewportSize({ width: 1280, height: 900 });
  await gotoCanonical(page, "/app/portfolio");
  await enableDarkTheme(context, page);
  await expectDeterministicVisualFont(page);
  await expect(page).toHaveScreenshot(
    "portfolio-dark.png",
    visualScreenshotOptions,
  );
});

test("Messages medium dark matches its reviewed visual baseline", async ({
  context,
  page,
}, testInfo) => {
  requireChromiumVisualBaseline(testInfo);
  await page.setViewportSize({ width: 1024, height: 820 });
  await gotoCanonical(page, workspaceRoute("messages"));
  await enableDarkTheme(context, page);
  await expectDeterministicVisualFont(page);
  await page.getByRole("button", { name: "Open room context" }).click();
  await expect(page.locator(".conversation-context")).toBeVisible();
  await expect(page).toHaveScreenshot(
    "messages-medium-dark.png",
    visualScreenshotOptions,
  );
});

test("Teams mobile dark matches its reviewed visual baseline", async ({
  context,
  page,
}, testInfo) => {
  requireChromiumVisualBaseline(testInfo);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoCanonical(page, workspaceRoute("teams"));
  await enableDarkTheme(context, page);
  await expectDeterministicVisualFont(page);
  await expect(page).toHaveScreenshot(
    "teams-mobile-dark.png",
    visualScreenshotOptions,
  );
});
