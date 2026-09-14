"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { AppLink } from "@/components/navigation-link";
import { workspaceHref } from "@/lib/workspace-routes";
import { productCopy } from "@/lib/product-copy";
import { SearchSurface } from "./search-surface";

const loadSearch = () => import("./floating-search");
const FloatingSearch = lazy(loadSearch);

export function SearchLauncher(props: {
  workspaceId: string;
  workspaceSlug: string;
  demo: boolean;
}) {
  return <SearchLauncherContent key={props.workspaceId} {...props} />;
}

function SearchLauncherContent({
  workspaceId,
  workspaceSlug,
  demo,
}: {
  workspaceId: string;
  workspaceSlug: string;
  demo: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState("");
  const href = workspaceHref(workspaceSlug, "search");
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key !== "/" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        target?.closest(
          "input,textarea,select,[contenteditable=true],[role=dialog]",
        )
      )
        return;
      event.preventDefault();
      setInitialQuery("");
      setOpen(true);
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  return (
    <>
      <AppLink
        href={href}
        className="search-trigger"
        aria-keyshortcuts="/"
        aria-haspopup="dialog"
        aria-expanded={open}
        onMouseEnter={() => void loadSearch().catch(() => undefined)}
        onClick={(event) => {
          if (
            event.button === 0 &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.shiftKey &&
            !event.altKey
          ) {
            event.preventDefault();
            setInitialQuery("");
            setOpen(true);
          }
        }}
      >
        <Search size={17} />
        <span>{productCopy.en.shell.search}</span>
        <kbd title="Press slash to search">/</kbd>
      </AppLink>
      {open && (
        <Suspense
          fallback={
            <SearchSurface
              query={initialQuery}
              setQuery={setInitialQuery}
              filters={[]}
              filter=""
              setFilter={() => {}}
              onClose={() => setOpen(false)}
            >
              <p role="status">Opening search…</p>
            </SearchSurface>
          }
        >
          <FloatingSearch
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            demo={demo}
            initialQuery={initialQuery}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}
