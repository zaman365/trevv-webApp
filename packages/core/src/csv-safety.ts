const spreadsheetFormulaPrefix = /^[\t\r\n ]*[=+\-@]/u;

/**
 * Neutralize values that spreadsheet programs can interpret as formulas.
 * The leading apostrophe is retained as text by common CSV consumers.
 */
export function neutralizeSpreadsheetFormula(value: string): string {
  return spreadsheetFormulaPrefix.test(value) ? `'${value}` : value;
}

export function safeCsvCell(value: string): string {
  return `"${neutralizeSpreadsheetFormula(value).replaceAll('"', '""')}"`;
}
