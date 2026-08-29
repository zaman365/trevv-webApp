"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Filter,
  LayoutTemplate,
  Link2,
  Mail,
  MessageCircleMore,
  Search,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { demoWorkspaces, demoItems } from "@founderhq/core";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { WorkspaceFrame } from "./workspace-frame";
import { productCopy } from "@/lib/product-copy";
import { useCapturedWork, type CapturedWorkItem } from "@/lib/captured-work";
import { useWorkspace } from "@/lib/workspace-context";
import { workspaceHref } from "@/lib/workspace-routes";
import {
  currentMessagingUserId,
  messagingPeople,
  seedConversations,
} from "@/lib/messaging-data";
import { Hint } from "./learning-center";
import { DecisionCenter } from "./decision-center";
import { InboxExperience } from "./email-inbox-workflow";
import { MyWorkWorkflow } from "./my-work-workflow";
import { CapabilityNotice } from "./capability-status";

export type FocusKind =
  | "myWork"
  | "inbox"
  | "decisions"
  | "approvals"
  | "search"
  | "templates"
  | "settings";
const titleKeys = {
  myWork: ["myWorkTitle", "myWorkSubtitle"],
  inbox: ["inboxTitle", "inboxSubtitle"],
  decisions: ["decisionsTitle", "decisionsSubtitle"],
  approvals: ["approvalsTitle", "approvalsSubtitle"],
  search: ["searchTitle", "searchSubtitle"],
  templates: ["templatesTitle", "templatesSubtitle"],
  settings: ["settingsTitle", "settingsSubtitle"],
} as const;

const focusHintIds: Record<FocusKind, string> = {
  myWork: "my-work",
  inbox: "inbox",
  decisions: "decisions",
  approvals: "approvals",
  search: "search",
  templates: "blueprints",
  settings: "integrations",
};

export function FocusExperience({
  kind,
  workspaceSlug,
}: {
  kind: FocusKind;
  workspaceSlug?: string;
}) {
  const active = kind === "settings" ? "settings" : kind;
  return (
    <WorkspaceFrame active={active} workspaceSlug={workspaceSlug}>
      <FocusMain kind={kind} />
    </WorkspaceFrame>
  );
}

function FocusMain({ kind }: { kind: FocusKind }) {
  const capturedWork = useCapturedWork();
  const { scope } = useWorkspace();
  const copy = productCopy.en.focus;
  const [query, setQuery] = useState("");
  const [titleKey, subtitleKey] = titleKeys[kind];
  const searchResults = useMemo(() => {
    const normalized = query.toLocaleLowerCase();
    if (normalized.length < 2) return [];
    return scope.items
      .filter((item) => item.title.toLocaleLowerCase().includes(normalized))
      .slice(0, 8);
  }, [query, scope.items]);
  const crumb =
    kind === "search"
      ? "Search"
      : productCopy.en.nav[kind === "settings" ? "settings" : kind];
  const workspaceName = scope.workspaces[0]?.name ?? "Selected workspace";
  return (
    <main className="focus-main">
      <header className="focus-header">
        <div>
          <p>
            Workspace · {workspaceName} / {crumb}
          </p>
          <h1 className="page-title-with-hint">
            {copy[titleKey]}
            <Hint resourceId={focusHintIds[kind]} />
          </h1>
          <span>
            {kind === "search"
              ? "Search the fictional Workspace corpus. These sample results do not prove production permission enforcement."
              : copy[subtitleKey]}
          </span>
        </div>
      </header>
      {kind === "myWork" && <MyWorkWorkflow />}
      {kind === "inbox" && <InboxExperience />}
      {kind === "decisions" && <DecisionCenter />}
      {kind === "approvals" && (
        <ApprovalView
          capturedWork={capturedWork}
          allowedWorkspaceIds={scope.workspaces.map((project) => project.id)}
        />
      )}
      {kind === "search" && (
        <SearchView
          query={query}
          setQuery={setQuery}
          results={searchResults}
          allowedWorkspaceIds={scope.workspaces.map((project) => project.id)}
          {...(scope.workspaces[0]
            ? { workspaceSlug: scope.workspaces[0].slug }
            : {})}
        />
      )}
      {kind === "templates" && <TemplatesView />}
      {kind === "settings" && <SettingsView />}
    </main>
  );
}

function ApprovalView({
  capturedWork,
  allowedWorkspaceIds,
}: {
  capturedWork: CapturedWorkItem[];
  allowedWorkspaceIds: readonly string[];
}) {
  const [resolved, setResolved] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const allowedWorkspaceIdSet = new Set(allowedWorkspaceIds);
  const allApprovals = [
    ...demoItems
      .filter((item) => item.type === "approval")
      .map((item) => ({
        id: item.id,
        workspaceId: item.workspaceId,
        title: item.title,
        dueDate: item.dueDate,
        requestedBy: "Amira Demir",
        evidenceUrl: "https://www.figma.com",
      })),
    ...capturedWork
      .filter((item) => item.type === "approval")
      .map((item) => ({
        id: item.id,
        workspaceId: item.workspaceId,
        title: item.title,
        dueDate: item.dueDate,
        requestedBy: item.owner,
        evidenceUrl: item.evidenceUrl,
      })),
  ].filter(
    (item) =>
      allowedWorkspaceIdSet.has(item.workspaceId) &&
      !resolved.includes(item.id),
  );
  const approvals = allApprovals.filter(
    (item) => projectFilter === "all" || item.workspaceId === projectFilter,
  );
  return (
    <div className="approval-layout">
      {notice && (
        <div className="workflow-toast" role="status">
          <CheckCircle2 size={15} />
          <span>{notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={13} />
          </button>
        </div>
      )}
      <div className="approval-summary">
        <article>
          <span className="summary-icon violet">
            <Clock3 size={15} />
          </span>
          <div>
            <strong>{approvals.length}</strong>
            <small>Pending review</small>
          </div>
        </article>
        <article>
          <span className="summary-icon amber">
            <AlertTriangle size={15} />
          </span>
          <div>
            <strong>2</strong>
            <small>Due in 48 hours</small>
          </div>
        </article>
        <article>
          <span className="summary-icon green">
            <CheckCircle2 size={15} />
          </span>
          <div>
            <strong>14</strong>
            <small>Approved this month</small>
          </div>
        </article>
      </div>
      <section className="approval-list">
        <header>
          <h2>Pending approvals</h2>
          {allowedWorkspaceIds.length > 1 && (
            <label className="approval-project-filter">
              <Filter size={14} />
              <select
                aria-label="Filter approvals by workspace"
                onChange={(event) => setProjectFilter(event.target.value)}
                value={projectFilter}
              >
                <option value="all">All workspaces</option>
                {demoWorkspaces
                  .filter((workspace) =>
                    allApprovals.some(
                      (item) => item.workspaceId === workspace.id,
                    ),
                  )
                  .map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </header>
        {approvals.map((item, index) => (
          <article key={item.id}>
            <span className={`approval-preview preview-${index}`}>
              <FileText size={22} />
            </span>
            <div className="approval-copy">
              <p>
                {
                  demoWorkspaces.find(
                    (workspace) => workspace.id === item.workspaceId,
                  )?.name
                }{" "}
                · Version {index + 7}
              </p>
              <h3>{item.title}</h3>
              <span>
                {index % 2 ? "Product / UX" : "Legal / Packaging"} · Requested
                by {item.requestedBy}
              </span>
              <div>
                {item.evidenceUrl ? (
                  <a href={item.evidenceUrl} rel="noreferrer" target="_blank">
                    <Link2 size={12} />
                    Linked review resource <ExternalLink size={11} />
                  </a>
                ) : (
                  <span>
                    <Link2 size={12} /> No review resource attached
                  </span>
                )}
                <span>
                  <Clock3 size={12} />
                  Due {item.dueDate}
                </span>
              </div>
            </div>
            <div className="approval-actions">
              <button
                onClick={() => {
                  setResolved((current) => [...current, item.id]);
                  setNotice(`Changes requested for “${item.title}”.`);
                }}
              >
                Request changes
              </button>
              <button
                className="approve-button"
                onClick={() => {
                  setResolved((current) => [...current, item.id]);
                  setNotice(`Approved “${item.title}”.`);
                }}
              >
                <CheckCircle2 size={14} />
                Approve
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function SearchView({
  query,
  setQuery,
  results,
  allowedWorkspaceIds,
  workspaceSlug,
}: {
  query: string;
  setQuery: (value: string) => void;
  results: typeof demoItems;
  allowedWorkspaceIds: readonly string[];
  workspaceSlug?: string;
}) {
  const searchInputRef = useRef<HTMLInputElement>(null);
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
    <div className="search-page">
      <div className="big-search">
        <Search size={19} />
        <input
          autoFocus
          ref={searchInputRef}
          data-trevv-search-input
          aria-keyshortcuts="/"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search work, people, updates & more…"
        />
        {query ? (
          <button
            type="button"
            className="big-search-clear"
            aria-label="Clear search"
            title="Clear search"
            onClick={() => {
              setQuery("");
              searchInputRef.current?.focus();
            }}
          >
            <X size={15} />
          </button>
        ) : (
          <kbd title="Press slash to focus search">/</kbd>
        )}
      </div>
      <div className="search-chips">
        {chips.map(([value, label]) => (
          <button
            aria-pressed={filter === value}
            className={filter === value ? "active" : ""}
            key={value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {query.length < 2 ? (
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
                href={`${workspaceHref(demoWorkspaces.find((workspace) => workspace.id === item.workspaceId)!.slug)}/boards/${item.boardId}#${item.id}`}
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
                <span className="result-icon workspace">{workspace.icon}</span>
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
    </div>
  );
}

const templates = [
  "Fashion / E-commerce",
  "Software Product",
  "Service Delivery",
  "Venture Validation",
  "Recurring Care",
  "Funding / Application",
  "Trade / Compliance Operations",
  "Affiliate / Content Property",
  "Personal Journey",
];
function TemplatesView() {
  return (
    <div className="template-grid">
      {templates.map((template, index) => (
        <article key={template}>
          <span className={`template-icon template-${index % 5}`}>
            <LayoutTemplate size={18} />
          </span>
          <div>
            <p>{index < 4 ? "Popular" : "TREVV template"}</p>
            <h2>{template}</h2>
            <span>
              Ready-made groups, statuses, fields, views and update prompts for
              a clear operating rhythm.
            </span>
          </div>
          <footer>
            <span>
              {4 + (index % 3)} groups · {7 + index} fields
            </span>
            <Link href={`/app/blueprints#available-blueprints`}>
              Use template <ArrowRight size={12} />
            </Link>
          </footer>
        </article>
      ))}
    </div>
  );
}

function SettingsView() {
  const { scope } = useWorkspace();
  const workspaceSlug = scope.workspaces[0]?.slug;
  const settingsHref = workspaceSlug
    ? workspaceHref(workspaceSlug, "settings")
    : "/app/settings/integrations";
  const settingsSectionHref = (section: string) =>
    workspaceSlug
      ? workspaceHref(workspaceSlug, "settings", section)
      : `/app/settings/integrations#${section}`;
  const importHref = workspaceSlug
    ? `/app/workspaces/${encodeURIComponent(workspaceSlug)}/settings/import`
    : "/app/settings/import";
  const providers = [
    [
      "Google Drive",
      "Picker preview",
      "Preview how a future permission-scoped picker could reference sample files. No provider is connected.",
      "preview",
    ],
    [
      "Figma",
      "Smart-link preview",
      "Preview a fictional rich card for a deliberately added design link.",
      "preview",
    ],
    [
      "GitHub",
      "Smart-link preview",
      "Preview fictional repository, issue, and pull-request references.",
      "preview",
    ],
    [
      "Canva",
      "Smart-link preview",
      "Preview fictional design and review-asset references.",
      "preview",
    ],
    [
      "Google Calendar",
      "Release 1.1",
      "Milestones and review dates — not enabled in V1.",
      "later",
    ],
  ] as const;
  return (
    <div className="settings-layout">
      <aside>
        <Link className="active" href={settingsHref}>
          <Settings2 size={14} />
          Integrations
        </Link>
        <Link href={settingsSectionHref("security")}>
          <ShieldCheck size={14} />
          Security
        </Link>
        <Link href={settingsSectionHref("organization")}>Organization</Link>
        <Link href={settingsSectionHref("members")}>Members</Link>
        <Link href={settingsSectionHref("audit-log")}>Audit log</Link>
        <Link href={importHref}>Import / Export</Link>
      </aside>
      <section>
        <CapabilityNotice capability="integrations" />
        <div className="settings-note">
          <ShieldCheck size={17} />
          <div>
            <strong>Optional by design</strong>
            <span>
              These sample screens do not depend on a provider. No provider
              account is connected in this technical preview.
            </span>
          </div>
        </div>
        <div className="provider-list">
          {providers.map(([name, category, description, state]) => (
            <article key={name}>
              <span
                className={`provider-icon provider-${name.toLocaleLowerCase().replace(" ", "-")}`}
              >
                {name.at(0)}
              </span>
              <div>
                <p>{category}</p>
                <h2>{name}</h2>
                <span>{description}</span>
              </div>
              {state === "preview" ? (
                <Link href={settingsHref}>
                  Open preview <ArrowRight size={12} />
                </Link>
              ) : (
                <span className="later-badge">Later release</span>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
