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
  Search,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { demoHubs, demoItems } from "@founderhq/core";
import Link from "next/link";
import { useMemo, useState } from "react";
import { WorkspaceFrame } from "./workspace-frame";
import { productCopy } from "@/lib/product-copy";
import { useCapturedWork, type CapturedWorkItem } from "@/lib/captured-work";
import { useWorkspace } from "@/lib/workspace-context";
import { workspaceHref } from "@/lib/workspace-routes";
import { Hint } from "./learning-center";
import { DecisionCenter } from "./decision-center";
import { InboxExperience } from "./email-inbox-workflow";
import { MyWorkWorkflow } from "./my-work-workflow";

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
    <WorkspaceFrame active={active} hubSlug={workspaceSlug}>
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
  const workspaceName = scope.hubs[0]?.name ?? "Selected workspace";
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
          <span>{copy[subtitleKey]}</span>
        </div>
      </header>
      {kind === "myWork" && <MyWorkWorkflow />}
      {kind === "inbox" && <InboxExperience />}
      {kind === "decisions" && <DecisionCenter />}
      {kind === "approvals" && (
        <ApprovalView
          capturedWork={capturedWork}
          allowedHubIds={scope.hubs.map((project) => project.id)}
        />
      )}
      {kind === "search" && (
        <SearchView
          query={query}
          setQuery={setQuery}
          results={searchResults}
          allowedHubIds={scope.hubs.map((project) => project.id)}
        />
      )}
      {kind === "templates" && <TemplatesView />}
      {kind === "settings" && <SettingsView />}
    </main>
  );
}

function ApprovalView({
  capturedWork,
  allowedHubIds,
}: {
  capturedWork: CapturedWorkItem[];
  allowedHubIds: readonly string[];
}) {
  const [resolved, setResolved] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const allowedHubIdSet = new Set(allowedHubIds);
  const allApprovals = [
    ...demoItems
      .filter((item) => item.type === "approval")
      .map((item) => ({
        id: item.id,
        hubId: item.hubId,
        title: item.title,
        dueDate: item.dueDate,
        requestedBy: "Amira Demir",
        evidenceUrl: "https://www.figma.com",
      })),
    ...capturedWork
      .filter((item) => item.type === "approval")
      .map((item) => ({
        id: item.id,
        hubId: item.hubId,
        title: item.title,
        dueDate: item.dueDate,
        requestedBy: item.owner,
        evidenceUrl: item.evidenceUrl,
      })),
  ].filter(
    (item) => allowedHubIdSet.has(item.hubId) && !resolved.includes(item.id),
  );
  const approvals = allApprovals.filter(
    (item) => projectFilter === "all" || item.hubId === projectFilter,
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
          {allowedHubIds.length > 1 && (
            <label className="approval-project-filter">
              <Filter size={14} />
              <select
                aria-label="Filter approvals by workspace"
                onChange={(event) => setProjectFilter(event.target.value)}
                value={projectFilter}
              >
                <option value="all">All workspaces</option>
                {demoHubs
                  .filter((hub) =>
                    allApprovals.some((item) => item.hubId === hub.id),
                  )
                  .map((hub) => (
                    <option key={hub.id} value={hub.id}>
                      {hub.name}
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
                {demoHubs.find((hub) => hub.id === item.hubId)?.name} · Version{" "}
                {index + 7}
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
  allowedHubIds,
}: {
  query: string;
  setQuery: (value: string) => void;
  results: typeof demoItems;
  allowedHubIds: readonly string[];
}) {
  const [filter, setFilter] = useState<
    "everything" | "work" | "hubs" | "updates" | "resources"
  >("everything");
  const normalized = query.trim().toLocaleLowerCase();
  const allowedHubIdSet = new Set(allowedHubIds);
  const hubResults =
    normalized.length < 2
      ? []
      : demoHubs.filter(
          (hub) =>
            allowedHubIdSet.has(hub.id) &&
            [hub.name, hub.priority, hub.healthNote]
              .join(" ")
              .toLocaleLowerCase()
              .includes(normalized),
        );
  const updateResults =
    normalized.length < 2
      ? []
      : demoHubs.filter(
          (hub) =>
            allowedHubIdSet.has(hub.id) &&
            hub.latestUpdate.text.toLocaleLowerCase().includes(normalized),
        );
  const resources = [
    {
      hubId: "hub-northstar",
      name: "Northstar storefront designs",
      provider: "Figma",
      href: "https://www.figma.com",
    },
    {
      hubId: "hub-mealflow",
      name: "MealFlow product repository",
      provider: "GitHub",
      href: "https://github.com",
    },
    {
      hubId: "hub-localreach",
      name: "LocalReach proof pack",
      provider: "Google Drive",
      href: "https://docs.google.com",
    },
  ].filter(
    (resource) =>
      allowedHubIdSet.has(resource.hubId) &&
      `${resource.name} ${resource.provider}`
        .toLocaleLowerCase()
        .includes(normalized),
  );
  const total =
    (filter === "everything" || filter === "work" ? results.length : 0) +
    (filter === "everything" || filter === "hubs" ? hubResults.length : 0) +
    (filter === "everything" || filter === "updates"
      ? updateResults.length
      : 0) +
    (filter === "everything" || filter === "resources" ? resources.length : 0);
  const chips = [
    ["everything", "Everything"],
    ["work", "Work items"],
    ["hubs", "Workspaces"],
    ["updates", "Updates"],
    ["resources", "Resources"],
  ] as const;
  return (
    <div className="search-page">
      <div className="big-search">
        <Search size={19} />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search work, Workspaces, comments and resources…"
        />
        <kbd>⌘ K</kbd>
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
          <h2>{total} accessible results</h2>
          {(filter === "everything" || filter === "work") &&
            results.map((item) => (
              <Link
                href={`${workspaceHref(demoHubs.find((hub) => hub.id === item.hubId)!.slug)}/boards/${item.boardId}#${item.id}`}
                key={item.id}
              >
                <span className={`result-icon ${item.type}`}>
                  <FileText size={15} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <span>
                    {demoHubs.find((hub) => hub.id === item.hubId)?.name} · Work
                    item · {item.status}
                  </span>
                </div>
                <ArrowRight size={14} />
              </Link>
            ))}
          {(filter === "everything" || filter === "hubs") &&
            hubResults.map((hub) => (
              <Link href={workspaceHref(hub.slug)} key={`hub-${hub.id}`}>
                <span className="result-icon hub">{hub.icon}</span>
                <div>
                  <strong>{hub.name}</strong>
                  <span>
                    Workspace · {hub.stage} · {hub.health.replace("_", " ")}
                  </span>
                </div>
                <ArrowRight size={14} />
              </Link>
            ))}
          {(filter === "everything" || filter === "updates") &&
            updateResults.map((hub) => (
              <Link
                href={workspaceHref(hub.slug, undefined, "updates")}
                key={`update-${hub.id}`}
              >
                <span className="result-icon update">
                  <Clock3 size={15} />
                </span>
                <div>
                  <strong>{hub.latestUpdate.text}</strong>
                  <span>
                    {hub.name} · Update · {hub.latestUpdate.date}
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
                  <span>{resource.provider} · Connected resource</span>
                </div>
                <ExternalLink size={14} />
              </a>
            ))}
          {total === 0 && (
            <p className="search-empty">
              No accessible results match this search and filter.
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
  const workspaceSlug = scope.hubs[0]?.slug;
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
      "Deep integration",
      "Connect files and folders with a permission-safe picker.",
      "configured",
    ],
    [
      "Figma",
      "Smart links",
      "Rich cards and safe embeds for design reviews.",
      "preview",
    ],
    [
      "GitHub",
      "Smart links",
      "Attach repositories, issues and pull requests.",
      "preview",
    ],
    [
      "Canva",
      "Smart links",
      "Reference designs and exported review assets.",
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
        <div className="settings-note">
          <ShieldCheck size={17} />
          <div>
            <strong>Optional by design</strong>
            <span>
              Your Workspace, boards, and decisions keep working if every
              provider is disconnected.
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
              {state === "configured" ? (
                <Link className="configured" href={settingsHref}>
                  <CheckCircle2 size={14} />
                  Configured
                </Link>
              ) : state === "preview" ? (
                <Link href={settingsHref}>
                  Set up <ArrowRight size={12} />
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
