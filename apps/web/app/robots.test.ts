import { afterEach, describe, expect, it } from "vitest";
import robots from "./robots";

const originalUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalUrl;
});

describe("private-beta crawler policy", () => {
  it("disallows indexing and publishes only the configured canonical host", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://preview.trevv.test";
    expect(robots()).toEqual({
      rules: { userAgent: "*", disallow: "/" },
      host: "https://preview.trevv.test",
    });
  });
});
