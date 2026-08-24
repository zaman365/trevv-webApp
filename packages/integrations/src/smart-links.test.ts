import { describe, expect, it } from "vitest";
import { parseSmartLink } from "./index";

describe("smart links", () => {
  it.each([
    ["https://www.figma.com/design/abc/launch", "figma"],
    ["https://github.com/founderhq/app/pull/12", "github"],
    ["https://www.canva.com/design/abc", "canva"],
  ])("detects %s", (url, provider) =>
    expect(parseSmartLink(url)?.provider).toBe(provider),
  );
  it("rejects unsafe and invalid URLs", () => {
    expect(parseSmartLink("javascript:alert(1)")).toBeNull();
    expect(parseSmartLink("not a URL")).toBeNull();
  });
});
