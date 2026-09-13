"use client";
import { useEffect, useState, type ReactNode } from "react";
import { PageSections } from "./page-sections";
import {
  WorkspaceSectionContent,
  sectionDestination,
} from "./workspace-page-sections";
import { useLiveAppRecords } from "@/lib/live-app-data";
import { LiveWorkspaceRecordsScope } from "./live-workspace-records-scope";
import { useAppSession } from "@/lib/app-session-context";
import { sectionCatalog, portfolioWorkspaces } from "@/lib/page-sections";
import { workspaceHref } from "@/lib/workspace-routes";
import { AppLink as Link } from "@/components/navigation-link";
import styles from "./portfolio-page-sections.module.css";

const operational = [
  "my-work",
  "planning",
  "ideas",
  "teams",
  "people",
  "messages",
  "attention",
  "decisions",
  "approvals",
  "waiting",
];

export function PortfolioPageSections({
  portfolioId,
  children,
  personal = false,
}: {
  portfolioId: string;
  children: ReactNode;
  personal?: boolean;
}) {
  const data = useLiveAppRecords();
  const session = useAppSession();
  const [requested, setRequested] = useState("");
  const [section, setSection] = useState("overview");
  useEffect(() => {
    const read = () =>
      setRequested(
        new URLSearchParams(window.location.search).get("workspace") ?? "",
      );
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const { available, selected } = portfolioWorkspaces(
    data.workspaces,
    portfolioId,
    requested,
  );
  const workspaces = personal ? data.workspaces : available;
  const workspace = personal
    ? (workspaces.find((entry) => entry.slug === requested) ?? workspaces[0])
    : selected;
  const ids = personal
    ? ["ideas", "inbox", "waiting", "messages", "attention"]
    : operational;
  const sections = [
    { id: "overview", label: personal ? "All my tasks" : "Overview" },
    ...(!personal
      ? [
          {
            id: "workspaces",
            label: "Workspaces",
            title: "Your workspaces",
            description:
              "Find a startup, team or project and choose where to work.",
          },
        ]
      : []),
    ...ids.map((id) => ({
      ...sectionCatalog[id]!,
      id,
      ...(workspace ? { href: sectionDestination(workspace.slug, id) } : {}),
    })),
  ];
  const showScope = !["overview", "workspaces"].includes(section);
  return (
    <PageSections
      sections={sections}
      scope={`${session.organization.id}:${personal ? "personal" : portfolioId}`}
      label={personal ? "Personal work sections" : "Portfolio sections"}
      onSectionChange={setSection}
      toolbar={
        showScope ? (
          <div className={styles.toolbar}>
            <label>
              Workspace
              <select
                aria-label="Workspace for this section"
                value={workspace?.slug ?? ""}
                disabled={!workspaces.length}
                onChange={(event) => {
                  const slug = event.target.value;
                  const url = new URL(window.location.href);
                  url.searchParams.set("workspace", slug);
                  url.hash = "";
                  window.history.pushState(
                    null,
                    "",
                    `${url.pathname}${url.search}`,
                  );
                  setRequested(slug);
                }}
              >
                {workspaces.length ? (
                  workspaces.map((entry) => (
                    <option key={entry.id} value={entry.slug}>
                      {entry.name}
                    </option>
                  ))
                ) : (
                  <option value="">No accessible workspace</option>
                )}
              </select>
            </label>
            <p>
              {workspace
                ? `Work and actions below belong to ${workspace.name}.`
                : "Create a workspace or ask for access to get started."}
            </p>
            {workspace ? (
              <Link href={workspaceHref(workspace.slug)}>Open workspace</Link>
            ) : null}
          </div>
        ) : null
      }
      renderSection={(id) =>
        id === "workspaces" ? (
          <PortfolioWorkspaceDirectory portfolioId={portfolioId} />
        ) : workspace ? (
          <LiveWorkspaceRecordsScope
            key={workspace.id}
            workspaceSlug={workspace.slug}
          >
            <WorkspaceSectionContent
              section={id}
              workspaceSlug={workspace.slug}
              workspaceId={workspace.id}
            />
          </LiveWorkspaceRecordsScope>
        ) : (
          <p>
            No accessible workspaces in this portfolio yet. Use Overview to
            create one or ask your administrator for access.
          </p>
        )
      }
    >
      {children}
    </PageSections>
  );
}

function PortfolioWorkspaceDirectory({ portfolioId }: { portfolioId: string }) {
  const data = useLiveAppRecords();
  const [search, setSearch] = useState("");
  const [health, setHealth] = useState("");
  const [type, setType] = useState("");
  const workspaces = data.accessLost
    ? []
    : data.workspaces.filter(
        (workspace) => workspace.portfolioId === portfolioId,
      );
  const visible = workspaces.filter(
    (workspace) =>
      (!health || workspace.health === health) &&
      (!type || workspace.type === type) &&
      `${workspace.name} ${workspace.description} ${workspace.priority}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <div className={styles.stack}>
      <div className={styles.toolbar}>
        <label>
          Find a workspace
          <input
            type="search"
            placeholder="Name, priority or description"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          Health
          <select
            value={health}
            onChange={(event) => setHealth(event.target.value)}
          >
            <option value="">All health states</option>
            {[...new Set(workspaces.map((entry) => entry.health))]
              .sort()
              .map((entry) => (
                <option key={entry} value={entry}>
                  {entry.replaceAll("_", " ")}
                </option>
              ))}
          </select>
        </label>
        <label>
          Workspace type
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">All types</option>
            {[...new Set(workspaces.map((entry) => entry.type))]
              .sort()
              .map((entry) => (
                <option key={entry} value={entry}>
                  {entry.replaceAll("_", " ")}
                </option>
              ))}
          </select>
        </label>
        <p role="status">
          {visible.length} of {workspaces.length} workspaces
        </p>
        {search || health || type ? (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setHealth("");
              setType("");
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>
      {visible.length ? (
        <div className={styles.cardList}>
          {visible.map((workspace) => (
            <article className={styles.card} key={workspace.id}>
              <small>
                {workspace.type.replaceAll("_", " ")} ·{" "}
                {workspace.health.replaceAll("_", " ")}
              </small>
              <h3>
                <Link href={workspaceHref(workspace.slug)}>
                  {workspace.name}
                </Link>
              </h3>
              <p>
                {workspace.priority ||
                  workspace.description ||
                  "No priority recorded yet."}
              </p>
              <footer>
                <Link href={workspaceHref(workspace.slug, "dashboard")}>
                  Dashboard
                </Link>
                <Link href={workspaceHref(workspace.slug, "planning")}>
                  Projects
                </Link>
                <Link href={workspaceHref(workspace.slug, "teams")}>Team</Link>
                <Link href={workspaceHref(workspace.slug, "messages")}>
                  Messages
                </Link>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <p>
          {workspaces.length
            ? "No workspaces match these filters. Clear a filter to see more."
            : "No accessible workspaces in this portfolio yet."}
        </p>
      )}
    </div>
  );
}
