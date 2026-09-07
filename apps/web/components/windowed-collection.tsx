"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  indexAtOffset,
  itemOffsets,
  visibleItemIndexes,
} from "@/lib/virtual-range";
import styles from "./windowed-collection.module.css";

const focusableSelector =
  'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';

export interface WindowedCollectionHandle {
  scrollToKey(key: string, offset?: number): void;
}

/** Long collections retain every record while mounting only the viewport and the focused row. */
export function WindowedCollection<T>({
  items,
  itemKey,
  children,
  className,
  label,
  role,
  estimateHeight = 100,
  scrollRef,
  apiRef,
}: {
  items: readonly T[];
  itemKey: (item: T) => string;
  children: (item: T, index: number) => ReactNode;
  className?: string | undefined;
  label: string;
  role?: "list";
  estimateHeight?: number;
  scrollRef?: RefObject<HTMLDivElement | null>;
  apiRef?: RefObject<WindowedCollectionHandle | null>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState(() => new Map<string, number>());
  const [viewport, setViewport] = useState({ top: 0, height: 600 });
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const pendingFocus = useRef<{ index: number; last: boolean } | null>(null);
  const virtual = items.length > 100;
  const keys = useMemo(() => items.map(itemKey), [items, itemKey]);
  const offsets = useMemo(
    () => itemOffsets(keys, sizes, estimateHeight),
    [keys, estimateHeight, sizes],
  );
  const keyIndexes = useMemo(
    () => new Map(keys.map((key, index) => [key, index])),
    [keys],
  );
  const indexes = virtual
    ? visibleItemIndexes(
        offsets,
        viewport.top,
        viewport.height,
        focusedKey ? (keyIndexes.get(focusedKey) ?? -1) : -1,
      )
    : items.map((_, index) => index);
  const indexesKey = indexes.join(",");
  const readViewport = useCallback(() => {
    const root = rootRef.current;
    const scroller = scrollRef?.current ?? root;
    if (!root || !scroller) return;
    const inset =
      root === scroller
        ? 0
        : root.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop;
    const next = {
      top: Math.max(0, scroller.scrollTop - inset),
      height: scroller.clientHeight || 600,
    };
    setViewport((current) =>
      current.top === next.top && current.height === next.height
        ? current
        : next,
    );
  }, [scrollRef]);

  useImperativeHandle(
    apiRef,
    () => ({
      scrollToKey(key, offset = 0) {
        const index = keyIndexes.get(key);
        const root = rootRef.current;
        const scroller = scrollRef?.current ?? root;
        if (index === undefined || !root || !scroller) return;
        const inset =
          root === scroller
            ? 0
            : root.getBoundingClientRect().top -
              scroller.getBoundingClientRect().top +
              scroller.scrollTop;
        scroller.scrollTo({
          top: inset + offsets[index]! - offset,
          behavior: "instant",
        });
        readViewport();
      },
    }),
    [keyIndexes, offsets, readViewport, scrollRef],
  );

  useLayoutEffect(() => {
    if (!virtual) return;
    const scroller = scrollRef?.current ?? rootRef.current;
    if (!scroller) return;
    let frame: number | undefined;
    const update = () => {
      frame ??= requestAnimationFrame(() => {
        frame = undefined;
        readViewport();
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    scroller.addEventListener("scroll", update, { passive: true });
    readViewport();
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", update);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [virtual, scrollRef, readViewport]);

  useLayoutEffect(() => {
    if (!virtual || !rootRef.current) return;
    const root = rootRef.current;
    let frame: number | undefined;
    const changes = new Map<string, number>();
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const key = (entry.target as HTMLElement).dataset.collectionKey;
        const height = Math.max(
          24,
          entry.target.getBoundingClientRect().height,
        );
        if (key && Math.abs((sizes.get(key) ?? estimateHeight) - height) > 1)
          changes.set(key, height);
      }
      if (!changes.size || frame !== undefined) return;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        const anchor = indexAtOffset(offsets, viewport.top);
        let adjustment = 0;
        const nextSizes = new Map(sizes);
        for (const [key, height] of changes) {
          const index = keyIndexes.get(key) ?? -1;
          if (index >= 0 && index < anchor)
            adjustment += height - (sizes.get(key) ?? estimateHeight);
          nextSizes.set(key, height);
        }
        changes.clear();
        const scroller = scrollRef?.current ?? root;
        if (adjustment)
          scroller.scrollBy({ top: adjustment, behavior: "instant" });
        setSizes(nextSizes);
        readViewport();
      });
    });
    Array.from(root.firstElementChild?.children ?? []).forEach((row) =>
      observer.observe(row),
    );
    return () => {
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [
    virtual,
    keyIndexes,
    indexesKey,
    offsets,
    sizes,
    estimateHeight,
    viewport.top,
    scrollRef,
    readViewport,
  ]);

  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    const row = collectionRows(rootRef.current).find(
      (row) => Number(row.dataset.collectionIndex) === pending.index,
    );
    if (!row) return;
    const controls = [...row.querySelectorAll<HTMLElement>(focusableSelector)];
    ((pending.last ? controls.at(-1) : controls[0]) ?? row).focus();
    pendingFocus.current = null;
  });

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!virtual || event.key !== "Tab" || event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    const row = collectionRows(rootRef.current).find((row) =>
      row.contains(target),
    );
    if (!row) return;
    const controls = [...row.querySelectorAll<HTMLElement>(focusableSelector)];
    if (target !== (event.shiftKey ? controls[0] : controls.at(-1))) return;
    const nextIndex =
      Number(row.dataset.collectionIndex) + (event.shiftKey ? -1 : 1);
    if (
      nextIndex < 0 ||
      nextIndex >= items.length ||
      indexes.includes(nextIndex)
    )
      return;
    event.preventDefault();
    const root = rootRef.current!;
    const scroller = scrollRef?.current ?? root;
    const inset =
      root === scroller
        ? 0
        : root.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop;
    pendingFocus.current = { index: nextIndex, last: event.shiftKey };
    scroller.scrollTo({
      top: inset + offsets[nextIndex]!,
      behavior: "instant",
    });
    readViewport();
  }

  return (
    <div
      ref={rootRef}
      className={`${className ?? ""} ${virtual ? styles.window : ""} ${virtual && !scrollRef ? styles.scroll : ""}`}
      role={role ?? "list"}
      aria-label={label}
      data-windowed-count={items.length}
      onKeyDown={handleKeyDown}
      onFocusCapture={(event) =>
        setFocusedKey(
          collectionRows(rootRef.current).find((row) =>
            row.contains(event.target as Node),
          )?.dataset.collectionKey ?? null,
        )
      }
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFocusedKey(null);
      }}
    >
      {
        <div
          className={virtual ? styles.canvas : styles.contents}
          style={virtual ? { height: offsets.at(-1) } : undefined}
        >
          {indexes.map((index) => (
            <div
              className={virtual ? styles.row : styles.contents}
              key={keys[index]}
              data-collection-key={keys[index]}
              data-collection-index={index}
              role="listitem"
              tabIndex={-1}
              aria-posinset={index + 1}
              aria-setsize={items.length}
              style={
                virtual
                  ? { transform: `translateY(${offsets[index]}px)` }
                  : undefined
              }
            >
              {withoutNestedListRole(children(items[index]!, index))}
            </div>
          ))}
        </div>
      }
    </div>
  );
}

function withoutNestedListRole(node: ReactNode) {
  if (
    isValidElement<{ role?: string | undefined }>(node) &&
    typeof node.type === "string" &&
    node.props.role === "listitem"
  ) {
    return cloneElement(node, { role: undefined });
  }
  return node;
}

function collectionRows(root: HTMLDivElement | null): HTMLElement[] {
  return Array.from(root?.firstElementChild?.children ?? []).filter(
    (element): element is HTMLElement =>
      element instanceof HTMLElement &&
      element.hasAttribute("data-collection-index"),
  );
}
