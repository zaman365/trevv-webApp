"use client";
import dynamic from "next/dynamic";
import { PageSections } from "./page-sections";
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
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { demoWorkspaces, demoItems } from "@founderhq/core";
import { AppLink as Link } from "@/components/navigation-link";
import { useState } from "react";
import { DemoSearch } from "./demo-work-search";
import { WorkspaceFrame } from "./workspace-frame";
import { productCopy } from "@/lib/product-copy";
import { useCapturedWork, type CapturedWorkItem } from "@/lib/captured-work";
import { useWorkspaceState as useWorkspace } from "@/lib/workspace-context";
import { workspaceHref } from "@/lib/workspace-routes";
import { Hint } from "./learning-hint";
import { DecisionCenter } from "./decision-center";
import { InboxExperience } from "./email-inbox-workflow";
import { MyWorkWorkflow } from "./my-work-workflow";
import { CapabilityNotice } from "./capability-status";

const WaitingContent = dynamic(() =>
  import("./management-experience").then((module) => module.WaitingContent),
);

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
      <FocusMain kind={kind} workspaceSlug={workspaceSlug} />
    </WorkspaceFrame>
  );
}

function FocusMain({
  kind,
  workspaceSlug,
}: {
  kind: FocusKind;
  workspaceSlug?: string | undefined;
}) {
  const capturedWork = useCapturedWork();
  const { scope } = useWorkspace();
  const copy = productCopy.en.focus;
  const [titleKey, subtitleKey] = titleKeys[kind];
  return (
    <main
      className={`focus-main ${kind === "inbox" ? "focus-main-inbox" : ""}`}
    >
      {kind === "inbox" ? (
        <h1 className="sr-only">{copy[titleKey]}</h1>
      ) : (
        <header className="focus-header compact-page-header">
          <div>
            <h1
              className="page-title-with-hint"
              title={
                kind === "search"
                  ? "Search the fictional Workspace corpus. These sample results do not prove production permission enforcement."
                  : copy[subtitleKey]
              }
            >
              {copy[titleKey]}
              <Hint resourceId={focusHintIds[kind]} />
            </h1>
          </div>
        </header>
      )}
      {kind === "myWork" && (
        <PageSections
          scope={`demo-my-work:${workspaceSlug ?? "all"}`}
          label="My Work sections"
          sections={[
            { id: "my-work", label: "My Work" },
            ...(["decisions", "approvals", "waiting"] as const).map((id) => ({
              id,
              label: id[0]!.toUpperCase() + id.slice(1),
              ...(workspaceSlug
                ? { href: workspaceHref(workspaceSlug, id) }
                : {}),
            })),
          ]}
          renderSection={(section) =>
            section === "decisions" ? (
              <DecisionCenter />
            ) : section === "approvals" ? (
              <ApprovalView
                capturedWork={capturedWork}
                allowedWorkspaceIds={scope.workspaces.map(
                  (workspace) => workspace.id,
                )}
              />
            ) : (
              <WaitingContent embedded />
            )
          }
        >
          <MyWorkWorkflow />
        </PageSections>
      )}
      {kind === "inbox" && <InboxExperience />}
      {kind === "decisions" && <DecisionCenter />}
      {kind === "approvals" && (
        <ApprovalView
          capturedWork={capturedWork}
          allowedWorkspaceIds={scope.workspaces.map((project) => project.id)}
        />
      )}
      {kind === "search" && <DemoSearch workspaceSlug={workspaceSlug} />}
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
