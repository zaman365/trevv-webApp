"use client";

import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  demoWorkspaces,
  demoItems,
  demoStakeholderExposure,
} from "@founderhq/core";
import { trevvBrand } from "@/lib/branding";
import { useState } from "react";
import { CapabilityNotice, TechnicalPreviewBadge } from "./capability-status";

export function StakeholderExperience({ slug }: { slug: string }) {
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [outcomes, setOutcomes] = useState<
    Record<string, "approved" | "changes">
  >({});
  const workspace = demoWorkspaces.find((candidate) => candidate.slug === slug);
  if (!workspace || workspace.id !== demoStakeholderExposure.workspaceId)
    return (
      <main className="stakeholder-page stakeholder-unavailable">
        <TechnicalPreviewBadge />
        <ShieldCheck size={28} />
        <h1>No fictional stakeholder sample exists for this Workspace</h1>
        <p>This route does not check or grant real stakeholder access.</p>
      </main>
    );
  const work = demoItems.filter((item) =>
    demoStakeholderExposure.selectedWorkItemIds.includes(item.id),
  );
  const approvals = demoItems.filter((item) =>
    demoStakeholderExposure.approvalItemIds.includes(item.id),
  );
  return (
    <main className="stakeholder-page">
      <header className="stakeholder-topbar">
        <div className="auth-brand">
          <span className="brand-mark">
            <span>T</span>
          </span>
          <strong>{trevvBrand.name}</strong>
        </div>
        <TechnicalPreviewBadge />
      </header>
      <CapabilityNotice capability="browserChanges" />
      <section
        className="stakeholder-hero"
        style={
          { "--workspace-accent": workspace.accent } as React.CSSProperties
        }
      >
        <span
          className="workspace-mark"
          style={{
            background: `${workspace.accent}18`,
            color: workspace.accent,
          }}
        >
          {workspace.icon}
        </span>
        <div>
          <p>{workspace.type.replaceAll("_", " ")}</p>
          <h1>{workspace.name}</h1>
          <span>{workspace.priority}</span>
        </div>
        {demoStakeholderExposure.health && (
          <b className={`health-badge ${workspace.health}`}>
            <CheckCircle2 size={13} />
            {workspace.health.replace("_", " ")}
          </b>
        )}
      </section>
      <div className="stakeholder-grid">
        {demoStakeholderExposure.latestUpdate && (
          <section className="stakeholder-card stakeholder-update">
            <header>
              <Clock3 size={16} />
              <h2>Latest Update</h2>
              <time>{workspace.latestUpdate.date}</time>
            </header>
            <p>{workspace.latestUpdate.text}</p>
            <small>Fictional sample attributed to the Workspace lead</small>
          </section>
        )}
        {demoStakeholderExposure.milestones && (
          <section className="stakeholder-card">
            <header>
              <CheckCircle2 size={16} />
              <h2>Next milestone</h2>
            </header>
            <strong>{workspace.nextMilestone.title}</strong>
            <p>Target {workspace.nextMilestone.date}</p>
          </section>
        )}
        <section className="stakeholder-card stakeholder-work">
          <header>
            <FileText size={16} />
            <h2>Selected work</h2>
          </header>
          {work.map((item) => (
            <article key={item.id}>
              <span className={`priority-dot ${item.priority}`} />
              <div>
                <strong>{item.title}</strong>
                <small>
                  {item.status.replace("_", " ")} · due {item.dueDate}
                </small>
              </div>
            </article>
          ))}
        </section>
        <section className="stakeholder-card stakeholder-approvals">
          <header>
            <ShieldCheck size={16} />
            <h2>Needs stakeholder</h2>
          </header>
          {approvals.map((item) => (
            <article key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <small>
                  {outcomes[item.id] === "approved"
                    ? "Sample approval recorded in this browser"
                    : outcomes[item.id] === "changes"
                      ? "Sample change request recorded in this browser"
                      : `Fictional approval example · due ${item.dueDate}`}
                </small>
              </div>
              <button onClick={() => setReviewingId(item.id)}>
                {outcomes[item.id] ? "Review outcome" : "Review"}{" "}
                <ArrowRight size={12} />
              </button>
            </article>
          ))}
        </section>
        <section
          className="stakeholder-card stakeholder-resource"
          id="resource"
        >
          <header>
            <ExternalLink size={16} />
            <h2>Sample resource metadata</h2>
          </header>
          <a href="#resource" aria-disabled="true">
            <FileText size={15} />
            <div>
              <strong>Delivery proof pack</strong>
              <small>Fictional PDF metadata · no file attached</small>
            </div>
            <ExternalLink size={12} />
          </a>
        </section>
      </div>
      <footer className="stakeholder-footer">
        <ShieldCheck size={13} />
        This page illustrates a future sharing boundary; it is not authenticated
        or permission-enforced.
      </footer>
      {reviewingId && (
        <div
          className="dialog-layer"
          role="presentation"
          onMouseDown={() => setReviewingId(null)}
        >
          <section
            aria-labelledby="stakeholder-review-title"
            aria-modal="true"
            className="capture-dialog stakeholder-review-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header>
              <span className="attention-icon">
                <ShieldCheck size={17} />
              </span>
              <div>
                <h2 id="stakeholder-review-title">Stakeholder review</h2>
                <p>
                  {approvals.find((item) => item.id === reviewingId)?.title}
                </p>
              </div>
              <button
                aria-label="Close review"
                onClick={() => setReviewingId(null)}
              >
                <X size={17} />
              </button>
            </header>
            <CapabilityNotice capability="browserChanges" />
            <div className="review-resource-link">
              <FileText size={15} /> Fictional resource metadata; no file is
              attached
            </div>
            <label className="stacked-field">
              Review note
              <textarea
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder="Record approval context or the specific change needed…"
                value={reviewNote}
              />
            </label>
            <footer>
              <button
                disabled={!reviewNote.trim()}
                onClick={() => {
                  setOutcomes((current) => ({
                    ...current,
                    [reviewingId]: "changes",
                  }));
                  setReviewingId(null);
                  setReviewNote("");
                }}
              >
                Record sample change request
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  setOutcomes((current) => ({
                    ...current,
                    [reviewingId]: "approved",
                  }));
                  setReviewingId(null);
                  setReviewNote("");
                }}
              >
                <CheckCircle2 size={14} /> Record sample approval
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
