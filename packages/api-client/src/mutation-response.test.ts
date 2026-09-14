import { describe, expect, it } from "vitest";
import { confirmSavedResource } from "./mutation-response";

describe("shared save receipts", () => {
  const schema = {
    parse: (value: unknown) => value as { version: number | string },
  };
  for (const version of [0, 4, "2026-09-14T12:00:00.000Z"]) {
    it.each([
      { etag: `"${version}"` },
      { etag: `W/"${version}"` },
      { "x-trevv-resource-version": String(version) },
      {
        "x-trevv-resource-version": String(version),
        etag: 'W/"transformed-by-proxy"',
      },
    ])(
      `confirms version ${version} through transport transformations: %j`,
      (headers) => {
        const saved = confirmSavedResource(
          { body: { version }, response: Response.json({}, { headers }) },
          schema,
          (value) => value.version,
        );
        expect(saved.etag).toBe(`"${version}"`);
      },
    );
  }
  it.each([
    {},
    { etag: 'W/"99"' },
    { "x-trevv-resource-version": "99", etag: '"4"' },
    { etag: '"4.0"' },
  ])(
    "does not invent a confirmation for a missing or mismatched receipt: %j",
    (headers) => {
      expect(() =>
        confirmSavedResource(
          { body: { version: 4 }, response: Response.json({}, { headers }) },
          schema,
          (value) => value.version,
        ),
      ).toThrow("valid save receipt");
    },
  );
});
