"use client";
import { WorkspaceMark } from "./workspace-mark";
import {
  ArrowRight,
  Clock3,
  ExternalLink,
  FileText,
  Link2,
  Mail,
  MessageCircleMore,
} from "lucide-react";
import { demoWorkspaces, demoItems } from "@founderhq/core";
import { AppLink as Link } from "@/components/navigation-link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useWorkspaceState as useWorkspace } from "@/lib/workspace-context";
import { workspaceHref, taskHref } from "@/lib/workspace-routes";
import {
  currentMessagingUserId,
  messagingPeople,
  seedConversations,
} from "@/lib/messaging-data";
import { SearchSurface } from "./search-surface";

type DemoSearchProps = {
  workspaceSlug?: string | undefined;
  onClose?: (() => void) | undefined;
  initialQuery?: string;
};

export function DemoSearch(props: DemoSearchProps) {
  const params = useSearchParams();
  const pageQuery = params.get("q")?.slice(0, 200) ?? "";
  return (
    <DemoSearchContent
      key={`${props.workspaceSlug}:${props.onClose ? "floating" : pageQuery}`}
      {...props}
      initialQuery={props.onClose ? (props.initialQuery ?? "") : pageQuery}
    />
  );
}

function DemoSearchContent({
  workspaceSlug,
  onClose,
  initialQuery = "",
}: DemoSearchProps) {
  const { scope } = useWorkspace();
  const [query, setQuery] = useState(initialQuery);
  const results = useMemo(
    () =>
      query.trim().length < 2
        ? []
        : scope.items.filter((item) =>
            item.title
              .toLocaleLowerCase()
              .includes(query.trim().toLocaleLowerCase()),
          ),
    [query, scope.items],
  );
  const slug = workspaceSlug ?? scope.workspaces[0]?.slug;
  return (
    <SearchView
      query={query}
      setQuery={setQuery}
      results={results}
      allowedWorkspaceIds={scope.workspaces.map((workspace) => workspace.id)}
      {...(slug ? { workspaceSlug: slug } : {})}
      onClose={onClose}
    />
  );
}

function SearchView({
  query,
  setQuery,
  results,
  allowedWorkspaceIds,
  workspaceSlug,
  onClose,
}: {
  query: string;
  setQuery: (value: string) => void;
  results: typeof demoItems;
  allowedWorkspaceIds: readonly string[];
  workspaceSlug?: string;
  onClose?: (() => void) | undefined;
}) {
  const [filter, setFilter] = useState<
    "everything" | "work" | "people" | "workspaces" | "updates" | "resources"
  >("everything");
  const normalized = query.trim().toLocaleLowerCase();
  const allowedWorkspaceIdSet = new Set(allowedWorkspaceIds);
  const accessibleExternalPersonIds = new Set(
    seedConversations
      .filter(
        (conversation) =>
          conversation.workspaceId &&
          allowedWorkspaceIdSet.has(conversation.workspaceId),
      )
      .flatMap((conversation) => conversation.participantIds),
  );
  const peopleResults =
    normalized.length < 2
      ? []
      : messagingPeople.filter(
          (person) =>
            person.id !== currentMessagingUserId &&
            (!person.external || accessibleExternalPersonIds.has(person.id)) &&
            `${person.name} ${person.email} ${person.role}`
              .toLocaleLowerCase()
              .includes(normalized),
        );
  const workspaceResults =
    normalized.length < 2
      ? []
      : demoWorkspaces.filter(
          (workspace) =>
            allowedWorkspaceIdSet.has(workspace.id) &&
            [workspace.name, workspace.priority, workspace.healthNote]
              .join(" ")
              .toLocaleLowerCase()
              .includes(normalized),
        );
  const updateResults =
    normalized.length < 2
      ? []
      : demoWorkspaces.filter(
          (workspace) =>
            allowedWorkspaceIdSet.has(workspace.id) &&
            workspace.latestUpdate.text
              .toLocaleLowerCase()
              .includes(normalized),
        );
  const resources = [
    {
      workspaceId: "workspace-northstar",
      name: "Northstar storefront designs",
      provider: "Figma",
      href: "https://www.figma.com",
    },
    {
      workspaceId: "workspace-mealflow",
      name: "MealFlow product repository",
      provider: "GitHub",
      href: "https://github.com",
    },
    {
      workspaceId: "workspace-localreach",
      name: "LocalReach proof pack",
      provider: "Google Drive",
      href: "https://docs.google.com",
    },
  ].filter(
    (resource) =>
      normalized.length >= 2 &&
      allowedWorkspaceIdSet.has(resource.workspaceId) &&
      `${resource.name} ${resource.provider}`
        .toLocaleLowerCase()
        .includes(normalized),
  );
  const total =
    (filter === "everything" || filter === "work" ? results.length : 0) +
    (filter === "everything" || filter === "people"
      ? peopleResults.length
      : 0) +
    (filter === "everything" || filter === "workspaces"
      ? workspaceResults.length
      : 0) +
    (filter === "everything" || filter === "updates"
      ? updateResults.length
      : 0) +
    (filter === "everything" || filter === "resources" ? resources.length : 0);
  const chips = [
    ["everything", "Everything"],
    ["work", "Work items"],
    ["people", "People"],
    ["workspaces", "Workspaces"],
    ["updates", "Updates"],
    ["resources", "Resources"],
  ] as const;
  return (
    <SearchSurface
      query={query}
      setQuery={setQuery}
      filter={filter}
      setFilter={(value) => setFilter(value as typeof filter)}
      onClose={onClose}
      fullPageHref={
        workspaceSlug ? workspaceHref(workspaceSlug, "search") : undefined
      }
      filters={chips.map(([id, label]) => ({
        id,
        label,
        count: {
          everything:
            results.length +
            peopleResults.length +
            workspaceResults.length +
            updateResults.length +
            resources.length,
          work: results.length,
          people: peopleResults.length,
          workspaces: workspaceResults.length,
          updates: updateResults.length,
          resources: resources.length,
        }[id],
      }))}
    >
      {normalized.length < 2 ? (
        <section className="recent-searches">
          <h2>Recent searches</h2>
          {["launch approval", "GPSR", "restaurant onboarding"].map(
            (recent) => (
              <button key={recent} onClick={() => setQuery(recent)}>
                <Clock3 size={14} />
                {recent}
                <ArrowRight size={12} />
              </button>
            ),
          )}
        </section>
      ) : (
        <section className="search-results">
          <h2>{total} fictional sample results</h2>
          {(filter === "everything" || filter === "work") &&
            results.map((item) => (
              <Link
                href={
                  item.type === "task"
                    ? taskHref(
                        demoWorkspaces.find(
                          (workspace) => workspace.id === item.workspaceId,
                        )?.slug ??
                          workspaceSlug ??
                          "",
                        item.id,
                      )
                    : `${workspaceHref(demoWorkspaces.find((workspace) => workspace.id === item.workspaceId)?.slug ?? workspaceSlug ?? "")}/boards/${encodeURIComponent(item.boardId)}#${encodeURIComponent(item.id)}`
                }
                key={item.id}
              >
                <span className={`result-icon ${item.type}`}>
                  <FileText size={15} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <span>
                    {
                      demoWorkspaces.find(
                        (workspace) => workspace.id === item.workspaceId,
                      )?.name
                    }{" "}
                    · Work item · {item.status}
                  </span>
                </div>
                <ArrowRight size={14} />
              </Link>
            ))}
          {(filter === "everything" || filter === "people") &&
            peopleResults.map((person) => (
              <article className="search-person-result" key={person.id}>
                <span
                  className="search-person-avatar"
                  style={{ backgroundColor: person.color }}
                  aria-hidden="true"
                >
                  {person.initials}
                </span>
                <div className="search-person-copy">
                  <strong>{person.name}</strong>
                  <span>
                    {person.role} · {person.presence} · {person.email}
                  </span>
                </div>
                <div
                  className="search-person-actions"
                  role="group"
                  aria-label={`Actions for ${person.name}`}
                >
                  {workspaceSlug && (
                    <Link
                      href={`${workspaceHref(workspaceSlug, "messages")}?person=${encodeURIComponent(person.id)}`}
                      aria-label={`Message ${person.name}`}
                    >
                      <MessageCircleMore size={14} />
                      <span>Message</span>
                    </Link>
                  )}
                  <button
                    className="secondary-button"
                    type="button"
                    disabled
                    aria-label={`External email unavailable for ${person.name}`}
                    title="External email is unavailable in this technical preview"
                  >
                    <Mail size={14} />
                    <span>Email unavailable</span>
                  </button>
                </div>
              </article>
            ))}
          {(filter === "everything" || filter === "workspaces") &&
            workspaceResults.map((workspace) => (
              <Link
                href={workspaceHref(workspace.slug)}
                key={`workspace-${workspace.id}`}
              >
                <span className="result-icon workspace">
                  <WorkspaceMark workspace={workspace} />
                </span>
                <div>
                  <strong>{workspace.name}</strong>
                  <span>
                    Workspace · {workspace.stage} ·{" "}
                    {workspace.health.replace("_", " ")}
                  </span>
                </div>
                <ArrowRight size={14} />
              </Link>
            ))}
          {(filter === "everything" || filter === "updates") &&
            updateResults.map((workspace) => (
              <Link
                href={workspaceHref(workspace.slug, undefined, "updates")}
                key={`update-${workspace.id}`}
              >
                <span className="result-icon update">
                  <Clock3 size={15} />
                </span>
                <div>
                  <strong>{workspace.latestUpdate.text}</strong>
                  <span>
                    {workspace.name} · Update · {workspace.latestUpdate.date}
                  </span>
                </div>
                <ArrowRight size={14} />
              </Link>
            ))}
          {(filter === "everything" || filter === "resources") &&
            resources.map((resource) => (
              <a
                href={resource.href}
                key={resource.name}
                rel="noreferrer"
                target="_blank"
              >
                <span className="result-icon resource">
                  <Link2 size={15} />
                </span>
                <div>
                  <strong>{resource.name}</strong>
                  <span>{resource.provider} · Fictional sample resource</span>
                </div>
                <ExternalLink size={14} />
              </a>
            ))}
          {total === 0 && (
            <p className="search-empty">
              No fictional sample results match this search and filter.
            </p>
          )}
        </section>
      )}
    </SearchSurface>
  );
}
