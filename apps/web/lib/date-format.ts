/** Cache only formatting configuration, never user records or formatted data. */
const formatters = new Map<string, Intl.DateTimeFormat>();
const formatterLimit = 64;

export function dateTimeFormatter(
  locales?: Intl.LocalesArgument,
  options: Intl.DateTimeFormatOptions = {},
): Intl.DateTimeFormat {
  const key = JSON.stringify([
    Array.isArray(locales)
      ? locales.map(String)
      : locales === undefined
        ? undefined
        : String(locales),
    Object.entries(options).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  ]);
  const existing = formatters.get(key);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat(locales, options);
  if (formatters.size >= formatterLimit) {
    formatters.delete(formatters.keys().next().value!);
  }
  formatters.set(key, formatter);
  return formatter;
}
