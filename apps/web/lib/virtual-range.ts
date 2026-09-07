export function itemOffsets(
  keys: readonly string[],
  sizes: ReadonlyMap<string, number>,
  estimate: number,
): number[] {
  const offsets = [0];
  for (const key of keys)
    offsets.push(
      offsets[offsets.length - 1]! + Math.max(24, sizes.get(key) ?? estimate),
    );
  return offsets;
}

export function indexAtOffset(
  offsets: readonly number[],
  position: number,
): number {
  let low = 0;
  let high = Math.max(0, offsets.length - 2);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (offsets[middle]! <= position) low = middle;
    else high = middle - 1;
  }
  return low;
}

export function visibleItemIndexes(
  offsets: readonly number[],
  top: number,
  height: number,
  focusedIndex = -1,
): number[] {
  const count = Math.max(0, offsets.length - 1);
  if (!count) return [];
  const start = Math.max(0, indexAtOffset(offsets, top) - 5);
  const end = Math.min(count, indexAtOffset(offsets, top + height) + 7);
  const indexes = new Set<number>();
  for (let index = start; index < end; index++) indexes.add(index);
  if (focusedIndex >= 0 && focusedIndex < count) indexes.add(focusedIndex);
  return [...indexes].sort((left, right) => left - right);
}
