import { describe, expect, it } from "vitest";
import { productCopy } from "./product-copy";

describe("product copy", () => {
  it("keeps core navigation and workflow labels outside components", () => {
    expect(productCopy.en.board.title).toBe("SS26 launch board");
    expect(productCopy.en.focus.decisionsTitle).toBe("Decision Center");
    expect(productCopy.en.auth.onboardingTitle).toBeTruthy();
    expect(productCopy.en.nav.hubs).toBe("Projects");
    expect(productCopy.en.auth.chooseHubs).toBe("Choose starter projects");
  });
});
