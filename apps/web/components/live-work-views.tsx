"use client";

import type {
  AttentionSignalDto,
  BoardDto,
  InboxItemDto,
  WaitingStateDto,
  WeeklyReviewRecordDto,
  WorkItemDto,
  WorkspaceSnapshotDto,
} from "@founderhq/api-contract";
import {
  Bot,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileArchive,
  FileQuestion,
  Inbox,
  LayoutList,
  PlugZap,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppData } from "@/lib/live-app-data";
import { presentLiveError } from "@/lib/live-errors";
import {
  formatLiveDate,
  formatLiveDateOnly,
  isLiveDraftEnvelope,
  liveDraftStorageKey,
  workItemStatusLabel,
  type LiveDraftEnvelope,
} from "@/lib/live-workflow-ui";
import { workspaceHref, type WorkspaceView } from "@/lib/workspace-routes";
import { InboxExperience } from "./email-inbox-workflow";
import { LiveStateNotice } from "./live-state";
import { LiveWorkspaceSettings } from "./live-workspace-settings";
import { WorkspaceFrame } from "./workspace-frame";
import styles from "./live-operating-loop.module.css";

export type LiveWorkViewKind = Extract<
  WorkspaceView,
  | "attention"
  | "my-work"
  | "inbox"
  | "decisions"
  | "approvals"
  | "reviews"
  | "waiting"
  | "search"
  | "messages"
  | "teams"
  | "ideas"
  | "blueprints"
  | "notifications"
  | "settings"
>;

const viewCopy: Record<
  LiveWorkViewKind,
  {
    title: string;
    subtitle: string;
    active: Parameters<typeof WorkspaceFrame>[0]["active"];
  }
> = {
  attention: {
    title: "Attention",
    subtitle: "Deterministic signals with source evidence and reason codes.",
    active: "attention",
  },
  "my-work": {
    title: "My Work",
    subtitle: "Canonical WorkItems assigned to your application identity.",
    active: "myWork",
  },
  inbox: {
    title: "Inbox",
    subtitle:
      "Email preview, actionable requests, and durable capture in one workspace Inbox.",
    active: "inbox",
  },
  decisions: {
    title: "Decisions",
    subtitle: "Record the decision, rationale, and evidence together.",
    active: "decisions",
  },
  approvals: {
    title: "Approvals",
    subtitle: "Durable review outcomes with accountable rationale.",
    active: "approvals",
  },
  reviews: {
    title: "Weekly Review",
    subtitle: "Publish durable progress and a comparable workspace snapshot.",
    active: "reviews",
  },
  waiting: {
    title: "Waiting",
    subtitle: "Follow-ups tied to the same canonical work identity.",
    active: "waiting",
  },
  search: {
    title: "Search",
    subtitle: "Tenant-scoped search across durable workspaces and WorkItems.",
    active: "search",
  },
  messages: {
    title: "Messages",
    subtitle: "Messaging is outside the Phase 3 founder operating loop.",
    active: "messages",
  },
  teams: {
    title: "Teams",
    subtitle: "Team management is outside the Phase 3 founder operating loop.",
    active: "teams",
  },
  ideas: {
    title: "Ideas",
    subtitle: "Use an Idea WorkItem until a dedicated live surface is ready.",
    active: "ideas",
  },
  blueprints: {
    title: "Blueprints",
    subtitle:
      "Blueprint execution is outside the Phase 3 founder operating loop.",
    active: "templates",
  },
  notifications: {
    title: "Notifications",
    subtitle: "External notification delivery is not enabled in this phase.",
    active: "notifications",
  },
  settings: {
    title: "Workspace Settings",
    subtitle:
      "Manage the canonical Workspace identity and operating configuration.",
    active: "settings",
  },
};

const supportedViews = new Set<LiveWorkViewKind>([
  "attention",
  "my-work",
  "inbox",
  "decisions",
  "approvals",
  "reviews",
  "waiting",
  "search",
]);

export function LiveWorkView({
  workspaceSlug,
  view,
}: {
  workspaceSlug: string;
  view: LiveWorkViewKind;
}) {
  const session = useAppSession();
  const liveData = useLiveAppData();
  const workspace = liveData.workspaces.find(
    (record) => record.slug === workspaceSlug,
  );
  const copy = viewCopy[view];

  if (!workspace) {
    return (
      <WorkspaceFrame active={copy.active}>
        <main className={styles.main}>
          <LiveStateNotice
            actions={<Link href="/app/portfolio">Return to Portfolio</Link>}
            description="The workspace may have been removed or your membership may have changed."
            kind="permission-loss"
            title="Workspace not available"
          />
        </main>
      </WorkspaceFrame>
    );
  }

  const items = liveData.items.filter(
    (item) => item.workspaceId === workspace.id,
  );
  return (
    <WorkspaceFrame active={copy.active} workspaceSlug={workspaceSlug}>
      <main
        className={styles.main}
        data-testid={`live-${view.replaceAll("-", "-")}`}
      >
        <header className={styles.hero}>
          <div>
            <p>Workspace · {workspace.name}</p>
            <h1>{copy.title}</h1>
            <span>{copy.subtitle}</span>
          </div>
          <small>
            Last synced{" "}
            {formatLiveDate(
              liveData.refreshedAt,
              session.organization.timezone ?? "UTC",
            )}
          </small>
        </header>
        {liveData.stale ? (
          <LiveStateNotice
            actions={
              <button onClick={() => void liveData.refresh()} type="button">
                Refresh
              </button>
            }
            description="Last-known data remains visible with its sync timestamp."
            kind="stale"
            lastSyncedAt={liveData.refreshedAt}
            title="This view may be stale"
          />
        ) : null}
        {view === "settings" ? (
          <>
            <LiveWorkspaceSettings workspace={workspace} />
            <PrivateBetaSettingsStatus />
          </>
        ) : !supportedViews.has(view) ? (
          <UnavailableLiveSurface
            title={copy.title}
            workspaceSlug={workspaceSlug}
          />
        ) : view === "inbox" ? (
          <InboxExperience
            capturedWork={
              <LiveInbox
                workspaceId={workspace.id}
                workspaceSlug={workspaceSlug}
              />
            }
            initialArea="email"
          />
        ) : view === "my-work" ? (
          <LiveMyWork items={items} workspaceSlug={workspaceSlug} />
        ) : view === "attention" ? (
          <LiveAttention
            signals={liveData.attention.filter(
              (signal) => signal.workspaceId === workspace.id,
            )}
          />
        ) : view === "waiting" ? (
          <LiveWaiting
            records={liveData.waiting.filter(
              (record) => record.workspaceId === workspace.id,
            )}
          />
        ) : view === "decisions" ? (
          <LiveTransitions
            items={items.filter((item) => item.type === "decision")}
            kind="decision"
            workspaceId={workspace.id}
          />
        ) : view === "approvals" ? (
          <LiveTransitions
            items={items.filter((item) => item.type === "approval")}
            kind="approval"
            workspaceId={workspace.id}
          />
        ) : view === "reviews" ? (
          <LiveWeeklyReview workspaceId={workspace.id} />
        ) : view === "search" ? (
          <LiveSearch
            workspaceId={workspace.id}
            workspaceSlug={workspaceSlug}
          />
        ) : null}
      </main>
    </WorkspaceFrame>
  );
}

const privateBetaFoundationStatus = [
  {
    icon: PlugZap,
    title: "External integrations",
    status: "Disabled · no pilot approval",
    description:
      "No production OAuth credential, webhook, synchronization, or provider write is active. There is no provider connection to recover or revoke.",
  },
  {
    icon: FileArchive,
    title: "Import and private files",
    status: "Disabled · workflow not approved",
    description:
      "Live CSV import and uploads are unavailable. TREVV stores no uploaded file and issues no signed download URL.",
  },
  {
    icon: Bot,
    title: "Automation and AI",
    status: "Disabled · no runtime adapter",
    description:
      "No model or external-effect executor is configured. Deterministic product rules remain internal.",
  },
  {
    icon: CreditCard,
    title: "Billing",
    status: "Disabled · pricing unapproved",
    description:
      "No commercial price, checkout, payment method, subscription webhook, or paid entitlement is active.",
  },
] as const;

function PrivateBetaSettingsStatus() {
  return (
    <section
      className={styles.panel}
      aria-labelledby="private-beta-foundations-title"
      data-testid="private-beta-foundations"
    >
      <header>
        <div>
          <p>Evidence-gated capabilities</p>
          <h2 id="private-beta-foundations-title">
            Private-beta safety status
          </h2>
        </div>
        <span className={styles.foundationStatus}>
          External capabilities unavailable
        </span>
      </header>
      <div className={styles.foundationGrid}>
        {privateBetaFoundationStatus.map((item) => {
          const Icon = item.icon;
          return (
            <article className={styles.foundationCard} key={item.title}>
              <span className={styles.rowIcon} aria-hidden="true">
                <Icon size={17} />
              </span>
              <div>
                <span className={styles.foundationStatus}>{item.status}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            </article>
          );
        })}
      </div>
      <div className={styles.foundationLinks}>
        <ShieldCheck size={17} aria-hidden="true" />
        <span>Account and data controls remain available independently.</span>
        <Link href="/app/account/sessions">Sessions</Link>
        <Link href="/app/account/privacy">Privacy center</Link>
        <Link href="/terms">Terms</Link>
      </div>
    </section>
  );
}

function UnavailableLiveSurface({
  title,
  workspaceSlug,
}: {
  title: string;
  workspaceSlug: string;
}) {
  return (
    <LiveStateNotice
      actions={
        <Link href={workspaceHref(workspaceSlug, "my-work")}>Open My Work</Link>
      }
      description={`${title} is intentionally unavailable in live mode until its repository, authorization, and recovery behavior are complete. No local demo substitute is shown.`}
      kind="empty"
      title="Not available in this private-alpha foundation"
    />
  );
}

function LiveInbox({
  workspaceId,
  workspaceSlug,
}: {
  workspaceId: string;
  workspaceSlug: string;
}) {
  const session = useAppSession();
  const liveData = useLiveAppData();
  const [records, setRecords] = useState<InboxItemDto[]>([]);
  const [boards, setBoards] = useState<BoardDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [selectedBoards, setSelectedBoards] = useState<Record<string, string>>(
    {},
  );
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    undo?: { id: string; version: number };
  } | null>(null);
  const [conflict, setConflict] = useState<{
    id: string;
    operation: "done" | "undo" | "convert";
    error: unknown;
  } | null>(null);
  const retryKeys = useRef(new Map<string, string>());

  useEffect(() => {
    let active = true;
    Promise.all([liveData.client.inbox(), liveData.client.boards(workspaceId)])
      .then(([nextRecords, nextBoards]) => {
        if (!active) return;
        setRecords(nextRecords);
        setBoards(nextBoards);
        setSelectedBoards(
          Object.fromEntries(
            nextRecords.map((record) => [
              record.id,
              resourceString(record.resource, "suggestedBoardId") ??
                nextBoards[0]?.id ??
                "",
            ]),
          ),
        );
      })
      .catch((reason: unknown) => {
        if (active) setError(reason);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [liveData.client, workspaceId]);

  const visible = records.filter((record) => {
    const suggested = resourceString(record.resource, "suggestedWorkspaceId");
    return !suggested || suggested === workspaceId;
  });

  function replaceRecord(next: InboxItemDto) {
    setRecords((current) =>
      current.map((record) => (record.id === next.id ? next : record)),
    );
  }

  async function markDone(record: InboxItemDto) {
    const fingerprint = `inbox-done:${record.id}:${record.version}`;
    setPendingId(record.id);
    setError(null);
    setConflict(null);
    try {
      const response = await liveData.client.updateInboxItem(
        record.id,
        { done: true },
        record.version,
        retainedKey(retryKeys.current, fingerprint),
      );
      retryKeys.current.delete(fingerprint);
      replaceRecord(response.data);
      setConfirmation({
        title: `Server confirmed “${response.data.title}” as done`,
        description: `Inbox version ${response.data.version} is canonical.`,
        undo: { id: response.data.id, version: response.data.version },
      });
    } catch (reason) {
      if (presentLiveError(reason).kind === "version-conflict") {
        setConflict({ id: record.id, operation: "done", error: reason });
      } else setError(reason);
    } finally {
      setPendingId(null);
    }
  }

  async function undoDone() {
    const undo = confirmation?.undo;
    if (!undo) return;
    const record = records.find((candidate) => candidate.id === undo.id);
    if (!record) return;
    await undoRecord({ ...record, version: undo.version });
  }

  async function undoRecord(record: InboxItemDto) {
    const fingerprint = `inbox-undo:${record.id}:${record.version}`;
    setPendingId(record.id);
    setError(null);
    setConflict(null);
    try {
      const response = await liveData.client.updateInboxItem(
        record.id,
        { done: false },
        record.version,
        retainedKey(retryKeys.current, fingerprint),
      );
      retryKeys.current.delete(fingerprint);
      replaceRecord(response.data);
      setConfirmation({
        title: `Server confirmed undo for “${response.data.title}”`,
        description: `Inbox version ${response.data.version} is canonical and active again.`,
      });
    } catch (reason) {
      if (presentLiveError(reason).kind === "version-conflict") {
        setConflict({ id: record.id, operation: "undo", error: reason });
      } else setError(reason);
    } finally {
      setPendingId(null);
    }
  }

  async function convert(record: InboxItemDto) {
    const boardId = selectedBoards[record.id];
    if (!boardId) return;
    const fingerprint = `inbox-convert:${record.id}:${record.version}:${boardId}`;
    setPendingId(record.id);
    setError(null);
    setConflict(null);
    try {
      const type = captureType(record.category);
      const response = await liveData.client.convertInboxItem(
        record.id,
        {
          workspaceId,
          boardId,
          title: record.title,
          description: record.body,
          type,
          priority: capturePriority(
            resourceString(record.resource, "priority"),
          ),
          status: "not_started",
          assigneeIds: [],
          ...(resourceString(record.resource, "dueDate")
            ? { dueDate: resourceString(record.resource, "dueDate")! }
            : {}),
          ...(type === "decision" ? { decisionState: "needed" } : {}),
          ...(type === "approval" ? { approvalState: "pending" } : {}),
        },
        record.version,
        retainedKey(retryKeys.current, fingerprint),
      );
      retryKeys.current.delete(fingerprint);
      replaceRecord(response.data.inboxItem);
      setConfirmation({
        title: `Server confirmed conversion of “${record.title}”`,
        description: `Canonical WorkItem ${response.data.workItem.id} now links back to Inbox record ${record.id}.`,
      });
      await liveData.refresh();
    } catch (reason) {
      if (presentLiveError(reason).kind === "version-conflict") {
        setConflict({ id: record.id, operation: "convert", error: reason });
      } else setError(reason);
    } finally {
      setPendingId(null);
    }
  }

  const presented = error ? presentLiveError(error) : null;
  async function loadLatestInboxRecord(reapply: boolean) {
    if (!conflict) return;
    const latestRecords = await liveData.client.inbox();
    const latest = latestRecords.find((record) => record.id === conflict.id);
    if (!latest) {
      setConflict(null);
      setError(new Error("The Inbox record is no longer available."));
      return;
    }
    setRecords(latestRecords);
    const operation = conflict.operation;
    setConflict(null);
    setError(null);
    if (!reapply) {
      setConfirmation({
        title: "Loaded the latest Inbox version",
        description: `Version ${latest.version} is visible. The conflicting action was not applied.`,
      });
      return;
    }
    if (operation === "done") await markDone(latest);
    else if (operation === "undo") await undoRecord(latest);
    else if (!latest.convertedItemId) await convert(latest);
  }
  return (
    <section className={styles.panel} aria-labelledby="live-inbox-title">
      <header>
        <div>
          <p>User-scoped durable capture</p>
          <h2 id="live-inbox-title">Captured work</h2>
        </div>
        <span>Press Q anywhere to capture</span>
      </header>
      {presented ? (
        <LiveStateNotice
          description={presented.description}
          kind={presented.kind}
          title={presented.title}
        />
      ) : null}
      {conflict ? (
        <LiveStateNotice
          actions={
            <>
              <button
                onClick={() => void loadLatestInboxRecord(false)}
                type="button"
              >
                Load latest
              </button>
              <button
                onClick={() => void loadLatestInboxRecord(true)}
                type="button"
              >
                Reapply to latest
              </button>
            </>
          }
          description={presentLiveError(conflict.error).description}
          kind="version-conflict"
          title="Choose how to handle the newer Inbox record"
        />
      ) : null}
      {confirmation ? (
        <LiveStateNotice
          actions={
            confirmation.undo ? (
              <button
                data-testid="inbox-undo"
                disabled={Boolean(pendingId)}
                onClick={() => void undoDone()}
                type="button"
              >
                Undo on server
              </button>
            ) : undefined
          }
          description={confirmation.description}
          kind="saved"
          title={confirmation.title}
        />
      ) : null}
      {loading ? (
        <LiveStateNotice kind="loading" title="Loading Inbox" />
      ) : visible.length === 0 ? (
        <LiveStateNotice
          description="Use Quick Capture to add the next thought without losing context."
          kind="empty"
          title="Inbox is clear"
        />
      ) : (
        <div className={styles.stack}>
          {visible.map((record) => (
            <article
              className={styles.inboxCard}
              data-testid={`inbox-item-${record.id}`}
              key={record.id}
            >
              <span className={styles.rowIcon}>
                <Inbox size={16} />
              </span>
              <div>
                <p>
                  {record.category} · v{record.version}
                </p>
                <h3>{record.title}</h3>
                {record.body ? <span>{record.body}</span> : null}
                {record.convertedItemId ? (
                  <small>Converted to WorkItem {record.convertedItemId}</small>
                ) : record.doneAt ? (
                  <small>
                    Done{" "}
                    {formatLiveDate(
                      record.doneAt,
                      session.organization.timezone ?? "UTC",
                    )}
                  </small>
                ) : null}
              </div>
              {!record.convertedItemId && !record.doneAt ? (
                <div className={styles.rowActions}>
                  <label>
                    <span className="sr-only">Board for {record.title}</span>
                    <select
                      aria-label={`Board for ${record.title}`}
                      onChange={(event) =>
                        setSelectedBoards((current) => ({
                          ...current,
                          [record.id]: event.target.value,
                        }))
                      }
                      value={selectedBoards[record.id] ?? ""}
                    >
                      {boards.length === 0 ? (
                        <option value="">Create a board first</option>
                      ) : null}
                      {boards.map((board) => (
                        <option key={board.id} value={board.id}>
                          {board.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    disabled={
                      pendingId === record.id || !selectedBoards[record.id]
                    }
                    onClick={() => void convert(record)}
                    type="button"
                  >
                    <LayoutList size={14} /> Convert to WorkItem
                  </button>
                  <button
                    disabled={pendingId === record.id}
                    onClick={() => void markDone(record)}
                    type="button"
                  >
                    <CheckCircle2 size={14} /> Mark done
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
      {boards.length === 0 && !loading ? (
        <LiveStateNotice
          actions={
            <Link href={workspaceHref(workspaceSlug)}>Create a board</Link>
          }
          description="Captures remain durable, but conversion needs a board in this workspace."
          kind="validation"
          title="A destination board is required"
        />
      ) : null}
    </section>
  );
}

function LiveMyWork({
  items,
  workspaceSlug,
}: {
  items: WorkItemDto[];
  workspaceSlug: string;
}) {
  const session = useAppSession();
  const liveData = useLiveAppData();
  const [localItems, setLocalItems] = useState(items);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<ReactNode>(null);
  const [conflict, setConflict] = useState<{
    itemId: string;
    status: WorkItemDto["status"];
    error: unknown;
  } | null>(null);
  const retryKeys = useRef(new Map<string, string>());
  const mine = localItems.filter(
    (item) =>
      item.status !== "done" &&
      item.assignees.some((assignee) => assignee.id === session.user.id),
  );

  useEffect(() => {
    if (pendingId) return;
    const timer = window.setTimeout(() => setLocalItems(items), 0);
    return () => window.clearTimeout(timer);
  }, [items, pendingId]);

  async function changeStatus(
    item: WorkItemDto,
    status: WorkItemDto["status"],
  ) {
    const fingerprint = `status:${item.id}:${item.version}:${status}`;
    const previous = item;
    setLocalItems((current) =>
      current.map((record) =>
        record.id === item.id
          ? { ...record, status, updatedAt: new Date().toISOString() }
          : record,
      ),
    );
    setPendingId(item.id);
    setNotice(null);
    setConflict(null);
    try {
      const response = await liveData.client.updateItem(
        item.id,
        { status },
        item.version,
        retainedKey(retryKeys.current, fingerprint),
      );
      retryKeys.current.delete(fingerprint);
      setLocalItems((current) =>
        current.map((record) =>
          record.id === response.data.id ? response.data : record,
        ),
      );
      setNotice(
        <LiveStateNotice
          description={`Version ${response.data.version} is canonical.`}
          kind="saved"
          title={`Server confirmed “${response.data.title}”`}
        />,
      );
      await liveData.refresh();
    } catch (reason) {
      setLocalItems((current) =>
        current.map((record) =>
          record.id === previous.id ? previous : record,
        ),
      );
      const presented = presentLiveError(reason);
      if (presented.kind === "version-conflict") {
        setConflict({ itemId: item.id, status, error: reason });
      }
      setNotice(
        <LiveStateNotice
          description={presented.description}
          kind={presented.kind}
          title={presented.title}
        />,
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="my-work-title">
      <header>
        <div>
          <p>{session.user.name}</p>
          <h2 id="my-work-title">Assigned WorkItems</h2>
        </div>
      </header>
      {notice}
      {conflict ? (
        <LiveStateNotice
          actions={
            <>
              <button
                onClick={() =>
                  void (async () => {
                    const latest = await liveData.client.item(conflict.itemId);
                    setLocalItems((current) =>
                      current.map((item) =>
                        item.id === latest.id ? latest : item,
                      ),
                    );
                    setConflict(null);
                  })()
                }
                type="button"
              >
                Load latest
              </button>
              <button
                onClick={() =>
                  void (async () => {
                    const latest = await liveData.client.item(conflict.itemId);
                    setConflict(null);
                    await changeStatus(latest, conflict.status);
                  })()
                }
                type="button"
              >
                Reapply to latest
              </button>
            </>
          }
          description={presentLiveError(conflict.error).description}
          kind="version-conflict"
          title="Choose how to handle the newer WorkItem"
        />
      ) : null}
      {mine.length === 0 ? (
        <LiveStateNotice
          actions={<Link href={workspaceHref(workspaceSlug)}>Open boards</Link>}
          description="Assign a WorkItem to yourself from its board details."
          kind="empty"
          title="Nothing is assigned to you"
        />
      ) : (
        <div className={styles.itemTable} role="list">
          {mine.map((item) => (
            <article className={styles.itemRow} key={item.id} role="listitem">
              <Link
                className={styles.itemTitle}
                href={`${workspaceHref(workspaceSlug)}/boards/${encodeURIComponent(item.boardId)}#${encodeURIComponent(item.id)}`}
              >
                <span className={styles.typePill}>{item.type}</span>
                <strong>{item.title}</strong>
                <small>v{item.version}</small>
              </Link>
              <select
                aria-label={`Status for ${item.title}`}
                disabled={
                  pendingId === item.id ||
                  item.status === "blocked" ||
                  item.status === "done"
                }
                onChange={(event) =>
                  void changeStatus(
                    item,
                    event.target.value as WorkItemDto["status"],
                  )
                }
                value={item.status}
              >
                {editableStatusOptions(item.status).map((status) => (
                  <option key={status} value={status}>
                    {workItemStatusLabel(status)}
                  </option>
                ))}
              </select>
              <span className={styles.priority}>{item.priority}</span>
              <span>{pendingId === item.id ? "Saving…" : "Server synced"}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function LiveAttention({ signals }: { signals: AttentionSignalDto[] }) {
  const session = useAppSession();
  const liveData = useLiveAppData();
  const [records, setRecords] = useState(signals);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<ReactNode>(null);
  const [conflict, setConflict] = useState<{
    signalId: string;
    input: {
      action: "resolve" | "dismiss" | "snooze";
      reason?: string;
      snoozedUntil?: string;
    };
    error: unknown;
  } | null>(null);
  const retryKeys = useRef(new Map<string, string>());
  const active = records.filter(
    (signal) => !signal.resolvedAt && !signal.dismissedAt,
  );

  useEffect(() => {
    if (pendingId) return;
    const timer = window.setTimeout(() => setRecords(signals), 0);
    return () => window.clearTimeout(timer);
  }, [pendingId, signals]);

  async function act(
    signal: AttentionSignalDto,
    action: "resolve" | "dismiss" | "snooze",
  ) {
    const reason =
      action === "resolve"
        ? undefined
        : window
            .prompt(
              action === "dismiss"
                ? "Why is this signal not actionable?"
                : "Why should this signal be snoozed?",
            )
            ?.trim();
    if (action !== "resolve" && !reason) return;
    const input = {
      action,
      ...(reason ? { reason } : {}),
      ...(action === "snooze"
        ? {
            snoozedUntil: new Date(
              Date.parse(liveData.refreshedAt) + 86_400_000,
            ).toISOString(),
          }
        : {}),
    };
    await performAttentionAction(signal, input);
  }

  async function performAttentionAction(
    signal: AttentionSignalDto,
    input: {
      action: "resolve" | "dismiss" | "snooze";
      reason?: string;
      snoozedUntil?: string;
    },
  ) {
    const fingerprint = `attention:${signal.id}:${signal.version}:${JSON.stringify(input)}`;
    setPendingId(signal.id);
    setNotice(null);
    setConflict(null);
    try {
      const response = await liveData.client.actOnAttention(
        signal.id,
        input,
        signal.version,
        retainedKey(retryKeys.current, fingerprint),
      );
      retryKeys.current.delete(fingerprint);
      setRecords((current) =>
        current.map((record) =>
          record.id === response.data.id ? response.data : record,
        ),
      );
      setNotice(
        <LiveStateNotice
          description={`Signal version ${response.data.version} is canonical. This action has no safe inverse in the domain, so Undo is intentionally not offered.`}
          kind="saved"
          title={`Server confirmed ${input.action}`}
        />,
      );
      await liveData.refresh();
    } catch (reason) {
      const presented = presentLiveError(reason);
      if (presented.kind === "version-conflict") {
        setConflict({ signalId: signal.id, input, error: reason });
      } else {
        setNotice(
          <LiveStateNotice
            description={presented.description}
            kind={presented.kind}
            title={presented.title}
          />,
        );
      }
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="attention-signals-title">
      <header>
        <div>
          <p>Computed from canonical records</p>
          <h2 id="attention-signals-title">Open signals</h2>
        </div>
        <span>{active.length} active</span>
      </header>
      {notice}
      {conflict ? (
        <LiveStateNotice
          actions={
            <>
              <button
                onClick={() =>
                  void (async () => {
                    const latest = (await liveData.client.attention()).find(
                      (signal) => signal.id === conflict.signalId,
                    );
                    if (latest) {
                      setRecords((current) =>
                        current.map((signal) =>
                          signal.id === latest.id ? latest : signal,
                        ),
                      );
                    }
                    setConflict(null);
                  })()
                }
                type="button"
              >
                Load latest
              </button>
              <button
                onClick={() =>
                  void (async () => {
                    const current = conflict;
                    const latest = (await liveData.client.attention()).find(
                      (signal) => signal.id === current.signalId,
                    );
                    if (latest)
                      await performAttentionAction(latest, current.input);
                  })()
                }
                type="button"
              >
                Reapply to latest
              </button>
            </>
          }
          description={presentLiveError(conflict.error).description}
          kind="version-conflict"
          title="Choose how to handle the recomputed signal"
        />
      ) : null}
      {active.length === 0 ? (
        <LiveStateNotice
          description="The worker found no unresolved deterministic signals."
          kind="empty"
          title="Nothing needs attention"
        />
      ) : (
        <div className={styles.stack}>
          {active.map((signal) => (
            <article
              className={styles.signalCard}
              data-severity={signal.severity}
              data-testid={`attention-signal-${signal.id}`}
              key={signal.id}
            >
              <span className={styles.rowIcon}>
                <Sparkles size={16} />
              </span>
              <div>
                <p>
                  {signal.severity} · {signal.reasonCode}
                </p>
                <h3>{signal.reason}</h3>
                {signal.recommendedAction ? (
                  <span>{signal.recommendedAction}</span>
                ) : null}
                <ul>
                  {signal.sourceEvidence.map((source) => (
                    <li key={`${source.sourceType}:${source.sourceId}`}>
                      <strong>{source.sourceType}</strong> {source.sourceId}
                      {source.summary ? ` · ${source.summary}` : ""}
                      <small>
                        {formatLiveDate(
                          source.capturedAt,
                          session.organization.timezone ?? "UTC",
                        )}
                      </small>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={styles.rowActions}>
                <button
                  disabled={pendingId === signal.id}
                  onClick={() => void act(signal, "resolve")}
                  type="button"
                >
                  Resolve
                </button>
                <button
                  disabled={pendingId === signal.id}
                  onClick={() => void act(signal, "snooze")}
                  type="button"
                >
                  Snooze 24h
                </button>
                <button
                  disabled={pendingId === signal.id}
                  onClick={() => void act(signal, "dismiss")}
                  type="button"
                >
                  Dismiss
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function LiveWaiting({ records: source }: { records: WaitingStateDto[] }) {
  const session = useAppSession();
  const liveData = useLiveAppData();
  const [records, setRecords] = useState(source);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<ReactNode>(null);
  const [conflict, setConflict] = useState<{
    recordId: string;
    input: {
      action: "resolve" | "nudge" | "reschedule";
      note?: string;
      nextFollowUp?: string;
    };
    error: unknown;
  } | null>(null);
  const retryKeys = useRef(new Map<string, string>());
  const active = records.filter((record) => !record.resolvedAt);

  useEffect(() => {
    if (pendingId) return;
    const timer = window.setTimeout(() => setRecords(source), 0);
    return () => window.clearTimeout(timer);
  }, [pendingId, source]);

  async function act(
    record: WaitingStateDto,
    action: "resolve" | "nudge" | "reschedule",
  ) {
    const note = window
      .prompt(
        action === "nudge"
          ? "Record the follow-up that was sent"
          : action === "resolve"
            ? "Record how the wait was resolved"
            : "Why is the follow-up moving?",
      )
      ?.trim();
    if (note === undefined) return;
    const nextFollowUp =
      action === "reschedule"
        ? window.prompt("New follow-up date (YYYY-MM-DD)")?.trim()
        : undefined;
    if (action === "reschedule" && !nextFollowUp) return;
    const input = {
      action,
      ...(note ? { note } : {}),
      ...(nextFollowUp ? { nextFollowUp } : {}),
    };
    await performWaitingAction(record, input);
  }

  async function performWaitingAction(
    record: WaitingStateDto,
    input: {
      action: "resolve" | "nudge" | "reschedule";
      note?: string;
      nextFollowUp?: string;
    },
  ) {
    const fingerprint = `waiting:${record.id}:${record.version}:${JSON.stringify(input)}`;
    setPendingId(record.id);
    setNotice(null);
    setConflict(null);
    try {
      const response = await liveData.client.actOnWaiting(
        record.id,
        input,
        record.version,
        retainedKey(retryKeys.current, fingerprint),
      );
      retryKeys.current.delete(fingerprint);
      setRecords((current) =>
        current.map((candidate) =>
          candidate.id === response.data.id ? response.data : candidate,
        ),
      );
      setNotice(
        <LiveStateNotice
          description={`Waiting version ${response.data.version} is canonical. ${input.action === "resolve" ? "Resolution has no safe reopen transition, so Undo is not offered." : "The follow-up history remains durable."}`}
          kind="saved"
          title={`Server confirmed ${input.action}`}
        />,
      );
      await liveData.refresh();
    } catch (reason) {
      const presented = presentLiveError(reason);
      if (presented.kind === "version-conflict") {
        setConflict({ recordId: record.id, input, error: reason });
      } else {
        setNotice(
          <LiveStateNotice
            description={presented.description}
            kind={presented.kind}
            title={presented.title}
          />,
        );
      }
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="waiting-records-title">
      <header>
        <div>
          <p>Durable follow-up ownership</p>
          <h2 id="waiting-records-title">Active waits</h2>
        </div>
      </header>
      {notice}
      {conflict ? (
        <LiveStateNotice
          actions={
            <>
              <button
                onClick={() =>
                  void (async () => {
                    const latest = (await liveData.client.waiting()).find(
                      (record) => record.id === conflict.recordId,
                    );
                    if (latest) {
                      setRecords((current) =>
                        current.map((record) =>
                          record.id === latest.id ? latest : record,
                        ),
                      );
                    }
                    setConflict(null);
                  })()
                }
                type="button"
              >
                Load latest
              </button>
              <button
                onClick={() =>
                  void (async () => {
                    const current = conflict;
                    const latest = (await liveData.client.waiting()).find(
                      (record) => record.id === current.recordId,
                    );
                    if (latest)
                      await performWaitingAction(latest, current.input);
                  })()
                }
                type="button"
              >
                Reapply to latest
              </button>
            </>
          }
          description={presentLiveError(conflict.error).description}
          kind="version-conflict"
          title="Choose how to handle the newer Waiting record"
        />
      ) : null}
      {active.length === 0 ? (
        <LiveStateNotice
          description="No canonical work is waiting on a dependency."
          kind="empty"
          title="Waiting is clear"
        />
      ) : (
        <div className={styles.stack}>
          {active.map((record) => (
            <article
              className={styles.waitingCard}
              data-testid={`waiting-record-${record.id}`}
              key={record.id}
            >
              <span className={styles.rowIcon}>
                <Clock3 size={16} />
              </span>
              <div>
                <p>
                  {record.waitingType.replaceAll("_", " ")} · v{record.version}
                </p>
                <h3>{record.title}</h3>
                <span>
                  {record.waitingLabel ||
                    record.waitingNote ||
                    "No waiting note"}
                </span>
                <small>
                  Waiting since{" "}
                  {formatLiveDateOnly(
                    record.waitingSince,
                    session.organization.timezone ?? "UTC",
                  )}
                  {record.nextFollowUp
                    ? ` · Follow up ${formatLiveDateOnly(record.nextFollowUp, session.organization.timezone ?? "UTC")}`
                    : ""}
                </small>
              </div>
              <div className={styles.rowActions}>
                <button
                  data-testid={`waiting-nudge-${record.id}`}
                  disabled={pendingId === record.id}
                  onClick={() => void act(record, "nudge")}
                  type="button"
                >
                  Nudge
                </button>
                <button
                  data-testid={`waiting-reschedule-${record.id}`}
                  disabled={pendingId === record.id}
                  onClick={() => void act(record, "reschedule")}
                  type="button"
                >
                  Reschedule
                </button>
                <button
                  data-testid={`waiting-resolve-${record.id}`}
                  disabled={pendingId === record.id}
                  onClick={() => void act(record, "resolve")}
                  type="button"
                >
                  Resolve
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

interface TransitionDraft {
  state: string;
  rationale: string;
  evidence: string;
  idempotencyKey: string;
  attemptedFingerprint: string;
  attemptedVersion: number | null;
}

function LiveTransitions({
  items: source,
  kind,
  workspaceId,
}: {
  items: WorkItemDto[];
  kind: "decision" | "approval";
  workspaceId: string;
}) {
  const session = useAppSession();
  const liveData = useLiveAppData();
  const storageKey = liveDraftStorageKey({
    organizationId: session.organization.id,
    userId: session.user.id,
    scope: `${kind}-transitions:${workspaceId}`,
  });
  const [items, setItems] = useState(source);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, TransitionDraft>>({});
  const [notice, setNotice] = useState<ReactNode>(null);
  const [conflict, setConflict] = useState<{
    itemId: string;
    error: unknown;
  } | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let recovered: Record<string, TransitionDraft> | null = null;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (isLiveDraftEnvelope(parsed, isTransitionDraftMap))
          recovered = parsed.payload;
      }
    } catch {
      // Recovery is best effort; server records remain canonical.
    }
    const timer = window.setTimeout(() => {
      if (recovered) setDrafts(recovered);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    persistTransitionDrafts(storageKey, drafts);
  }, [drafts, hydrated, storageKey]);

  useEffect(() => {
    if (pendingId) return;
    const timer = window.setTimeout(() => setItems(source), 0);
    return () => window.clearTimeout(timer);
  }, [pendingId, source]);

  function editDraft(
    itemId: string,
    draft: TransitionDraft,
    patch: Partial<Pick<TransitionDraft, "state" | "rationale" | "evidence">>,
  ) {
    const next = { ...draft, ...patch };
    const changedAfterAttempt =
      Boolean(draft.attemptedFingerprint) &&
      transitionPayloadFingerprint(next) !==
        transitionPayloadFingerprint(draft);
    setDrafts((current) => ({
      ...current,
      [itemId]: {
        ...next,
        idempotencyKey:
          changedAfterAttempt || !next.idempotencyKey
            ? crypto.randomUUID()
            : next.idempotencyKey,
        ...(changedAfterAttempt
          ? { attemptedFingerprint: "", attemptedVersion: null }
          : {}),
      },
    }));
    if (changedAfterAttempt) {
      setNotice(null);
      setConflict(null);
    }
  }

  async function transition(item: WorkItemDto, reapplyToLatest = false) {
    const recovered = drafts[item.id] ?? emptyTransitionDraft(kind);
    const draft = reapplyToLatest
      ? {
          ...recovered,
          idempotencyKey: crypto.randomUUID(),
          attemptedFingerprint: "",
          attemptedVersion: null,
        }
      : recovered;
    if (!draft.rationale.trim()) return;
    const expectedVersion = draft.attemptedVersion ?? item.version;
    const fingerprint = transitionAttemptFingerprint(
      kind,
      item.id,
      expectedVersion,
      draft,
    );
    const idempotencyKey = draft.idempotencyKey || crypto.randomUUID();
    const attemptedDraft: TransitionDraft = {
      ...draft,
      idempotencyKey,
      attemptedFingerprint: fingerprint,
      attemptedVersion: expectedVersion,
    };
    const attemptedDrafts = { ...drafts, [item.id]: attemptedDraft };
    setDrafts(attemptedDrafts);
    persistTransitionDrafts(storageKey, attemptedDrafts);
    setPendingId(item.id);
    setNotice(null);
    setConflict(null);
    try {
      const response =
        kind === "decision"
          ? await liveData.client.transitionDecision(
              item.id,
              {
                state: attemptedDraft.state as NonNullable<
                  WorkItemDto["decisionState"]
                >,
                rationale: attemptedDraft.rationale,
                ...(attemptedDraft.evidence.trim()
                  ? { evidence: attemptedDraft.evidence }
                  : {}),
              },
              expectedVersion,
              idempotencyKey,
            )
          : await liveData.client.transitionApproval(
              item.id,
              {
                state: attemptedDraft.state as NonNullable<
                  WorkItemDto["approvalState"]
                >,
                rationale: attemptedDraft.rationale,
                ...(attemptedDraft.evidence.trim()
                  ? { evidence: attemptedDraft.evidence }
                  : {}),
              },
              expectedVersion,
              idempotencyKey,
            );
      setItems((current) =>
        current.map((record) =>
          record.id === response.data.item.id ? response.data.item : record,
        ),
      );
      setDrafts((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      clearTransitionDraft(storageKey, item.id);
      setNotice(
        <LiveStateNotice
          description={`Version ${response.data.item.version}, rationale${response.data.evidence ? ", and evidence" : ""} are canonical. Attention recomputation ${response.data.attentionRefreshQueued ? "is queued" : "was not required"}.`}
          kind="saved"
          title={`Server confirmed ${kind} transition`}
        />,
      );
      await liveData.refresh();
    } catch (reason) {
      const presented = presentLiveError(reason);
      if (presented.kind === "version-conflict") {
        setConflict({ itemId: item.id, error: reason });
      } else {
        setNotice(
          <LiveStateNotice
            description={`${presented.description} Your rationale, evidence, and safe retry key remain recoverable for this account and organization.`}
            kind={presented.kind}
            title={presented.title}
          />,
        );
      }
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby={`${kind}-items-title`}>
      <header>
        <div>
          <p>Canonical record + accountable rationale</p>
          <h2 id={`${kind}-items-title`}>
            {kind === "decision" ? "Decision" : "Approval"} WorkItems
          </h2>
        </div>
      </header>
      {notice}
      {conflict ? (
        <LiveStateNotice
          actions={
            <>
              <button
                onClick={() =>
                  void (async () => {
                    const latest = await liveData.client.item(conflict.itemId);
                    setItems((current) =>
                      current.map((item) =>
                        item.id === latest.id ? latest : item,
                      ),
                    );
                    setConflict(null);
                  })()
                }
                type="button"
              >
                Load latest
              </button>
              <button
                onClick={() =>
                  void (async () => {
                    const current = conflict;
                    const latest = await liveData.client.item(current.itemId);
                    setConflict(null);
                    await transition(latest, true);
                  })()
                }
                type="button"
              >
                Reapply to latest
              </button>
            </>
          }
          description={`${presentLiveError(conflict.error).description} Your rationale and evidence remain recoverable until you load or reapply the latest version.`}
          kind="version-conflict"
          title="Choose how to handle the newer WorkItem"
        />
      ) : null}
      {items.length === 0 ? (
        <LiveStateNotice
          description={`Create a ${kind} WorkItem on a board to begin.`}
          kind="empty"
          title={`No ${kind}s yet`}
        />
      ) : (
        <div className={styles.stack}>
          {items.map((item) => {
            const draft = drafts[item.id] ?? emptyTransitionDraft(kind);
            const states =
              kind === "decision"
                ? ([
                    "needed",
                    "analyzing",
                    "delegated",
                    "deferred",
                    "decided",
                  ] as const)
                : ([
                    "pending",
                    "changes_requested",
                    "approved",
                    "rejected",
                  ] as const);
            return (
              <article className={styles.transitionCard} key={item.id}>
                <span className={styles.rowIcon}>
                  {kind === "decision" ? (
                    <FileQuestion size={16} />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                </span>
                <div>
                  <p>
                    v{item.version} ·{" "}
                    {kind === "decision"
                      ? item.decisionState
                      : item.approvalState}
                  </p>
                  <h3>{item.title}</h3>
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>Outcome state</span>
                      <select
                        disabled={!hydrated || pendingId === item.id}
                        onChange={(event) =>
                          editDraft(item.id, draft, {
                            state: event.target.value,
                          })
                        }
                        value={draft.state}
                      >
                        {states.map((state) => (
                          <option key={state} value={state}>
                            {state.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>Rationale</span>
                      <textarea
                        disabled={!hydrated || pendingId === item.id}
                        maxLength={5_000}
                        onChange={(event) =>
                          editDraft(item.id, draft, {
                            rationale: event.target.value,
                          })
                        }
                        required
                        rows={2}
                        value={draft.rationale}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Evidence · Optional</span>
                      <textarea
                        disabled={!hydrated || pendingId === item.id}
                        maxLength={5_000}
                        onChange={(event) =>
                          editDraft(item.id, draft, {
                            evidence: event.target.value,
                          })
                        }
                        rows={2}
                        value={draft.evidence}
                      />
                    </label>
                  </div>
                </div>
                <button
                  data-testid={`${kind}-transition-${item.id}`}
                  disabled={
                    !hydrated ||
                    pendingId === item.id ||
                    !draft.rationale.trim()
                  }
                  onClick={() => void transition(item)}
                  type="button"
                >
                  {pendingId === item.id ? "Saving…" : "Record outcome"}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function emptyTransitionDraft(kind: "decision" | "approval"): TransitionDraft {
  return {
    state: kind === "decision" ? "decided" : "approved",
    rationale: "",
    evidence: "",
    idempotencyKey: "",
    attemptedFingerprint: "",
    attemptedVersion: null,
  };
}

function transitionPayloadFingerprint(draft: TransitionDraft) {
  return JSON.stringify({
    state: draft.state,
    rationale: draft.rationale,
    evidence: draft.evidence,
  });
}

function transitionAttemptFingerprint(
  kind: "decision" | "approval",
  itemId: string,
  expectedVersion: number,
  draft: TransitionDraft,
) {
  return JSON.stringify({
    kind,
    itemId,
    expectedVersion,
    payload: JSON.parse(transitionPayloadFingerprint(draft)) as unknown,
  });
}

function isTransitionDraftMap(
  value: unknown,
): value is Record<string, TransitionDraft> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > 500) return false;
  return entries.every(([itemId, candidate]) => {
    if (
      !itemId ||
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    )
      return false;
    const draft = candidate as Partial<TransitionDraft>;
    return (
      typeof draft.state === "string" &&
      draft.state.length <= 64 &&
      typeof draft.rationale === "string" &&
      draft.rationale.length <= 5_000 &&
      typeof draft.evidence === "string" &&
      draft.evidence.length <= 5_000 &&
      typeof draft.idempotencyKey === "string" &&
      typeof draft.attemptedFingerprint === "string" &&
      (draft.attemptedVersion === null ||
        (Number.isInteger(draft.attemptedVersion) &&
          (draft.attemptedVersion ?? -1) >= 0))
    );
  });
}

function persistTransitionDrafts(
  storageKey: string,
  drafts: Record<string, TransitionDraft>,
) {
  try {
    if (Object.keys(drafts).length === 0) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    const envelope: LiveDraftEnvelope<Record<string, TransitionDraft>> = {
      version: 1,
      idempotencyKey: crypto.randomUUID(),
      payload: drafts,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(storageKey, JSON.stringify(envelope));
  } catch {
    // In-memory input remains usable when draft storage is unavailable.
  }
}

function clearTransitionDraft(storageKey: string, itemId: string) {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return;
    const parsed: unknown = JSON.parse(stored);
    if (!isLiveDraftEnvelope(parsed, isTransitionDraftMap)) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    const next = { ...parsed.payload };
    delete next[itemId];
    persistTransitionDrafts(storageKey, next);
  } catch {
    // The acknowledged server transition is canonical even if cleanup fails.
  }
}

interface WeeklyReviewDraft {
  health: "on_track" | "watch" | "critical" | "parked";
  progress: string;
  blocker: string;
  nextMilestone: string;
  decisionNeeded: string;
  priorityNextWeek: string;
  attemptedFingerprint: string;
}

const emptyReview: WeeklyReviewDraft = {
  health: "on_track",
  progress: "",
  blocker: "None",
  nextMilestone: "",
  decisionNeeded: "",
  priorityNextWeek: "",
  attemptedFingerprint: "",
};

function LiveWeeklyReview({ workspaceId }: { workspaceId: string }) {
  const session = useAppSession();
  const liveData = useLiveAppData();
  const storageKey = liveDraftStorageKey({
    organizationId: session.organization.id,
    userId: session.user.id,
    scope: `weekly-review:${workspaceId}`,
  });
  const [draft, setDraft] = useState(emptyReview);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [reviews, setReviews] = useState<WeeklyReviewRecordDto[]>([]);
  const [snapshots, setSnapshots] = useState<WorkspaceSnapshotDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const timezone = session.organization.timezone ?? "UTC";

  useEffect(() => {
    let recovered: LiveDraftEnvelope<WeeklyReviewDraft> | null = null;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (isLiveDraftEnvelope(parsed, isWeeklyReviewDraft)) {
          recovered = parsed;
        }
      }
    } catch {
      // Draft recovery is best effort and never replaces server records.
    }
    const timer = window.setTimeout(() => {
      if (recovered) {
        setDraft(recovered.payload);
        setIdempotencyKey(recovered.idempotencyKey);
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    const envelope: LiveDraftEnvelope<WeeklyReviewDraft> = {
      version: 1,
      idempotencyKey,
      payload: draft,
      updatedAt: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(envelope));
    } catch {
      // The form remains usable without recoverable browser draft storage.
    }
  }, [draft, hydrated, idempotencyKey, storageKey]);

  useEffect(() => {
    let active = true;
    Promise.all([
      liveData.client.weeklyReviews(workspaceId),
      liveData.client.workspaceSnapshots({ workspaceId }),
    ])
      .then(([nextReviews, nextSnapshots]) => {
        if (!active) return;
        setReviews(nextReviews);
        setSnapshots(nextSnapshots);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [liveData.client, workspaceId]);

  function edit(patch: Partial<WeeklyReviewDraft>) {
    const next = { ...draft, ...patch };
    const changedAfterAttempt =
      Boolean(draft.attemptedFingerprint) &&
      weeklyReviewFingerprint(next) !== draft.attemptedFingerprint;
    setDraft({
      ...next,
      ...(changedAfterAttempt ? { attemptedFingerprint: "" } : {}),
    });
    if (error || changedAfterAttempt) {
      setError(null);
      setIdempotencyKey(crypto.randomUUID());
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hydrated || pending) return;
    const attemptedFingerprint = weeklyReviewFingerprint(draft);
    const attemptedDraft = { ...draft, attemptedFingerprint };
    setDraft(attemptedDraft);
    persistWeeklyReviewDraft(storageKey, attemptedDraft, idempotencyKey);
    setPending(true);
    setError(null);
    try {
      const response = await liveData.client.submitWeeklyReview(
        {
          workspaceId,
          health: draft.health,
          progress: draft.progress,
          blocker: draft.blocker,
          nextMilestone: draft.nextMilestone,
          ...(draft.decisionNeeded
            ? { decisionNeeded: draft.decisionNeeded }
            : {}),
          priorityNextWeek: draft.priorityNextWeek,
        },
        idempotencyKey,
      );
      setConfirmed(
        `Server confirmed review ${response.data.update.id} and snapshot ${response.data.snapshot.id}.${response.replayed ? " The original idempotent result was replayed." : ""}`,
      );
      setReviews(await liveData.client.weeklyReviews(workspaceId));
      setSnapshots(await liveData.client.workspaceSnapshots({ workspaceId }));
      await liveData.refresh();
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        /* server is canonical */
      }
      setDraft(emptyReview);
      setIdempotencyKey(crypto.randomUUID());
    } catch (reason) {
      setError(reason);
    } finally {
      setPending(false);
    }
  }

  const presented = error ? presentLiveError(error) : null;
  return (
    <div className={styles.twoColumns}>
      <form
        className={styles.panel}
        data-testid="weekly-review-form"
        onSubmit={submit}
      >
        <header>
          <div>
            <p>Durable ritual</p>
            <h2>Publish weekly review</h2>
          </div>
        </header>
        {presented ? (
          <LiveStateNotice
            description={`${presented.description} Your organization-scoped draft is preserved.`}
            kind={presented.kind}
            title={presented.title}
          />
        ) : pending ? (
          <LiveStateNotice
            description="The review and snapshot must commit together before success appears."
            kind="pending"
            title="Waiting for server confirmation"
          />
        ) : confirmed ? (
          <LiveStateNotice
            description={confirmed}
            kind="saved"
            title="Weekly review is durable"
          />
        ) : null}
        <fieldset
          aria-busy={!hydrated || pending}
          className={styles.formBody}
          disabled={!hydrated || pending}
        >
          <label className={styles.field}>
            <span>Health</span>
            <select
              value={draft.health}
              onChange={(event) =>
                edit({
                  health: event.target.value as WeeklyReviewDraft["health"],
                })
              }
            >
              <option value="on_track">On track</option>
              <option value="watch">Watch</option>
              <option value="critical">Critical</option>
              <option value="parked">Parked</option>
            </select>
          </label>
          {(
            [
              ["progress", "Progress this week"],
              ["blocker", "Current blocker"],
              ["nextMilestone", "Next milestone"],
              ["decisionNeeded", "Decision needed · Optional"],
              ["priorityNextWeek", "Priority next week"],
            ] as const
          ).map(([key, label]) => (
            <label className={styles.field} key={key}>
              <span>{label}</span>
              <textarea
                onChange={(event) => edit({ [key]: event.target.value })}
                required={key !== "decisionNeeded"}
                rows={2}
                value={draft[key]}
              />
            </label>
          ))}
          <button
            className="primary-button"
            data-testid="weekly-review-submit"
            disabled={!hydrated || pending}
            type="submit"
          >
            {pending
              ? "Waiting for confirmation…"
              : error
                ? "Retry same review"
                : "Publish review and snapshot"}
          </button>
        </fieldset>
      </form>
      <section
        className={styles.panel}
        aria-labelledby="review-history-title"
        data-testid="weekly-review-history"
      >
        <header>
          <div>
            <p>Persistent memory</p>
            <h2 id="review-history-title">Review history</h2>
          </div>
        </header>
        {loading ? (
          <LiveStateNotice kind="loading" title="Loading review history" />
        ) : reviews.length === 0 ? (
          <LiveStateNotice kind="empty" title="No weekly reviews yet" />
        ) : (
          <div className={styles.timeline}>
            {reviews.map((review) => (
              <article key={review.id}>
                <strong>
                  {review.author.name} ·{" "}
                  {review.health?.replaceAll("_", " ") ?? "No health"}
                </strong>
                <p>{review.progress}</p>
                <small>{formatLiveDate(review.publishedAt, timezone)}</small>
              </article>
            ))}
          </div>
        )}
        <h3>Snapshots</h3>
        <div className={styles.snapshotGrid} data-testid="workspace-snapshots">
          {snapshots.map((snapshot) => (
            <article key={snapshot.id}>
              <strong>{formatLiveDate(snapshot.capturedAt, timezone)}</strong>
              <span>{snapshot.health.replaceAll("_", " ")}</span>
              <small>
                {snapshot.openCount} open · {snapshot.blockedCount} blocked ·{" "}
                {snapshot.attentionCount} attention
              </small>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function LiveSearch({
  workspaceId,
  workspaceSlug,
}: {
  workspaceId: string;
  workspaceSlug: string;
}) {
  const liveData = useLiveAppData();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{
    workspaces: typeof liveData.workspaces;
    items: WorkItemDto[];
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim().length < 2 || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await liveData.client.search(query.trim());
      setResults({
        workspaces: response.workspaces,
        items: response.items.filter(
          (item) => item.workspaceId === workspaceId,
        ),
      });
    } catch (reason) {
      setError(reason);
    } finally {
      setPending(false);
    }
  }
  const presented = error ? presentLiveError(error) : null;
  return (
    <section className={styles.panel} aria-labelledby="live-search-title">
      <header>
        <div>
          <p>Server-authorized results</p>
          <h2 id="live-search-title">Search this workspace</h2>
        </div>
      </header>
      <form className={styles.searchForm} onSubmit={submit}>
        <Search size={17} />
        <input
          aria-label="Search durable work"
          data-trevv-search-input
          minLength={2}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search work and records…"
          value={query}
        />
        <button disabled={pending || query.trim().length < 2} type="submit">
          {pending ? "Searching…" : "Search"}
        </button>
      </form>
      {presented ? (
        <LiveStateNotice
          description={presented.description}
          kind={presented.kind}
          title={presented.title}
        />
      ) : null}
      {results && results.items.length === 0 ? (
        <LiveStateNotice
          kind="no-results"
          title="No matching WorkItems"
          description="Try a broader term."
        />
      ) : results ? (
        <div className={styles.stack}>
          {results.items.map((item) => (
            <Link
              className={styles.listRow}
              href={`${workspaceHref(workspaceSlug)}/boards/${encodeURIComponent(item.boardId)}#${encodeURIComponent(item.id)}`}
              key={item.id}
            >
              <span className={styles.rowIcon}>
                <Search size={15} />
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>
                  {item.type} · {workItemStatusLabel(item.status)}
                </small>
              </span>
              <small>v{item.version}</small>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function resourceString(
  resource: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = resource[key];
  return typeof value === "string" && value ? value : undefined;
}

function captureType(value: string): WorkItemDto["type"] {
  return [
    "task",
    "decision",
    "approval",
    "milestone",
    "idea",
    "request",
  ].includes(value)
    ? (value as WorkItemDto["type"])
    : "task";
}

function capturePriority(value: string | undefined): WorkItemDto["priority"] {
  return ["urgent", "high", "normal", "low", "none"].includes(value ?? "")
    ? (value as WorkItemDto["priority"])
    : "normal";
}

function isWeeklyReviewDraft(value: unknown): value is WeeklyReviewDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<WeeklyReviewDraft>;
  return (
    ["on_track", "watch", "critical", "parked"].includes(draft.health ?? "") &&
    typeof draft.progress === "string" &&
    typeof draft.blocker === "string" &&
    typeof draft.nextMilestone === "string" &&
    typeof draft.decisionNeeded === "string" &&
    typeof draft.priorityNextWeek === "string" &&
    typeof draft.attemptedFingerprint === "string"
  );
}

function editableStatusOptions(current: WorkItemDto["status"]) {
  const editable = ["not_started", "working", "review"] as const;
  return new Set<WorkItemDto["status"]>(editable).has(current)
    ? [...editable]
    : [current, ...editable];
}

function retainedKey(keys: Map<string, string>, fingerprint: string) {
  const existing = keys.get(fingerprint);
  if (existing) return existing;
  const created = crypto.randomUUID();
  keys.set(fingerprint, created);
  return created;
}

function weeklyReviewFingerprint(draft: WeeklyReviewDraft) {
  return JSON.stringify({
    health: draft.health,
    progress: draft.progress,
    blocker: draft.blocker,
    nextMilestone: draft.nextMilestone,
    decisionNeeded: draft.decisionNeeded,
    priorityNextWeek: draft.priorityNextWeek,
  });
}

function persistWeeklyReviewDraft(
  key: string,
  draft: WeeklyReviewDraft,
  idempotencyKey: string,
) {
  const envelope: LiveDraftEnvelope<WeeklyReviewDraft> = {
    version: 1,
    idempotencyKey,
    payload: draft,
    updatedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // The in-memory review remains available for retry.
  }
}
