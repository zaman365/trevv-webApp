"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
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
  Clock3,
  LayoutTemplate,
  Download,
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
  reportTemplates,
  reportTemplateHints,
  reportFromTemplate,
  reportKindLabels,
  reuseReportTemplate,
  reportTimeTotal,
  formatWorkMinutes,
  reportTimeCsv,
  type PeriodPreset,
} from "@/lib/report-plan";
import { createDemoReportPlanClient } from "@/lib/report-plan-demo";
import { workspaceHref } from "@/lib/workspace-routes";
import { AppLink as Link } from "@/components/navigation-link";
import { WorkspaceFrame } from "./workspace-frame";
import { PageTabs } from "./page-tabs";
import {
  ReportTimeFields,
  ReportResourceFields,
  ReportLogDetails,
} from "./report-log-fields";
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
    <WorkspaceFrame active="report-log" workspaceSlug={workspaceSlug}>
      {workspace ? (
        <ReportPlanWorkspace
          key={`${session.organization.id}:${session.user.id}:${workspace.id}`}
          workspaceId={workspace.id}
          workspaceSlug={workspaceSlug}
        />
      ) : (
        <main className={styles.main}>
          <h1>Report & Log</h1>
          <p>This workspace is not available.</p>
        </main>
      )}
    </WorkspaceFrame>
  );
}

export function ReportPlanWorkspace({
  workspaceId,
  workspaceSlug,
  embedded = false,
}: {
  workspaceId: string;
  workspaceSlug: string;
  embedded?: boolean;
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
  const tabsId = useId();
  const [showTemplates, setShowTemplates] = useState(false);
  const Container = embedded ? "section" : "main";
  const Heading = embedded ? "h2" : "h1";
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
  const start = (kind: SaveReportPlanInput["kind"]) => {
    setEditor({ input: newReportPlan(kind, today) });
    setActionError("");
    setNotice("");
  };
  const open = async (
    record: ReportPlanDto,
    duplicate: false | "next" | "template" = false,
  ) => {
    setOpening(true);
    setActionError("");
    try {
      const latest = await client.get(record.id);
      if (latest.archivedAt)
        throw new Error("This update was archived. Refresh the list.");
      setEditor(
        duplicate
          ? {
              input:
                duplicate === "next"
                  ? nextReportPlan(latest)
                  : reuseReportTemplate(latest, today),
            }
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
    setShowTemplates(false);
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
  function exportTime() {
    const url = URL.createObjectURL(
      new Blob([reportTimeCsv(rows)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `trevv-work-time-page-${filters.page}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Container
      className={embedded ? styles.embedded : styles.main}
      aria-label="Report & Log"
    >
      <header className={`${styles.hero} compact-page-header`}>
        <div>
          <Heading>Report & Log</Heading>
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
            <button className={styles.primary} onClick={() => start("log")}>
              <Clock3 size={18} aria-hidden="true" /> Log work / time
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
            <strong>Log work and time</strong>
            <p>
              Activities, working hours, breaks, results and resource links.
            </p>
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
          Your role can read shared updates. Writing reports and logs requires
          member access.
        </p>
      )}
      <PageTabs
        id={tabsId}
        label="Report & Log views"
        value={showTemplates ? "templates" : (filters.kind ?? "all")}
        sections={[
          { id: "all", label: "All updates" },
          { id: "report", label: "Reports" },
          { id: "log", label: "Work logs" },
          { id: "plan", label: "Plans" },
          {
            id: "templates",
            label: "Templates",
            icon: <LayoutTemplate size={16} aria-hidden="true" />,
          },
        ]}
        onChange={(view) => {
          setShowTemplates(view === "templates");
          if (view !== "templates")
            changeFilters({
              kind:
                view === "all" ? undefined : (view as ReportPlanQuery["kind"]),
            });
        }}
      />
      {showTemplates && (
        <section
          className={styles.templatePanel}
          role="tabpanel"
          id={`${tabsId}-panel-templates`}
          aria-labelledby={`${tabsId}-tab-templates`}
        >
          <h2>Start with a template</h2>
          <p>
            Choose a structure, then add your own work, results and resources.
          </p>
          <div className={styles.templateGrid}>
            {reportTemplates.map((template) => (
              <article key={template.id}>
                <LayoutTemplate size={20} aria-hidden="true" />
                <h3>{template.name}</h3>
                <p>{template.description}</p>
                <button
                  className={styles.secondary}
                  disabled={!canWrite}
                  onClick={() =>
                    setEditor({ input: reportFromTemplate(template.id, today) })
                  }
                >
                  Use {template.name}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
      <section
        className={styles.feed}
        hidden={showTemplates}
        role="tabpanel"
        id={`${tabsId}-panel-${filters.kind ?? "all"}`}
        aria-labelledby={`${tabsId}-tab-${filters.kind ?? "all"}`}
      >
        <div className={styles.feedHeader}>
          <div className={styles.actions}>
            <strong>
              {filters.kind
                ? `${reportKindLabels[filters.kind]} entries`
                : "Workspace updates"}
            </strong>
            {filters.kind === "plan" && canWrite && (
              <button
                className={styles.secondary}
                onClick={() => start("plan")}
              >
                <Plus size={16} aria-hidden="true" />
                Create plan
              </button>
            )}
            {rows.some((record) => record.content.timeEntries?.length) && (
              <button className={styles.secondary} onClick={exportTime}>
                <Download size={16} aria-hidden="true" /> Export time on this
                page
              </button>
            )}
          </div>
          <button
            className={styles.iconButton}
            disabled={query.isFetching || !validRange}
            onClick={() => void query.refetch()}
            aria-label="Refresh reports and logs"
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
          <span>Dates include overlapping report and log periods.</span>
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
            Loading reports and logs…
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
                  : "Write a report, log your work or choose a template to get started."}
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
                    {reportKindLabels[record.kind]}
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
                  {(record.kind === "plan"
                    ? record.content.goals
                    : record.content.results ||
                      record.content.completed ||
                      record.content.workingOn ||
                      record.content.timeEntries
                        ?.map((entry) => entry.activity)
                        .join(" · ")) || "Draft in progress"}
                </p>
                <div className={styles.logSummary}>
                  {!!record.content.timeEntries?.length && (
                    <span>
                      <Clock3 size={14} aria-hidden="true" />
                      {formatWorkMinutes(reportTimeTotal(record))} logged
                    </span>
                  )}
                  {record.content.progressPercent !== undefined && (
                    <span>{record.content.progressPercent}% progress</span>
                  )}
                  {!!record.content.resources?.length && (
                    <span>
                      {record.content.resources.length} resource links
                    </span>
                  )}
                </div>
                <div className={styles.flags}>
                  {record.content.blockers && <span>Blocker reported</span>}
                  {record.content.supportNeeded && (
                    <span>Support requested</span>
                  )}
                </div>
                <details className={styles.details}>
                  <summary>Read full {record.kind}</summary>
                  <dl>
                    {(record.kind === "plan" ? planFields : reportFields)
                      .filter((field) => record.content[field])
                      .map((field) => (
                        <div key={field}>
                          <dt>{contentLabels[field]}</dt>
                          <dd>{record.content[field]}</dd>
                        </div>
                      ))}
                  </dl>
                  <ReportLogDetails input={record} />
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
                  {canWrite && record.authorId === session.user.id && (
                    <button
                      disabled={opening}
                      onClick={() => void open(record, "template")}
                    >
                      <LayoutTemplate size={15} aria-hidden="true" />
                      Use as template
                    </button>
                  )}
                  {canWrite &&
                    record.kind === "plan" &&
                    record.authorId === session.user.id && (
                      <button
                        disabled={opening}
                        onClick={() => void open(record, "next")}
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
    </Container>
  );
}

const hints = {
  results:
    "What changed because of this work? Include deliverables, measurable results, impact or lessons learned.",
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
  const editorTabsId = useId();
  const [editorTab, setEditorTab] = useState("update");
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
      const section = parsed.error.issues[0]?.path[1];
      setEditorTab(
        section === "timeEntries"
          ? "time"
          : section === "resources"
            ? "resources"
            : "update",
      );
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
              {input.kind === "plan"
                ? "Work plan"
                : input.kind === "log"
                  ? "Work & time log"
                  : "Progress report"}
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
        <form onSubmit={submit} noValidate>
          <div className={styles.editorBody}>
            <p id="report-plan-editor-privacy" className={styles.privacy}>
              <LockKeyhole size={17} />
              {demo
                ? "Demo only: saved in this browser. No real members will receive this update."
                : initial.record?.state === "published"
                  ? "This update is shared with people who can access this workspace. Saved changes remain shared."
                  : "Save a private draft, or publish when you’re ready to share with people who can access this workspace."}
            </p>
            <PageTabs
              id={editorTabsId}
              label="Report editor sections"
              value={editorTab}
              onChange={setEditorTab}
              sections={[
                { id: "update", label: "Update" },
                {
                  id: "time",
                  label: `Working time${input.content.timeEntries?.length ? ` (${input.content.timeEntries.length})` : ""}`,
                },
                {
                  id: "resources",
                  label: `Links & resources${input.content.resources?.length ? ` (${input.content.resources.length})` : ""}`,
                },
              ]}
            />
            <fieldset disabled={busy} className={styles.editorFields}>
              <div
                className={styles.full}
                role="tabpanel"
                id={`${editorTabsId}-panel-${editorTab}`}
                aria-labelledby={`${editorTabsId}-tab-${editorTab}`}
              >
                {editorTab === "time" ? (
                  <ReportTimeFields input={input} onChange={setInput} />
                ) : editorTab === "resources" ? (
                  <ReportResourceFields input={input} onChange={setInput} />
                ) : (
                  <div className={styles.editorFields}>
                    {!initial.record && (
                      <label className={styles.full}>
                        Template
                        <select
                          value={input.content.templateId ?? ""}
                          onChange={(e) =>
                            setInput((current) => ({
                              ...current,
                              content: {
                                ...current.content,
                                templateId: e.target.value || undefined,
                              },
                            }))
                          }
                        >
                          <option value="">
                            Blank {reportKindLabels[input.kind].toLowerCase()}
                          </option>
                          {reportTemplates
                            .filter((t) => t.kind === input.kind)
                            .map((template) => (
                              <option key={template.id} value={template.id}>
                                {template.name}
                              </option>
                            ))}
                        </select>
                        <span className={styles.hint}>
                          Templates guide your update. Changing this choice
                          keeps everything you have written.
                        </span>
                      </label>
                    )}
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
                      Quick dates use {timezone}. Start and end dates are
                      included.
                    </p>
                    <label className={styles.full}>
                      Sprint or work context{" "}
                      <span className={styles.optional}>
                        (optional context)
                      </span>
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
                    <label className={styles.full}>
                      Progress percentage · Optional
                      <input
                        aria-label="Progress percentage"
                        type="number"
                        min={0}
                        max={100}
                        value={input.content.progressPercent ?? ""}
                        onChange={(e) =>
                          setInput((current) => ({
                            ...current,
                            content: {
                              ...current.content,
                              progressPercent:
                                e.target.value === ""
                                  ? undefined
                                  : Number(e.target.value),
                            },
                          }))
                        }
                      />
                      <span className={styles.hint}>
                        Your reported progress for this work; task status is
                        managed separately.
                      </span>
                    </label>
                    {(input.kind === "plan" ? planFields : reportFields).map(
                      (field) => (
                        <label key={field} className={styles.full}>
                          {contentLabels[field]}
                          <span className={styles.hint}>
                            {reportTemplateHints[
                              input.content.templateId ?? ""
                            ]?.[field] ?? hints[field]}
                          </span>
                          <textarea
                            rows={
                              field === "completed" ||
                              field === "goals" ||
                              field === "nextSteps"
                                ? 4
                                : 3
                            }
                            maxLength={4000}
                            value={input.content[field] ?? ""}
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
                            {(input.content[field] ?? "").length}/4,000
                          </span>
                        </label>
                      ),
                    )}
                  </div>
                )}
              </div>
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
