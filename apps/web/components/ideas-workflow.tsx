"use client";

import {
  Archive,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  FileText,
  Filter,
  GitBranch,
  History,
  Lightbulb,
  Link2,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { demoDecisionOutcomes, demoHubs, demoInsights } from "@founderhq/core";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useCapturedWork, type CapturedWorkItem } from "@/lib/captured-work";
import { scoreOpportunity } from "@/lib/workflow-rules";
import { Hint } from "./learning-center";

type IdeaStage = "captured" | "evaluating" | "promoted" | "archived";

interface IdeaEvidence {
  id: string;
  title: string;
  source: string;
  url?: string;
}

interface IdeaRecord {
  id: string;
  title: string;
  hubId: string;
  problem: string;
  hypothesis: string;
  impact: number;
  confidence: number;
  fit: number;
  effort: number;
  reviewDate: string;
  stage: IdeaStage;
  evidence: IdeaEvidence[];
  promotedTo?: "decision" | "experiment" | "board";
}

const stageLabels: Record<IdeaStage, string> = {
  captured: "Captured",
  evaluating: "Evaluating",
  promoted: "Promoted",
  archived: "Archived",
};

const initialIdeas: IdeaRecord[] = [
  {
    id: "idea-service-first",
    title: "Service-first pilot home",
    hubId: "hub-mealflow",
    problem: "Pilot users cannot see live service status quickly enough.",
    hypothesis:
      "A service-first home will shorten time to first useful action.",
    impact: 4,
    confidence: 4,
    fit: 5,
    effort: 2,
    reviewDate: "2026-09-02",
    stage: "promoted",
    promotedTo: "decision",
    evidence: demoInsights
      .filter((insight) => insight.hubId === "hub-mealflow")
      .map((insight) => ({
        id: insight.id,
        title: insight.title,
        source: insight.sourceType.replaceAll("_", " "),
        ...(insight.sourceUrl ? { url: insight.sourceUrl } : {}),
      })),
  },
  {
    id: "idea-proof-portal",
    title: "Self-serve client proof portal",
    hubId: "hub-localreach",
    problem:
      "Clients ask for delivery evidence across several message threads.",
    hypothesis:
      "A single proof view will reduce follow-up and speed up approval.",
    impact: 4,
    confidence: 3,
    fit: 4,
    effort: 3,
    reviewDate: "2026-09-07",
    stage: "evaluating",
    evidence: [
      {
        id: "evidence-proof-1",
        title: "Client handover feedback",
        source: "customer feedback",
      },
    ],
  },
  {
    id: "idea-supplier-evidence",
    title: "Supplier evidence health signal",
    hubId: "hub-centralops",
    problem:
      "Compliance evidence becomes visible only after a launch is blocked.",
    hypothesis: "A lightweight completeness signal will surface risk earlier.",
    impact: 5,
    confidence: 3,
    fit: 5,
    effort: 2,
    reviewDate: "2026-09-10",
    stage: "captured",
    evidence: [],
  },
];

export function IdeasWorkflow() {
  const capturedWork = useCapturedWork();
  const [ideas, setIdeas] = useState(initialIdeas);
  const [stage, setStage] = useState<IdeaStage | "all">("all");
  const [query, setQuery] = useState("");
  const [hubId, setHubId] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const capturedIdeas = useMemo(
    () =>
      capturedWork
        .filter((item) => item.type === "idea")
        .map(capturedIdeaRecord),
    [capturedWork],
  );
  const allIdeas = useMemo(
    () => [
      ...ideas,
      ...capturedIdeas.filter(
        (captured) => !ideas.some((idea) => idea.id === captured.id),
      ),
    ],
    [capturedIdeas, ideas],
  );

  const selected = allIdeas.find((idea) => idea.id === selectedId);
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return allIdeas.filter((idea) => {
      if (stage !== "all" && idea.stage !== stage) return false;
      if (hubId !== "all" && idea.hubId !== hubId) return false;
      return (
        !normalized ||
        `${idea.title} ${idea.problem} ${idea.hypothesis}`
          .toLocaleLowerCase()
          .includes(normalized)
      );
    });
  }, [allIdeas, hubId, query, stage]);

  const updateIdea = (id: string, update: Partial<IdeaRecord>) => {
    setIdeas((current) => {
      if (current.some((idea) => idea.id === id)) {
        return current.map((idea) =>
          idea.id === id ? { ...idea, ...update } : idea,
        );
      }
      const source = allIdeas.find((idea) => idea.id === id);
      return source ? [{ ...source, ...update }, ...current] : current;
    });
  };

  return (
    <>
      <header className="trevv-page-header">
        <div>
          <p>Discovery</p>
          <h1 className="page-title-with-hint">
            Ideas & evidence <Hint resourceId="ideas" />
          </h1>
          <span>
            Develop opportunities lightly, attach the why, and preserve
            provenance when work is promoted.
          </span>
        </div>
        <button className="primary-button" onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> Capture idea
        </button>
      </header>

      {notice && (
        <div className="workflow-toast" role="status">
          <CheckCircle2 size={16} />
          <span>{notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <section
        className="idea-overview-strip"
        aria-label="Idea pipeline summary"
      >
        <article>
          <span>
            <Lightbulb size={16} />
          </span>
          <div>
            <b>{allIdeas.filter((idea) => idea.stage !== "archived").length}</b>
            <small>Active ideas</small>
          </div>
        </article>
        <article>
          <span>
            <Link2 size={16} />
          </span>
          <div>
            <b>
              {allIdeas.reduce((sum, idea) => sum + idea.evidence.length, 0)}
            </b>
            <small>Evidence links</small>
          </div>
        </article>
        <article>
          <span>
            <GitBranch size={16} />
          </span>
          <div>
            <b>{allIdeas.filter((idea) => idea.stage === "promoted").length}</b>
            <small>Promoted</small>
          </div>
        </article>
        <article>
          <span>
            <History size={16} />
          </span>
          <div>
            <b>
              {
                allIdeas.filter(
                  (idea) =>
                    idea.reviewDate <= "2026-09-07" &&
                    idea.stage !== "archived",
                ).length
              }
            </b>
            <small>Review soon</small>
          </div>
        </article>
      </section>

      <div className="workflow-command-bar idea-command-bar">
        <label className="workflow-search">
          <Search size={15} />
          <span className="sr-only">Search ideas</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search ideas and evidence…"
          />
        </label>
        <label className="workflow-filter-select">
          <Filter size={14} />
          <span className="sr-only">Filter by project</span>
          <select
            value={hubId}
            onChange={(event) => setHubId(event.target.value)}
          >
            <option value="all">All projects</option>
            {demoHubs
              .filter((hub) => !hub.id.startsWith("original-"))
              .map((hub) => (
                <option value={hub.id} key={hub.id}>
                  {hub.name}
                </option>
              ))}
          </select>
        </label>
      </div>

      <div
        className="center-tabs idea-tabs"
        role="tablist"
        aria-label="Idea stages"
      >
        <button
          className={stage === "all" ? "active" : ""}
          aria-selected={stage === "all"}
          role="tab"
          onClick={() => setStage("all")}
        >
          All <b>{allIdeas.length}</b>
        </button>
        {(Object.keys(stageLabels) as IdeaStage[]).map((key) => (
          <button
            key={key}
            className={stage === key ? "active" : ""}
            aria-selected={stage === key}
            role="tab"
            onClick={() => setStage(key)}
          >
            {stageLabels[key]}{" "}
            <b>{allIdeas.filter((idea) => idea.stage === key).length}</b>
          </button>
        ))}
      </div>

      <section className="idea-card-grid">
        {visible.map((idea) => {
          const hub = demoHubs.find((candidate) => candidate.id === idea.hubId);
          const score = scoreOpportunity(idea);
          return (
            <article className="idea-workflow-card" key={idea.id}>
              <header>
                <span className="idea-card-icon">
                  <Lightbulb size={17} />
                </span>
                <div>
                  <p>
                    {hub?.name ?? "No project"} · {stageLabels[idea.stage]}
                  </p>
                  <h2>{idea.title}</h2>
                </div>
                <button
                  aria-label={`Open ${idea.title}`}
                  onClick={() => setSelectedId(idea.id)}
                >
                  <MoreHorizontal size={17} />
                </button>
              </header>
              <div className="idea-card-copy">
                <b>Opportunity</b>
                <p>{idea.problem}</p>
                <b>Hypothesis</b>
                <p>{idea.hypothesis}</p>
              </div>
              <div className="idea-score-row">
                <span>
                  <small>Impact</small>
                  <b>{idea.impact}/5</b>
                </span>
                <span>
                  <small>Confidence</small>
                  <b>{idea.confidence}/5</b>
                </span>
                <span>
                  <small>Fit</small>
                  <b>{idea.fit}/5</b>
                </span>
                <strong>
                  <BarChart3 size={13} /> {score}
                </strong>
              </div>
              <footer>
                <span>
                  <Link2 size={13} /> {idea.evidence.length} evidence
                </span>
                <span>Review {idea.reviewDate}</span>
                <button onClick={() => setSelectedId(idea.id)}>
                  Develop idea <ArrowRight size={13} />
                </button>
              </footer>
            </article>
          );
        })}
      </section>

      {!visible.length && (
        <section className="workflow-empty-state">
          <Lightbulb size={24} />
          <h2>No ideas match this view</h2>
          <p>
            Adjust the filters or capture a new opportunity while the context is
            fresh.
          </p>
          <button
            className="primary-button"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={15} /> Capture idea
          </button>
        </section>
      )}

      <section className="trevv-panel consequence-panel idea-learning-panel">
        <div className="panel-heading">
          <span>
            <History size={17} />
          </span>
          <div>
            <h2>Decision consequence review</h2>
            <p>
              Promoted ideas return later so the organization can learn, not
              merely remember.
            </p>
          </div>
          <Hint resourceId="ideas" />
        </div>
        {demoDecisionOutcomes.map((outcome) => (
          <article key={outcome.id}>
            <span className="outcome-badge">
              {outcome.outcome.replaceAll("_", " ")}
            </span>
            <div>
              <h3>Choose pilot packaging model</h3>
              <p>{outcome.learning}</p>
              <small>
                Would make the same decision again:{" "}
                <b>{outcome.wouldRepeat ? "Yes" : "No"}</b>
              </small>
            </div>
            <time>{outcome.recordedAt.slice(0, 10)}</time>
          </article>
        ))}
      </section>

      {createOpen && (
        <CaptureIdeaDialog
          onClose={() => setCreateOpen(false)}
          onCreate={(idea) => {
            setIdeas((current) => [idea, ...current]);
            setStage("captured");
            setCreateOpen(false);
            setSelectedId(idea.id);
            setNotice("Idea captured with its original context.");
          }}
        />
      )}
      {selected && (
        <IdeaDetailDialog
          idea={selected}
          onClose={() => setSelectedId(null)}
          onUpdate={(update, message) => {
            updateIdea(selected.id, update);
            setNotice(message);
          }}
        />
      )}
    </>
  );
}

function IdeaDetailDialog({
  idea,
  onClose,
  onUpdate,
}: {
  idea: IdeaRecord;
  onClose: () => void;
  onUpdate: (update: Partial<IdeaRecord>, message: string) => void;
}) {
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceSource, setEvidenceSource] = useState("customer feedback");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [promotionTarget, setPromotionTarget] = useState<
    "decision" | "experiment" | "board"
  >("decision");
  const hub = demoHubs.find((candidate) => candidate.id === idea.hubId);

  return (
    <div
      className="workflow-dialog-layer"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="workflow-dialog idea-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="idea-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className="dialog-title-icon idea">
            <Lightbulb size={18} />
          </span>
          <div>
            <p>
              {hub?.name ?? "No project"} · {stageLabels[idea.stage]}
            </p>
            <h2 id="idea-detail-title">{idea.title}</h2>
          </div>
          <Hint resourceId="ideas" />
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close idea"
          >
            <X size={18} />
          </button>
        </header>
        <div className="workflow-dialog-body">
          <div className="idea-detail-grid">
            <section>
              <div className="idea-narrative">
                <b>Problem / opportunity</b>
                <p>{idea.problem}</p>
                <b>Hypothesis</b>
                <p>{idea.hypothesis}</p>
              </div>
              <h3>Evidence</h3>
              <div className="idea-evidence-list">
                {idea.evidence.map((evidence) => (
                  <article key={evidence.id}>
                    <span>
                      <FileText size={15} />
                    </span>
                    <div>
                      <strong>{evidence.title}</strong>
                      <small>{evidence.source}</small>
                    </div>
                    {evidence.url && (
                      <a
                        href={evidence.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open ${evidence.title}`}
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </article>
                ))}
                {!idea.evidence.length && (
                  <p className="inline-empty">
                    No evidence attached yet. Capture the source, not only the
                    conclusion.
                  </p>
                )}
              </div>
              <div className="attach-evidence-form">
                <label className="stacked-field">
                  <span>Evidence title</span>
                  <input
                    value={evidenceTitle}
                    onChange={(event) => setEvidenceTitle(event.target.value)}
                    placeholder="What did you learn?"
                  />
                </label>
                <div className="form-grid-two">
                  <label className="stacked-field">
                    <span>Source</span>
                    <select
                      value={evidenceSource}
                      onChange={(event) =>
                        setEvidenceSource(event.target.value)
                      }
                    >
                      <option>customer feedback</option>
                      <option>research</option>
                      <option>analytics</option>
                      <option>url</option>
                      <option>file</option>
                      <option>conversation</option>
                    </select>
                  </label>
                  <label className="stacked-field">
                    <span>
                      Link <small>Optional</small>
                    </span>
                    <input
                      type="url"
                      value={evidenceUrl}
                      onChange={(event) => setEvidenceUrl(event.target.value)}
                      placeholder="https://…"
                    />
                  </label>
                </div>
                <button
                  className="secondary-button"
                  disabled={!evidenceTitle.trim()}
                  onClick={() => {
                    const evidence: IdeaEvidence = {
                      id: `evidence-${Date.now()}`,
                      title: evidenceTitle.trim(),
                      source: evidenceSource,
                      ...(evidenceUrl.trim()
                        ? { url: evidenceUrl.trim() }
                        : {}),
                    };
                    onUpdate(
                      {
                        evidence: [...idea.evidence, evidence],
                        stage:
                          idea.stage === "captured" ? "evaluating" : idea.stage,
                      },
                      "Evidence attached and the idea moved into evaluation.",
                    );
                    setEvidenceTitle("");
                    setEvidenceUrl("");
                  }}
                >
                  <Link2 size={14} /> Attach evidence
                </button>
              </div>
            </section>
            <aside>
              <h3>Evaluation</h3>
              {["impact", "confidence", "fit", "effort"].map((metric) => (
                <label className="idea-range" key={metric}>
                  <span>
                    {metric}{" "}
                    <b>
                      {
                        idea[
                          metric as keyof Pick<
                            IdeaRecord,
                            "impact" | "confidence" | "fit" | "effort"
                          >
                        ]
                      }
                      /5
                    </b>
                  </span>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={
                      idea[
                        metric as keyof Pick<
                          IdeaRecord,
                          "impact" | "confidence" | "fit" | "effort"
                        >
                      ]
                    }
                    onChange={(event) =>
                      onUpdate(
                        { [metric]: Number(event.target.value) },
                        `${metric[0]!.toUpperCase()}${metric.slice(1)} updated.`,
                      )
                    }
                  />
                </label>
              ))}
              <div className="idea-score-total">
                <BarChart3 size={17} />
                <span>Optional score</span>
                <b>{scoreOpportunity(idea)}</b>
              </div>
              <label className="stacked-field">
                <span>Review date</span>
                <input
                  type="date"
                  value={idea.reviewDate}
                  onChange={(event) =>
                    onUpdate(
                      { reviewDate: event.target.value },
                      "Review date updated.",
                    )
                  }
                />
              </label>
              <hr />
              <h3>Promote when ready</h3>
              <p className="aside-helper">
                Promotion keeps this idea and every evidence link connected to
                the new work.
              </p>
              <label className="stacked-field">
                <span>Destination</span>
                <select
                  value={promotionTarget}
                  onChange={(event) =>
                    setPromotionTarget(
                      event.target.value as typeof promotionTarget,
                    )
                  }
                >
                  <option value="decision">Decision</option>
                  <option value="experiment">Experiment</option>
                  <option value="board">Board item</option>
                </select>
              </label>
              <button
                className="primary-button full-width"
                disabled={idea.stage === "promoted"}
                onClick={() =>
                  onUpdate(
                    { stage: "promoted", promotedTo: promotionTarget },
                    `Idea promoted to ${promotionTarget}; provenance was preserved.`,
                  )
                }
              >
                <GitBranch size={14} />{" "}
                {idea.stage === "promoted"
                  ? `Promoted to ${idea.promotedTo}`
                  : "Promote idea"}
              </button>
              {idea.promotedTo === "decision" && (
                <Link className="linked-work-callout" href="/app/decisions">
                  <Sparkles size={14} /> Open linked decision{" "}
                  <ArrowRight size={13} />
                </Link>
              )}
            </aside>
          </div>
        </div>
        <footer className="workflow-dialog-actions">
          <button
            className="danger-text-button"
            disabled={idea.stage === "archived"}
            onClick={() =>
              onUpdate(
                { stage: "archived" },
                "Idea archived; its evidence remains searchable.",
              )
            }
          >
            <Archive size={14} />{" "}
            {idea.stage === "archived" ? "Archived" : "Archive idea"}
          </button>
          <div>
            <button className="secondary-button" onClick={onClose}>
              Done
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function CaptureIdeaDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (idea: IdeaRecord) => void;
}) {
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [hubId, setHubId] = useState("hub-mealflow");
  const [reviewDate, setReviewDate] = useState("2026-09-10");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !problem.trim()) return;
    onCreate({
      id: `idea-${Date.now()}`,
      title: title.trim(),
      hubId,
      problem: problem.trim(),
      hypothesis: hypothesis.trim() || "Hypothesis not recorded yet.",
      impact: 3,
      confidence: 2,
      fit: 3,
      effort: 3,
      reviewDate,
      stage: "captured",
      evidence: [],
    });
  };

  return (
    <div
      className="workflow-dialog-layer"
      role="presentation"
      onMouseDown={onClose}
    >
      <form
        className="workflow-dialog compact-workflow-dialog"
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-idea-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className="dialog-title-icon idea">
            <Lightbulb size={18} />
          </span>
          <div>
            <p>Ideas & evidence</p>
            <h2 id="capture-idea-title">Capture an idea</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close idea capture"
          >
            <X size={18} />
          </button>
        </header>
        <div className="workflow-dialog-body form-stack">
          <label className="stacked-field">
            <span>Idea title</span>
            <input
              autoFocus
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Name the opportunity clearly"
            />
          </label>
          <label className="stacked-field">
            <span>Problem or opportunity</span>
            <textarea
              required
              value={problem}
              onChange={(event) => setProblem(event.target.value)}
              placeholder="What did you notice, and for whom?"
            />
          </label>
          <label className="stacked-field">
            <span>
              Hypothesis <small>Optional</small>
            </span>
            <textarea
              value={hypothesis}
              onChange={(event) => setHypothesis(event.target.value)}
              placeholder="If we…, then we expect…"
            />
          </label>
          <div className="form-grid-two">
            <label className="stacked-field">
              <span>Project</span>
              <select
                value={hubId}
                onChange={(event) => setHubId(event.target.value)}
              >
                {demoHubs
                  .filter((hub) => !hub.id.startsWith("original-"))
                  .map((hub) => (
                    <option key={hub.id} value={hub.id}>
                      {hub.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="stacked-field">
              <span>Review date</span>
              <input
                type="date"
                required
                value={reviewDate}
                onChange={(event) => setReviewDate(event.target.value)}
              />
            </label>
          </div>
        </div>
        <footer className="workflow-dialog-actions">
          <span>Scoring is optional and can be added after evidence.</span>
          <div>
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={!title.trim() || !problem.trim()}
            >
              <Plus size={14} /> Capture idea
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function capturedIdeaRecord(item: CapturedWorkItem): IdeaRecord {
  return {
    id: item.id,
    title: item.title,
    hubId: item.hubId,
    problem:
      item.details ??
      "Captured from Create. Add the original observation or opportunity.",
    hypothesis: "Hypothesis not recorded yet.",
    impact: item.priority === "urgent" ? 5 : item.priority === "high" ? 4 : 3,
    confidence: 2,
    fit: 3,
    effort: 3,
    reviewDate: item.dueDate ?? "2026-09-10",
    stage: "captured",
    evidence: item.evidenceUrl
      ? [
          {
            id: `${item.id}-evidence`,
            title: "Captured source",
            source: "url",
            url: item.evidenceUrl,
          },
        ]
      : [],
  };
}
