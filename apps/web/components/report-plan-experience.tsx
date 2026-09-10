"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardList,
  Copy,
  FileText,
  LockKeyhole,
  Plus,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import { TrevvApiError } from "@founderhq/api-client";
import {
  createReportPlanClient,
  type ReportPlanClient,
} from "@founderhq/api-client/report-plan";
import {
  saveReportPlanSchema,
  type ReportPlanDto,
  type ReportPlanQuery,
  type SaveReportPlanInput,
} from "@founderhq/api-contract/report-plan";
import { useAppSession } from "@/lib/app-session-context";
import { useWorkspaceState } from "@/lib/workspace-context";
import { useOptionalLiveAppRecords } from "@/lib/live-app-data";
import { useAccessibleDialog } from "@/lib/live-collaboration";
import {
  contentLabels,
  healthLabels,
  newReportPlan,
  nextReportPlan,
  planFields,
  reportFields,
  reportingToday,
  reportPeriod,
  reportPlanInput,
  reportPlanText,
  type PeriodPreset,
} from "@/lib/report-plan";
import { createDemoReportPlanClient } from "@/lib/report-plan-demo";
import { workspaceHref } from "@/lib/workspace-routes";
import { AppLink as Link } from "./navigation-link";
import { WorkspaceFrame } from "./workspace-frame";
import styles from "./report-plan.module.css";

const presets: Array<[PeriodPreset, string]> = [
  ["today", "Today"],
  ["tomorrow", "Tomorrow"],
  ["this_week", "This week"],
  ["next_week", "Next week"],
  ["this_month", "This month"],
  ["next_month", "Next month"],
];
type Editor = { record?: ReportPlanDto; input: SaveReportPlanInput };

export function ReportPlanExperience({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const session = useAppSession();
  const { allWorkspaces } = useWorkspaceState();
  const workspace = allWorkspaces.find((value) => value.slug === workspaceSlug);
  return (
    <WorkspaceFrame active="report-plan" workspaceSlug={workspaceSlug}>
      {workspace ? (
        <ReportPlanWorkspace
          key={`${session.organization.id}:${session.user.id}:${workspace.id}`}
          workspaceId={workspace.id}
          workspaceSlug={workspaceSlug}
          workspaceName={workspace.name}
        />
      ) : (
        <main className={styles.main}>
          <h1>Report and plan</h1>
          <p>This workspace is not available.</p>
        </main>
      )}
    </WorkspaceFrame>
  );
}

function ReportPlanWorkspace({
  workspaceId,
  workspaceSlug,
  workspaceName,
}: {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
}) {
  const session = useAppSession();
  const liveData = useOptionalLiveAppRecords();
  const cache = useQueryClient();
  const client = useMemo(
    () =>
      session.demo
        ? createDemoReportPlanClient(session.organization.id, {
            id: session.user.id,
            name: session.user.name,
          })
        : createReportPlanClient({ baseUrl: "/api/v1" }),
    [session.demo, session.organization.id, session.user.id, session.user.name],
  );
  const rootKey = [
    "report-plans",
    session.organization.id,
    session.user.id,
    workspaceId,
  ];
  const [filters, setFilters] = useState<ReportPlanQuery>({ page: 1 });
  const [editor, setEditor] = useState<Editor | null>(null);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [opening, setOpening] = useState(false);
  const timezone = session.organization.timezone ?? "Europe/Berlin";
  const today = reportingToday(timezone);
  const validRange = !filters.from || !filters.to || filters.from <= filters.to;
  const query = useQuery({
    queryKey: [...rootKey, filters],
    queryFn: ({ signal }) => client.list(workspaceId, filters, signal),
    enabled: validRange,
    staleTime: 15_000,
    refetchInterval: session.demo ? false : 30_000,
    refetchIntervalInBackground: false,
  });
  const accessLost =
    query.error instanceof TrevvApiError &&
    [401, 403, 404].includes(query.error.status);
  const directory = useQuery({
    queryKey: [...rootKey, "members"],
    queryFn: ({ signal }) =>
      liveData!.client.withSignal(signal).teamDirectory(workspaceId),
    enabled: !session.demo && Boolean(liveData) && !accessLost,
    staleTime: 60_000,
  });
  const rows = accessLost || !validRange ? [] : (query.data?.data ?? []);
  const canWrite =
    !["viewer", "guest"].includes(session.organization.role) && !accessLost;
  const members = new Map<string, string>([
    [session.user.id, `${session.user.name} (me)`],
  ]);
  if (!accessLost && !directory.error)
    directory.data?.availableMembers.forEach((member) => {
      if (member.id !== session.user.id) members.set(member.id, member.name);
    });
  rows.forEach((row) => {
    if (row.authorId !== session.user.id)
      members.set(row.authorId, row.authorName);
  });
  const changeFilters = (patch: Partial<ReportPlanQuery>) => {
    setFilters((current) => ({ ...current, ...patch, page: 1 }));
    setNotice("");
  };
  const start = (kind: "report" | "plan") => {
    setEditor({ input: newReportPlan(kind, today) });
    setActionError("");
    setNotice("");
  };
  const open = async (record: ReportPlanDto, duplicate = false) => {
    setOpening(true);
    setActionError("");
    try {
      const latest = await client.get(record.id);
      if (latest.archivedAt)
        throw new Error("This update was archived. Refresh the list.");
      setEditor(
        duplicate
          ? { input: nextReportPlan(latest) }
          : { record: latest, input: reportPlanInput(latest) },
      );
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setOpening(false);
    }
  };
  const onSaved = (record: ReportPlanDto) => {
    setEditor(null);
    setFilters({
      page: 1,
      authorId: session.user.id,
      ...(record.archivedAt ? {} : { kind: record.kind, state: record.state }),
    });
    setNotice(
      record.archivedAt
        ? "Update archived."
        : record.state === "draft"
          ? "Private draft saved. Only you can see it."
          : session.demo
            ? "Saved in this browser’s demo. Nothing was shared with a real workspace."
            : "Published to the workspace.",
    );
    void cache.invalidateQueries({ queryKey: rootKey });
  };
  async function copy(record: ReportPlanDto) {
    try {
      await navigator.clipboard.writeText(reportPlanText(record));
      setNotice("Update copied to clipboard.");
    } catch {
      setActionError(
        "Could not access the clipboard. Open the update and select its text to copy it.",
      );
    }
  }
  return (
    <main className={styles.main}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{workspaceName} / Team updates</p>
          <h1>Report and plan</h1>
          <p>
            Make progress visible. Surface what’s stuck. Set out what comes
            next.
          </p>
        </div>
        {canWrite && (
          <div className={styles.actions}>
            <button
              className={styles.secondary}
              onClick={() => start("report")}
            >
              <FileText size={18} />
              Write report
            </button>
            <button className={styles.primary} onClick={() => start("plan")}>
              <Plus size={19} />
              Create plan
            </button>
          </div>
        )}
      </header>
      <div className={styles.intro}>
        <div>
          <ClipboardList size={22} />
          <div>
            <strong>Report your progress</strong>
            <p>Current work, completed outcomes, blockers and support.</p>
          </div>
        </div>
        <div>
          <CalendarDays size={22} />
          <div>
            <strong>Plan the next period</strong>
            <p>Tomorrow, a week, a month, a sprint or your own dates.</p>
          </div>
        </div>
        <div>
          <LockKeyhole size={22} />
          <div>
            <strong>Draft privately, share when ready</strong>
            <p>
              Published updates are visible to people with workspace access.
            </p>
          </div>
        </div>
      </div>
      {session.demo && (
        <p className={styles.notice}>
          Demo mode: updates are saved only in this browser, separately from
          live workspace data.
        </p>
      )}
      {!canWrite && !accessLost && (
        <p className={styles.notice}>
          Your role can read shared updates. Writing reports and plans requires
          member access.
        </p>
      )}
      <section className={styles.feed} aria-label="Reports and plans">
        <div className={styles.feedHeader}>
          <div className={styles.tabs} role="group" aria-label="Update type">
            {[
              [undefined, "All updates"],
              ["report", "Reports"],
              ["plan", "Plans"],
            ].map(([kind, label]) => (
              <button
                key={label}
                aria-pressed={filters.kind === kind}
                onClick={() =>
                  changeFilters({ kind: kind as ReportPlanQuery["kind"] })
                }
              >
                {label}
              </button>
            ))}
          </div>
          <button
            className={styles.iconButton}
            disabled={query.isFetching || !validRange}
            onClick={() => void query.refetch()}
            aria-label="Refresh reports and plans"
          >
            <RefreshCw size={18} />
          </button>
        </div>
        <div className={styles.filters}>
          <label>
            Member
            <select
              disabled={filters.state === "draft"}
              value={filters.authorId ?? ""}
              onChange={(event) =>
                changeFilters({ authorId: event.target.value || undefined })
              }
            >
              <option value="">All members</option>
              {[...members].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Visibility
            <select
              value={filters.state ?? ""}
              onChange={(event) =>
                changeFilters({
                  state: (event.target.value ||
                    undefined) as ReportPlanQuery["state"],
                  ...(event.target.value === "draft"
                    ? { authorId: session.user.id }
                    : {}),
                })
              }
            >
              <option value="">Published + my drafts</option>
              <option value="published">Published</option>
              <option value="draft">My private drafts</option>
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              value={filters.from ?? ""}
              onChange={(event) =>
                changeFilters({ from: event.target.value || undefined })
              }
            />
          </label>
          <label>
            Through
            <input
              type="date"
              value={filters.to ?? ""}
              min={filters.from}
              onChange={(event) =>
                changeFilters({ to: event.target.value || undefined })
              }
            />
          </label>
          <button
            className={styles.attentionFilter}
            aria-pressed={Boolean(filters.attention)}
            onClick={() =>
              changeFilters({
                attention: filters.attention ? undefined : "true",
              })
            }
          >
            Needs attention
          </button>
        </div>
        <div className={styles.filterFoot}>
          <span>Dates include overlapping report and plan periods.</span>
          <div>
            <button
              onClick={() => {
                const range = reportPeriod("this_week", today);
                changeFilters({ from: range.periodStart, to: range.periodEnd });
              }}
            >
              This week
            </button>
            <button onClick={() => setFilters({ page: 1 })}>
              Reset filters
            </button>
          </div>
        </div>
        {notice && (
          <p role="status" className={styles.success}>
            <Check size={16} />
            {notice}
          </p>
        )}
        {actionError && (
          <p role="alert" className={styles.error}>
            {actionError}
          </p>
        )}
        {!validRange ? (
          <p role="alert" className={styles.error}>
            Choose an end date on or after the start date.
          </p>
        ) : query.error ? (
          <p role="alert" className={styles.error}>
            {accessLost
              ? "You no longer have access to these workspace updates."
              : `${errorText(query.error)} Use Refresh to retry.`}
          </p>
        ) : query.isPending ? (
          <p role="status" className={styles.empty}>
            Loading reports and plans…
          </p>
        ) : null}
        {validRange &&
          !query.isPending &&
          !query.error &&
          rows.length === 0 && (
            <div className={styles.empty}>
              <FileText size={30} />
              <h2>No updates here yet</h2>
              <p>
                {Object.keys(filters).some(
                  (key) =>
                    key !== "page" &&
                    filters[key as keyof ReportPlanQuery] !== undefined,
                )
                  ? "Try a different member, date range or visibility filter."
                  : "Share a progress report or outline your next plan to start the conversation."}
              </p>
              {canWrite && (
                <button
                  className={styles.secondary}
                  onClick={() => start("report")}
                >
                  Write your first report
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          )}
        {rows.length > 0 && (
          <div className={styles.cards}>
            {rows.map((record) => (
              <article key={record.id} className={styles.card}>
                <div className={styles.cardMeta}>
                  <span className={styles.kind}>
                    {record.kind === "report" ? (
                      <FileText size={15} />
                    ) : (
                      <CalendarDays size={15} />
                    )}
                    {record.kind === "report" ? "Report" : "Plan"}
                  </span>
                  <span>{formatPeriod(record)}</span>
                  <span className={styles.health} data-health={record.health}>
                    {healthLabels[record.health]}
                  </span>
                  {record.state === "draft" && (
                    <span className={styles.draft}>
                      <LockKeyhole size={13} />
                      Private draft
                    </span>
                  )}
                </div>
                <h2>{record.title}</h2>
                <p className={styles.byline}>
                  {record.authorName}
                  {record.context && ` · ${record.context}`}
                </p>
                <p className={styles.preview}>
                  {(record.kind === "report"
                    ? record.content.completed || record.content.workingOn
                    : record.content.goals) || "Draft in progress"}
                </p>
                <div className={styles.flags}>
                  {record.content.blockers && <span>Blocker reported</span>}
                  {record.content.supportNeeded && (
                    <span>Support requested</span>
                  )}
                </div>
                <details className={styles.details}>
                  <summary>Read full {record.kind}</summary>
                  <dl>
                    {(record.kind === "report" ? reportFields : planFields)
                      .filter((field) => record.content[field])
                      .map((field) => (
                        <div key={field}>
                          <dt>{contentLabels[field]}</dt>
                          <dd>{record.content[field]}</dd>
                        </div>
                      ))}
                  </dl>
                  <p className={styles.byline}>
                    Last saved {formatSaved(record.updatedAt, timezone)}
                  </p>
                </details>
                <footer className={styles.cardActions}>
                  <button onClick={() => void copy(record)}>
                    <Copy size={15} />
                    Copy text
                  </button>
                  {canWrite && record.authorId === session.user.id && (
                    <button
                      disabled={opening}
                      onClick={() => void open(record)}
                    >
                      Edit {record.state === "draft" ? "draft" : "update"}
                    </button>
                  )}
                  {canWrite &&
                    record.kind === "plan" &&
                    record.authorId === session.user.id && (
                      <button
                        disabled={opening}
                        onClick={() => void open(record, true)}
                      >
                        Plan next period
                        <ArrowRight size={15} />
                      </button>
                    )}
                </footer>
              </article>
            ))}
          </div>
        )}
        {validRange && !accessLost && (
          <div className={styles.pagination}>
            <span>
              Page {filters.page}
              {rows.length > 0
                ? ` · ${rows.length} update${rows.length === 1 ? "" : "s"}`
                : ""}
            </span>
            <div>
              <button
                className={styles.secondary}
                disabled={filters.page === 1 || query.isFetching}
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    page: current.page - 1,
                  }))
                }
              >
                Previous
              </button>
              <button
                className={styles.secondary}
                disabled={!query.data?.hasMore || query.isFetching}
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    page: current.page + 1,
                  }))
                }
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
      <p className={styles.related}>
        Looking for the workspace-wide check-in?{" "}
        <Link href={workspaceHref(workspaceSlug, "reviews")}>
          Open weekly review
          <ArrowRight size={14} />
        </Link>
      </p>
      {editor && canWrite && (
        <ReportPlanEditor
          key={
            editor.record
              ? `${editor.record.id}:${editor.record.version}`
              : "new"
          }
          initial={editor}
          client={client}
          workspaceId={workspaceId}
          today={today}
          timezone={timezone}
          demo={session.demo}
          onClose={() => setEditor(null)}
          onSaved={onSaved}
          onReload={(record) =>
            setEditor({ record, input: reportPlanInput(record) })
          }
        />
      )}
    </main>
  );
}

const hints = {
  workingOn:
    "What are you working on right now? Include the task, its current stage and what remains.",
  completed:
    "What did you finish in this period? List concrete actions, outcomes and relevant task references.",
  blockers:
    "What is stopping progress? Explain the impact and when a decision is needed. Leave empty if none.",
  supportNeeded:
    "What do you need, from whom, and by when? Leave empty if no support is needed.",
  nextSteps:
    "List your next actions in priority order. Add expected timing or milestones where useful.",
  goals:
    "What are the most important outcomes you want to achieve in this period?",
  successCriteria:
    "How will you know the plan is complete? Add deliverables or measurable outcomes.",
  dependencies:
    "Who or what does the plan depend on? Include capacity limits, approvals and risks.",
};
function ReportPlanEditor({
  initial,
  client,
  workspaceId,
  today,
  timezone,
  demo,
  onClose,
  onSaved,
  onReload,
}: {
  initial: Editor;
  client: ReportPlanClient;
  workspaceId: string;
  today: string;
  timezone: string;
  demo: boolean;
  onClose: () => void;
  onSaved: (record: ReportPlanDto) => void;
  onReload: (record: ReportPlanDto) => void;
}) {
  const [input, setInput] = useState(initial.input);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const dirty = JSON.stringify(input) !== JSON.stringify(initial.input);
  const close = () => {
    if (busy) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };
  const dialog = useAccessibleDialog(close);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const keyFor = (value: unknown) => {
    const fingerprint = JSON.stringify(value);
    if (attempt.current?.fingerprint !== fingerprint)
      attempt.current = { fingerprint, key: crypto.randomUUID() };
    return attempt.current!.key;
  };
  async function save(state: "draft" | "published") {
    if (busy) return;
    const parsed = saveReportPlanSchema.safeParse({ ...input, state });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    setBusy(true);
    setError("");
    setConfirmDiscard(false);
    try {
      const key = keyFor({
        id: initial.record?.id,
        version: initial.record?.version,
        input: parsed.data,
      });
      const record = initial.record
        ? await client.update(
            initial.record.id,
            initial.record.version,
            parsed.data,
            key,
          )
        : await client.create(workspaceId, parsed.data, key);
      onSaved(record);
    } catch (failure) {
      setError(errorText(failure));
      setConflict(failure instanceof TrevvApiError && failure.status === 409);
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!initial.record || busy) return;
    setBusy(true);
    setError("");
    try {
      onSaved(
        await client.archive(
          initial.record.id,
          initial.record.version,
          keyFor({
            id: initial.record.id,
            version: initial.record.version,
            action: "archive",
          }),
        ),
      );
    } catch (failure) {
      setError(errorText(failure));
      setConflict(failure instanceof TrevvApiError && failure.status === 409);
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    if (!initial.record || busy) return;
    setBusy(true);
    setError("");
    try {
      const record = await client.get(initial.record.id);
      if (record.archivedAt)
        throw new Error(
          "This update was archived. Close this editor and refresh the list.",
        );
      onReload(record);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void save("published");
  }
  return (
    <div className={styles.overlay}>
      <div
        ref={dialog}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-plan-editor-title"
        aria-describedby="report-plan-editor-privacy"
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <div>
            <p className={styles.eyebrow}>
              {initial.record ? "Edit your update" : "New update"}
            </p>
            <h2 id="report-plan-editor-title">
              {input.kind === "report" ? "Progress report" : "Work plan"}
            </h2>
          </div>
          <button
            className={styles.iconButton}
            disabled={busy}
            aria-label="Close editor"
            onClick={close}
          >
            <X size={21} />
          </button>
        </header>
        <form onSubmit={submit}>
          <div className={styles.editorBody}>
            <p id="report-plan-editor-privacy" className={styles.privacy}>
              <LockKeyhole size={17} />
              {demo
                ? "Demo only: saved in this browser. No real members will receive this update."
                : initial.record?.state === "published"
                  ? "This update is shared with people who can access this workspace. Saved changes remain shared."
                  : "Save a private draft, or publish when you’re ready to share with people who can access this workspace."}
            </p>
            <fieldset disabled={busy} className={styles.editorFields}>
              <label className={styles.full}>
                Title
                <input
                  value={input.title}
                  required
                  maxLength={160}
                  onChange={(event) =>
                    setInput((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </label>
              <div className={styles.full}>
                <span className={styles.fieldLabel}>Quick dates</span>
                <div className={styles.presets}>
                  {presets.map(([preset, label]) => (
                    <button
                      type="button"
                      key={preset}
                      onClick={() =>
                        setInput((current) => ({
                          ...current,
                          ...reportPeriod(preset, today),
                          title: [
                            "Daily report",
                            "Tomorrow’s plan",
                            ...presets.flatMap(([, name]) => [
                              `${name} report`,
                              `${name} plan`,
                            ]),
                          ].includes(current.title)
                            ? `${label} ${current.kind}`
                            : current.title,
                        }))
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <label>
                Period
                <select
                  value={input.period}
                  onChange={(event) => {
                    const period = event.target
                      .value as SaveReportPlanInput["period"];
                    setInput((current) => ({
                      ...current,
                      period,
                      ...(period === "day"
                        ? { periodEnd: current.periodStart }
                        : {}),
                    }));
                  }}
                >
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  <option value="sprint">Sprint</option>
                  <option value="custom">Custom period</option>
                </select>
              </label>
              <label>
                Progress
                <select
                  value={input.health}
                  onChange={(event) =>
                    setInput((current) => ({
                      ...current,
                      health: event.target
                        .value as SaveReportPlanInput["health"],
                    }))
                  }
                >
                  {Object.entries(healthLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Start date
                <input
                  type="date"
                  required
                  value={input.periodStart}
                  onChange={(event) =>
                    setInput((current) => ({
                      ...current,
                      periodStart: event.target.value,
                      ...(current.period === "day"
                        ? { periodEnd: event.target.value }
                        : {}),
                    }))
                  }
                />
              </label>
              <label>
                End date
                <input
                  type="date"
                  required
                  readOnly={input.period === "day"}
                  min={input.periodStart}
                  value={input.periodEnd}
                  onChange={(event) =>
                    setInput((current) => ({
                      ...current,
                      periodEnd: event.target.value,
                    }))
                  }
                />
              </label>
              <p className={styles.dateNote}>
                Quick dates use {timezone}. Start and end dates are included.
              </p>
              <label className={styles.full}>
                Project or sprint{" "}
                <span className={styles.optional}>(optional context)</span>
                <input
                  maxLength={240}
                  placeholder="e.g. Website launch · Sprint 12"
                  value={input.context}
                  onChange={(event) =>
                    setInput((current) => ({
                      ...current,
                      context: event.target.value,
                    }))
                  }
                />
              </label>
              {(input.kind === "report" ? reportFields : planFields).map(
                (field) => (
                  <label key={field} className={styles.full}>
                    {contentLabels[field]}
                    <span className={styles.hint}>{hints[field]}</span>
                    <textarea
                      rows={
                        field === "completed" ||
                        field === "goals" ||
                        field === "nextSteps"
                          ? 4
                          : 3
                      }
                      maxLength={4000}
                      value={input.content[field]}
                      onChange={(event) =>
                        setInput((current) => ({
                          ...current,
                          content: {
                            ...current.content,
                            [field]: event.target.value,
                          },
                        }))
                      }
                    />
                    <span className={styles.counter}>
                      {input.content[field].length}/4,000
                    </span>
                  </label>
                ),
              )}
            </fieldset>
            {error && (
              <div className={styles.error} role="alert">
                <p>{error}</p>
                {conflict && initial.record && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void reload()}
                  >
                    Load latest version (replaces unsaved edits)
                  </button>
                )}
              </div>
            )}
            {confirmDiscard && (
              <div className={styles.confirm} role="alert">
                <p>
                  {initial.record?.state === "published"
                    ? "You have unsaved changes. Save your changes to keep them, or discard them."
                    : "You have unsaved changes. Save a draft to keep them, or discard them."}
                </p>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => setConfirmDiscard(false)}
                >
                  Keep editing
                </button>
                <button type="button" onClick={onClose}>
                  Discard changes
                </button>
              </div>
            )}
            {confirmArchive && (
              <div className={styles.confirm} role="alert">
                <p>
                  Archive this {input.kind}? It will be removed from the active
                  workspace feed.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  className={styles.secondary}
                  onClick={() => setConfirmArchive(false)}
                >
                  Keep update
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void archive()}
                >
                  Archive update
                </button>
              </div>
            )}
          </div>
          <footer className={styles.editorFooter}>
            <div>
              {initial.record && (
                <button
                  type="button"
                  className={styles.archive}
                  disabled={busy}
                  onClick={() => setConfirmArchive(true)}
                >
                  Archive
                </button>
              )}
              <span>
                {busy
                  ? "Saving…"
                  : dirty
                    ? "Unsaved changes"
                    : initial.record
                      ? "Saved update"
                      : "Not saved yet"}
              </span>
            </div>
            <div className={styles.actions}>
              {initial.record?.state !== "published" && (
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={busy}
                  onClick={() => void save("draft")}
                >
                  <LockKeyhole size={16} />
                  Save draft
                </button>
              )}
              <button type="submit" className={styles.primary} disabled={busy}>
                <Send size={16} />
                {initial.record?.state === "published"
                  ? "Save changes"
                  : demo
                    ? "Publish in demo"
                    : "Publish to workspace"}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : "This action could not be completed. Please try again.";
}
function formatPeriod(record: ReportPlanDto) {
  const format = (value: string) =>
    new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}T12:00:00Z`));
  return record.periodStart === record.periodEnd
    ? format(record.periodStart)
    : `${format(record.periodStart)} – ${format(record.periodEnd)}`;
}
function formatSaved(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}
