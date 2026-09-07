/** Read a complete cursor collection without an arbitrary account-size ceiling. */
export async function readAllPages<T>(
  read: (cursor: string | undefined) => Promise<{
    data: T[];
    nextCursor?: string | null;
  }>,
  onPage?: (records: readonly T[], hasMore: boolean) => void | Promise<void>,
): Promise<T[]> {
  const records: T[] = [];
  const visited = new Set<string>();
  let cursor: string | undefined;
  for (;;) {
    const page = await read(cursor);
    records.push(...page.data);
    await onPage?.(records, Boolean(page.nextCursor));
    if (!page.nextCursor) return records;
    if (visited.has(page.nextCursor)) {
      throw new Error(
        "The server repeated a pagination cursor. Refresh to try again.",
      );
    }
    visited.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}
