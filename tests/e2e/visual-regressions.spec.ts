import { expect, type Locator, type Page, test } from "@playwright/test";
import { gotoCanonical, workspaceRoute } from "./routes";

const onboardingWidths = [320, 390, 768, 1280] as const;

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

async function focusWithKeyboard(page: Page, target: Locator) {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.keyboard.press("Tab");
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
    await focusWithKeyboard(page, firstControl);
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
      await expect(item).toBeFocused();

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
