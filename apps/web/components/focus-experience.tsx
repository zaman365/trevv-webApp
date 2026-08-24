"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  ExternalLink,
  FileQuestion,
  FileText,
  Filter,
  Inbox,
  LayoutTemplate,
  Link2,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { demoHubs, demoItems } from "@founderhq/core";
import { useMemo, useState } from "react";
import { WorkspaceFrame } from "./workspace-frame";
import { productCopy } from "@/lib/product-copy";

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

export function FocusExperience({ kind }: { kind: FocusKind }) {
  const copy = productCopy.en.focus;
  const [query, setQuery] = useState("");
  const [captured, setCaptured] = useState([
    "Review ZEHN returns policy",
    "Explore supplier evidence reminder",
  ]);
  const [draft, setDraft] = useState("");
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
            <p>FounderHQ / {crumb}</p>
            <h1>{copy[titleKey]}</h1>
            <span>{copy[subtitleKey]}</span>
          </div>
          {kind === "inbox" && (
            <button className="primary-button">
              <Plus size={16} />
              {copy.newCapture}
            </button>
          )}
        </header>
        {kind === "myWork" && <MyWork />}
        {kind === "inbox" && (
          <InboxView
            captured={captured}
            draft={draft}
            setDraft={setDraft}
            onCapture={() => {
              if (draft.trim()) {
                setCaptured((current) => [draft.trim(), ...current]);
                setDraft("");
              }
            }}
          />
        )}
        {kind === "decisions" && <DecisionView />}
        {kind === "approvals" && <ApprovalView />}
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

function MyWork() {
  const copy = productCopy.en.focus;
  const mine = demoItems.filter((item) => item.assignee === "Mohammed Zaman");
  return (
    <div className="focus-layout">
      <aside className="focus-filter">
        <button className="active">
          Assigned to me <b>{mine.length}</b>
        </button>
        <button>
          Following <b>8</b>
        </button>
        <button>
          Created by me <b>12</b>
        </button>
        <hr />
        <button>
          <Filter size={14} />
          Add filter
        </button>
      </aside>
      <div className="work-groups">
        {[
          [
            copy.overdue,
            mine.filter((item) => item.dueDate && item.dueDate < "2026-08-24"),
          ],
          [copy.today, mine.filter((item) => item.dueDate === "2026-08-25")],
          [
            copy.upcoming,
            mine.filter((item) => !item.dueDate || item.dueDate > "2026-08-25"),
          ],
        ].map(([label, items]) => (
          <section className="work-group" key={String(label)}>
            <header>
              <ChevronDown size={14} />
              <h2>{String(label)}</h2>
              <b>{(items as typeof mine).length}</b>
            </header>
            {(items as typeof mine).map((item) => (
              <a
                href={`/app/hubs/${demoHubs.find((hub) => hub.id === item.hubId)?.slug}/boards/${item.boardId}`}
                key={item.id}
              >
                <Circle size={16} />
                <div>
                  <strong>{item.title}</strong>
                  <span>
                    {demoHubs.find((hub) => hub.id === item.hubId)?.name} /
                    Launch board
                  </span>
                </div>
                <span className={`focus-status ${item.status}`}>
                  {item.status.replace("_", " ")}
                </span>
                <time>{item.dueDate ?? "No date"}</time>
                <ArrowRight size={13} />
              </a>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function InboxView({
  captured,
  draft,
  setDraft,
  onCapture,
}: {
  captured: string[];
  draft: string;
  setDraft: (value: string) => void;
  onCapture: () => void;
}) {
  return (
    <div className="inbox-layout">
      <section className="capture-card">
        <div className="capture-card-icon">
          <Sparkles size={18} />
        </div>
        <div>
          <h2>What is on your mind?</h2>
          <p>
            Capture a task, idea, decision, link or request. Triage it when the
            context is clearer.
          </p>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type anything that needs a place…"
          />
          <footer>
            <div>
              <button>
                Task <ChevronDown size={13} />
              </button>
              <button>
                No Hub <ChevronDown size={13} />
              </button>
              <button>
                No date <ChevronDown size={13} />
              </button>
            </div>
            <button
              className="primary-button"
              onClick={onCapture}
              disabled={!draft.trim()}
            >
              Capture
            </button>
          </footer>
        </div>
      </section>
      <section className="inbox-list">
        <header>
          <div>
            <h2>Untriaged</h2>
            <span>{captured.length} items waiting for a home</span>
          </div>
          <button>
            <Filter size={14} />
            Filter
          </button>
        </header>
        {captured.map((title, index) => (
          <article key={`${title}-${index}`}>
            <span className="inbox-item-icon">
              <Inbox size={15} />
            </span>
            <div>
              <strong>{title}</strong>
              <span>Captured today · Private inbox</span>
            </div>
            <button>Move to Hub</button>
            <button>Park</button>
            <button aria-label="Open">
              <ArrowRight size={14} />
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}

function DecisionView() {
  const decisions = demoItems.filter((item) => item.type === "decision");
  return (
    <div className="center-layout">
      <div className="center-tabs">
        <button className="active">
          Needs decision <b>{decisions.length}</b>
        </button>
        <button>
          Analyzing <b>2</b>
        </button>
        <button>
          Delegated <b>1</b>
        </button>
        <button>Deferred</button>
        <button>Decided history</button>
      </div>
      <div className="center-grid">
        {decisions.map((item, index) => (
          <article className="decision-card" key={item.id}>
            <header>
              <span className="decision-icon">
                <FileQuestion size={16} />
              </span>
              <span
                className={`impact impact-${index % 2 ? "high" : "urgent"}`}
              >
                {index % 2 ? "High impact" : "Urgent"}
              </span>
            </header>
            <p>
              {demoHubs.find((hub) => hub.id === item.hubId)?.name} /{" "}
              {item.boardId.replace(/-/g, " ")}
            </p>
            <h2>{item.title}</h2>
            <span>
              This choice unblocks the next milestone and clarifies the
              operating path for the team.
            </span>
            <div className="recommendation">
              <b>Recommendation</b>
              <p>
                {index % 2
                  ? "Choose the simplest flow that can be validated with the pilot."
                  : "Use the premium early-access offer with free exchange."}
              </p>
            </div>
            <footer>
              <span>
                <Clock3 size={13} />
                Due {item.dueDate}
              </span>
              <span className="avatar avatar-mz">MZ</span>
              <button>
                Review decision <ArrowRight size={13} />
              </button>
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
}

function ApprovalView() {
  const approvals = demoItems.filter((item) => item.type === "approval");
  return (
    <div className="approval-layout">
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
            All Hubs
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
                by {index % 2 ? "Nora Klein" : "Amira Demir"}
              </span>
              <div>
                <a href="https://www.figma.com">
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
              <button>Request changes</button>
              <button className="approve-button">
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
            <p>{index < 4 ? "Popular" : "FounderHQ template"}</p>
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
