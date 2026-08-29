import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("repository source boundary", () => {
  it("keeps API code behind @founderhq/db repositories", () => {
    const apiSource = resolve(import.meta.dirname, "../../../apps/api/src");
    const forbiddenImports =
      /(?:from\s+|import\s*\()["'](?:drizzle-orm(?:\/[^"']*)?|@founderhq\/db\/schema|[^"']*packages\/db\/src\/schema(?:\.js)?)["']/;
    const violations = sourceFiles(apiSource)
      .filter((path) => forbiddenImports.test(readFileSync(path, "utf8")))
      .map((path) => path.slice(apiSource.length + 1));

    expect(violations).toEqual([]);
  });
});
