"use client";

import { ArrowUpRight, Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useRef, type ReactNode, type RefObject } from "react";
import { AppLink } from "@/components/navigation-link";
import { useAccessibleDialog } from "@/lib/live-collaboration";
import styles from "./search-surface.module.css";

export function SearchSurface({
  query,
  setQuery,
  filters,
  filter,
  setFilter,
  children,
  onClose,
  fullPageHref,
  onSubmit,
  scrollRef,
  pending = false,
}: {
  query: string;
  setQuery(value: string): void;
  filters: readonly { id: string; label: string; count: number }[];
  filter: string;
  setFilter(value: string): void;
  children: ReactNode;
  onClose?: (() => void) | undefined;
  fullPageHref?: string | undefined;
  onSubmit?: (() => void) | undefined;
  pending?: boolean;
  scrollRef?: RefObject<HTMLDivElement | null>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const dialog = useAccessibleDialog<HTMLElement>(
    () => onClose?.(),
    undefined,
    Boolean(onClose),
  );
  const surface = (
    <section
      ref={dialog}
      className={`${styles.surface} ${onClose ? styles.floating : ""}`}
      role={onClose ? "dialog" : "region"}
      aria-modal={onClose ? true : undefined}
      aria-label="Search"
      tabIndex={-1}
      onClick={(event) => {
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey &&
          (event.target as HTMLElement).closest("a[href]")
        )
          onClose?.();
      }}
    >
      <form
        className={styles.header}
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit?.();
        }}
      >
        <Search size={20} aria-hidden="true" />
        <input
          ref={input}
          type="search"
          aria-label="Search work, people and more"
          data-trevv-search-input
          autoComplete="off"
          maxLength={200}
          placeholder="Search tasks, people, teams and more…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button
            type="button"
              className={styles.clear}
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              input.current?.focus();
            }}
          >
              Clear
          </button>
        )}
        {onClose ? (
          <button
            type="button"
            className={styles.icon}
            aria-label="Close search"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        ) : (
          <button
            type="submit"
            className={styles.submit}
            disabled={pending || query.trim().length < 2}
          >
            Search
          </button>
        )}
      </form>
      <div
        className={styles.filters}
        role="group"
        aria-label="Search categories"
      >
        {filters.map((entry) => (
          <button
            type="button"
            key={entry.id}
            aria-pressed={filter === entry.id}
            onClick={() => setFilter(entry.id)}
          >
            {entry.label}
            <span>{entry.count}</span>
          </button>
        ))}
      </div>
      <div ref={scrollRef} className={styles.body} aria-busy={pending}>
        {children}
      </div>
      {onClose && fullPageHref && (
        <footer className={styles.footer}>
          <span>Esc to close</span>
          <AppLink href={`${fullPageHref}?q=${encodeURIComponent(query)}`}>
            Open full search page <ArrowUpRight size={15} />
          </AppLink>
        </footer>
      )}
    </section>
  );
  return onClose
    ? createPortal(
        <div
          className={styles.backdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          {surface}
        </div>,
        document.body,
      )
    : surface;
}
