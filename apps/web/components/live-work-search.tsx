"use client";

import { useReportRouteReady } from "@/lib/navigation-performance";

import type { WorkItemDto } from "@founderhq/api-contract";
import { Search } from "lucide-react";
import { AppLink as Link } from "@/components/navigation-link";
import { useState, type FormEvent } from "react";
import { useLiveAppRecords as useLiveAppData } from "@/lib/live-app-data";
import { presentLiveError } from "@/lib/live-errors";
import { workItemStatusLabel } from "@/lib/live-workflow-ui";
import { workspaceHref } from "@/lib/workspace-routes";
import { LiveStateNotice } from "./live-state";
import styles from "./live-operating-loop.module.css";
import { WindowedCollection } from "./windowed-collection";
import { recordKey } from "@/lib/live-work-view-helpers";

export function LiveSearch({
  workspaceId,
  workspaceSlug,
}: {
  workspaceId: string;
  workspaceSlug: string;
}) {
  useReportRouteReady(true);
  const liveData = useLiveAppData();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{
    workspaces: typeof liveData.workspaces;
    items: WorkItemDto[];
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim().length < 2 || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await liveData.client.search(query.trim());
      setResults({
        workspaces: response.workspaces,
        items: response.items.filter(
          (item) => item.workspaceId === workspaceId,
        ),
      });
    } catch (reason) {
      setError(reason);
    } finally {
      setPending(false);
    }
  }
  const presented = error ? presentLiveError(error) : null;
  return (
    <section className={styles.panel} aria-labelledby="live-search-title">
      <header>
        <div>
          <p>Server-authorized results</p>
          <h2 id="live-search-title">Search this workspace</h2>
        </div>
      </header>
      <form className={styles.searchForm} onSubmit={submit}>
        <Search size={17} />
        <input
          aria-label="Search durable work"
          data-trevv-search-input
          minLength={2}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search work and records…"
          value={query}
        />
        <button disabled={pending || query.trim().length < 2} type="submit">
          {pending ? "Searching…" : "Search"}
        </button>
      </form>
      {presented ? (
        <LiveStateNotice
          description={presented.description}
          kind={presented.kind}
          title={presented.title}
        />
      ) : null}
      {results && results.items.length === 0 ? (
        <LiveStateNotice
          kind="no-results"
          title="No matching WorkItems"
          description="Try a broader term."
        />
      ) : results ? (
        <WindowedCollection
          className={styles.stack}
          items={results.items}
          itemKey={recordKey}
          label="Work records"
        >
          {(item) => (
            <Link
              className={styles.listRow}
              href={`${workspaceHref(workspaceSlug)}/boards/${encodeURIComponent(item.boardId)}#${encodeURIComponent(item.id)}`}
              key={item.id}
            >
              <span className={styles.rowIcon}>
                <Search size={15} />
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>
                  {item.type} · {workItemStatusLabel(item.status)}
                </small>
              </span>
              <small>v{item.version}</small>
            </Link>
          )}
        </WindowedCollection>
      ) : null}
    </section>
  );
}
