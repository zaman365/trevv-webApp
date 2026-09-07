import type { WindowedCollectionHandle } from "../components/windowed-collection";

export interface CollectionScrollAnchor {
  key: string;
  offset: number;
}

/** Remember logical message identity, so prepends and the virtualization threshold cannot shift history. */
export function captureMessageScrollAnchor(
  scroller: HTMLElement,
  keys: ReadonlySet<string>,
): CollectionScrollAnchor | null {
  const top = scroller.getBoundingClientRect().top;
  const row = Array.from(
    scroller.querySelectorAll<HTMLElement>("[data-message-id]"),
  ).find(
    (element) =>
      keys.has(element.dataset.messageId ?? "") &&
      element.getBoundingClientRect().bottom > top,
  );
  return row
    ? {
        key: row.dataset.messageId!,
        offset: row.getBoundingClientRect().top - top,
      }
    : null;
}

export function restoreMessageScrollAnchor(
  scroller: HTMLElement,
  anchor: CollectionScrollAnchor,
  collection: WindowedCollectionHandle | null,
) {
  const row = Array.from(
    scroller.querySelectorAll<HTMLElement>("[data-message-id]"),
  ).find((element) => element.dataset.messageId === anchor.key);
  if (row)
    scroller.scrollBy({
      top:
        row.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top -
        anchor.offset,
      behavior: "instant",
    });
  else collection?.scrollToKey(anchor.key, anchor.offset);
}
