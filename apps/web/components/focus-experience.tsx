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
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { demoHubs, demoItems } from "@founderhq/core";
import { useMemo, useState } from "react";
import { WorkspaceFrame } from "./workspace-frame";
import { productCopy } from "@/lib/product-copy";
import { useCapturedWork, type CapturedWorkItem } from "@/lib/captured-work";
import { Hint } from "./learning-center";
import { DecisionCenter } from "./decision-center";
import { InboxWorkflow } from "./inbox-workflow";
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

export function FocusExperience({ kind }: { kind: FocusKind }) {
  const capturedWork = useCapturedWork();
  const copy = productCopy.en.focus;
  const [query, setQuery] = useState("");
  const [titleKey, subtitleKey] = titleKeys[kind];
  const searchResults = useMemo(() => {
    const normalized = query.toLocaleLowerCase();
    if (normalized.length < 2) return [];
    return demoItems
      .filter((item) => item.title.toLocaleLowerCase().includes(normalized))
      .slice(0, 8);
  }, [query]);
  const active = kind === "settings" ? "settings" : kind;
  const crumb =
    kind === "search"
      ? "Search"
      : productCopy.en.nav[kind === "settings" ? "settings" : kind];
  return (
    <WorkspaceFrame active={active}>
      <main className="focus-main">
        <header className="focus-header">
          <div>
            <p>TREVV / {crumb}</p>
            <h1 className="page-title-with-hint">
              {copy[titleKey]}
              <Hint resourceId={focusHintIds[kind]} />
            </h1>
            <span>{copy[subtitleKey]}</span>
          </div>
          {kind === "inbox" && (
            <button
              className="primary-button"
              onClick={() =>
                document.getElementById("inbox-quick-capture")?.focus()
              }
            >
              <Plus size={16} />
              {copy.newCapture}
            </button>
          )}
        </header>
        {kind === "myWork" && <MyWorkWorkflow />}
        {kind === "inbox" && <InboxWorkflow />}
        {kind === "decisions" && <DecisionCenter />}
        {kind === "approvals" && <ApprovalView capturedWork={capturedWork} />}
        {kind === "search" && (
          <SearchView
            query={query}
            setQuery={setQuery}
            results={searchResults}
          />
        )}
        {kind === "templates" && <TemplatesView />}
        {kind === "settings" && <SettingsView />}
      </main>
    </WorkspaceFrame>
  );
}

function ApprovalView({ capturedWork }: { capturedWork: CapturedWorkItem[] }) {
  const [resolved, setResolved] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const approvals = [
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
  ].filter((item) => !resolved.includes(item.id));
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
          <button>
            <Filter size={14} />
            All projects
          </button>
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
                <a href={item.evidenceUrl ?? "#"}>
                  <Link2 size={12} />
                  Linked review resource <ExternalLink size={11} />
                </a>
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
}: {
  query: string;
  setQuery: (value: string) => void;
  results: typeof demoItems;
}) {
  return (
    <div className="search-page">
      <div className="big-search">
        <Search size={19} />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search work, Hubs, comments and resources…"
        />
        <kbd>⌘ K</kbd>
      </div>
      <div className="search-chips">
        <button className="active">Everything</button>
        <button>Work items</button>
        <button>Hubs</button>
        <button>Updates</button>
        <button>Resources</button>
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
          <h2>{results.length} accessible results</h2>
          {results.map((item) => (
            <a
              href={`/app/hubs/${demoHubs.find((hub) => hub.id === item.hubId)?.slug}/boards/${item.boardId}`}
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
            </a>
          ))}
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
            <button>
              Use template <ArrowRight size={12} />
            </button>
          </footer>
        </article>
      ))}
    </div>
  );
}

function SettingsView() {
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
        <button className="active">
          <Settings2 size={14} />
          Integrations
        </button>
        <button>
          <ShieldCheck size={14} />
          Security
        </button>
        <button>Organization</button>
        <button>Members</button>
        <button>Audit log</button>
        <button>Export</button>
      </aside>
      <section>
        <div className="settings-note">
          <ShieldCheck size={17} />
          <div>
            <strong>Optional by design</strong>
            <span>
              Your Hubs, boards and decisions keep working if every provider is
              disconnected.
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
                <button className="configured">
                  <CheckCircle2 size={14} />
                  Configured
                </button>
              ) : state === "preview" ? (
                <button>
                  Set up <ArrowRight size={12} />
                </button>
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
