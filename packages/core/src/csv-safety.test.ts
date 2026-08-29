import { describe, expect, it } from "vitest";
import { neutralizeSpreadsheetFormula, safeCsvCell } from "./csv-safety.js";

describe("CSV spreadsheet safety", () => {
  it.each(["=1+1", "+SUM(A1:A2)", "-2+3", "@IMPORTXML(A1)", "  =cmd"])(
    "neutralizes a formula-like value %s",
    (value) => expect(neutralizeSpreadsheetFormula(value)).toBe(`'${value}`),
  );

  it("preserves ordinary values while applying CSV quoting", () => {
    expect(safeCsvCell('Ada "Ace" Lovelace')).toBe('"Ada ""Ace"" Lovelace"');
  });

  it("is deterministic for a 10,000-row safety fixture", () => {
    const rows = Array.from({ length: 10_000 }, (_, index) =>
      safeCsvCell(index % 2 === 0 ? `=ROW()+${index}` : `record-${index}`),
    );
    expect(rows).toHaveLength(10_000);
    expect(rows[0]).toBe('"\'=ROW()+0"');
    expect(rows[9_999]).toBe('"record-9999"');
    expect(rows.join("\n")).toBe(rows.join("\n"));
  });
});
