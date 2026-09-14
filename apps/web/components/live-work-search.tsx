"use client";

import { useReportRouteReady } from "@/lib/navigation-performance";
import {
  ArrowUpRight,
  FileText,
  FolderKanban,
  MessageCircleMore,
  Users,
  Building2,
} from "lucide-react";
import { AppLink as Link } from "@/components/navigation-link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLiveAppRecords } from "@/lib/live-app-data";
import { presentLiveReadError } from "@/lib/live-errors";
import { workItemStatusLabel } from "@/lib/live-workflow-ui";
import { workspaceHref, taskHref, teamHref } from "@/lib/workspace-routes";
import { personHref } from "@/lib/people-routes";
import { readAllPages } from "@/lib/read-all-pages";
import { LiveStateNotice } from "./live-state";
import { WindowedCollection } from "./windowed-collection";
import { SearchSurface } from "./search-surface";
import styles from "./search-surface.module.css";

const categories = [
  ["all", "All"],
  ["task", "Tasks"],
  ["work", "Other work"],
  ["people", "People"],
  ["teams", "Teams"],
  ["threads", "Threads"],
  ["workspaces", "Workspaces"],
] as const;
type Result = {
  id: string;
  category: string;
  title: string;
  detail: string;
  href: string;
};
const resultKey = (row: Result) => row.id;
const icons = {
  people: Users,
  teams: FolderKanban,
  threads: MessageCircleMore,
  workspaces: Building2,
};

type LiveSearchProps = {
  workspaceId: string;
  workspaceSlug: string;
  onClose?: (() => void) | undefined;
  initialQuery?: string;
};

export function LiveSearch(props: LiveSearchProps) {
  const params = useSearchParams();
  const pageQuery = params.get("q")?.slice(0, 200) ?? "";
  return (
    <LiveSearchContent
      key={`${props.workspaceId}:${props.onClose ? "floating" : pageQuery}`}
      {...props}
      initialQuery={props.onClose ? (props.initialQuery ?? "") : pageQuery}
    />
  );
}

function LiveSearchContent({
  workspaceId,
  workspaceSlug,
  onClose,
  initialQuery = "",
}: LiveSearchProps) {
  useReportRouteReady(!onClose);
  const scrollRef = useRef<HTMLDivElement>(null);
  const live = useLiveAppRecords();
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState("all");
  const [retry, setRetry] = useState(0);
  const [response, setResponse] = useState<{
    query: string;
    rows: Result[];
    errors: unknown[];
  } | null>(null);
  const updateQuery = (value: string) => {
    setQuery(value);
    setResponse(null);
  };
  const normalized = query.trim();
  const accessible =
    !live.accessLost &&
    live.workspaces.some((workspace) => workspace.id === workspaceId);
  useEffect(() => {
    if (normalized.length < 2 || !accessible) return;
    let active = true;
    const timer = setTimeout(() => {
      void Promise.allSettled([
        live.client.search(normalized),
        live.client.teamDirectory(workspaceId),
        readAllPages((cursor) =>
          live.client.conversations({
            workspaceId,
            limit: 100,
            ...(cursor ? { cursor } : {}),
          }),
        ),
      ]).then(([work, directory, conversations]) => {
        if (!active) return;
        const rows: Result[] = [];
        const matches = (value: string) =>
          value.toLocaleLowerCase().includes(normalized.toLocaleLowerCase());
        if (work.status === "fulfilled") {
          rows.push(
            ...work.value.items
              .filter((item) => item.workspaceId === workspaceId)
              .map((item) => ({
                id: `item:${item.id}`,
                category: item.type === "task" ? "task" : "work",
                title: item.title,
                detail: `${item.type} · ${workItemStatusLabel(item.status)} · v${item.version}${item.dueDate ? ` · Due ${new Date(item.dueDate).toLocaleDateString()}` : ""}`,
                href:
                  item.type === "task"
                    ? taskHref(workspaceSlug, item.id)
                    : `${workspaceHref(workspaceSlug)}/boards/${encodeURIComponent(item.boardId)}#${encodeURIComponent(item.id)}`,
              })),
          );
          rows.push(
            ...work.value.workspaces.map((workspace) => ({
              id: `workspace:${workspace.id}`,
              category: "workspaces",
              title: workspace.name,
              detail: "Workspace",
              href: workspaceHref(workspace.slug),
            })),
          );
        }
        if (directory.status === "fulfilled") {
          rows.push(
            ...directory.value.availableMembers
              .filter((person) => matches(`${person.name} ${person.email}`))
              .map((person) => ({
                id: `person:${person.id}`,
                category: "people",
                title: person.name,
                detail: person.email,
                href: personHref(workspaceSlug, person.id),
              })),
          );
          rows.push(
            ...directory.value.teams
              .filter((team) => matches(`${team.name} ${team.purpose}`))
              .map((team) => ({
                id: `team:${team.id}`,
                category: "teams",
                title: team.name,
                detail: `${team.members.length} members${team.purpose ? ` · ${team.purpose}` : ""}`,
                href: teamHref(workspaceSlug, team.id),
              })),
          );
        }
        if (conversations.status === "fulfilled")
          rows.push(
            ...conversations.value
              .filter((thread) => matches(`${thread.title} ${thread.purpose}`))
              .map((thread) => ({
                id: `thread:${thread.id}`,
                category: "threads",
                title: thread.title,
                detail: `${thread.kind} conversation · ${thread.participants.length} participants`,
                href: workspaceHref(
                  workspaceSlug,
                  "messages",
                  encodeURIComponent(thread.id),
                ),
              })),
          );
        setResponse({
          query: normalized,
          rows,
          errors: [work, directory, conversations].flatMap((result) =>
            result.status === "rejected" ? [result.reason] : [],
          ),
        });
      });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [normalized, workspaceId, workspaceSlug, live.client, accessible, retry]);
  const current =
    accessible && normalized.length >= 2 && response?.query === normalized
      ? response
      : null;
  const pending = accessible && normalized.length >= 2 && !current;
  const rows = current?.rows ?? [];
  const visible = rows.filter(
    (row) => filter === "all" || row.category === filter,
  );
  const filters = categories.map(([id, label]) => ({
    id,
    label,
    count:
      id === "all"
        ? rows.length
        : rows.filter((row) => row.category === id).length,
  }));
  return (
    <SearchSurface
      query={query}
      setQuery={updateQuery}
      scrollRef={scrollRef}
      filters={filters}
      filter={filter}
      setFilter={setFilter}
      pending={pending}
      onClose={onClose}
      fullPageHref={workspaceHref(workspaceSlug, "search")}
      onSubmit={() => {
        setResponse(null);
        setRetry((value) => value + 1);
      }}
    >
      {!accessible ? (
        <LiveStateNotice
          kind="permission-loss"
          title="Workspace access is unavailable"
          description="Choose a workspace you can access."
        />
      ) : normalized.length < 2 ? (
        <p className={styles.empty}>
          Start typing to search tasks, other work, people, teams and
          conversations. Enter at least two characters.
        </p>
      ) : pending ? (
        <p role="status" className={styles.empty}>
          Searching…
        </p>
      ) : (
        <>
          {current?.errors.map((error, index) => {
            const presented = presentLiveReadError(error);
            const accessOrLimit =
              presented.kind === "permission-loss" ||
              presented.kind === "rate-limit";
            return (
              <LiveStateNotice
                key={index}
                kind={presented.kind}
                title={
                  accessOrLimit
                    ? presented.title
                    : "Some search results are unavailable"
                }
                description={
                  accessOrLimit
                    ? presented.description
                    : "Retry to load results from the sources that could not be reached."
                }
              />
            );
          })}
          {current?.errors.length ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setResponse(null);
                setRetry((value) => value + 1);
              }}
            >
              Retry search
            </button>
          ) : null}
          <p className={styles.status} role="status">
            {visible.length} {visible.length === 1 ? "result" : "results"}
            {current?.errors.length
              ? " · Some sources could not be searched"
              : ""}
          </p>
          <WindowedCollection
            items={visible}
            itemKey={resultKey}
            label="Search results"
            className={styles.results}
            estimateHeight={76}
            scrollRef={scrollRef}
          >
            {(row) => {
              const Icon =
                icons[row.category as keyof typeof icons] ?? FileText;
              return (
                <Link className={styles.result} href={row.href}>
                  <Icon size={19} />
                  <span>
                    <strong>{row.title}</strong>
                    <small>{row.detail}</small>
                  </span>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              );
            }}
          </WindowedCollection>
          {visible.length === 0 && !current?.errors.length && (
            <p className={styles.empty}>
              No matches here. Try another category or a broader search.
            </p>
          )}
        </>
      )}
    </SearchSurface>
  );
}
