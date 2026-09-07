"use client";

import { InboxExperience } from "./email-inbox-workflow";

import type {
  BoardDto,
  InboxItemDto,
  WorkItemDto,
} from "@founderhq/api-contract";
import { CheckCircle2, Inbox, LayoutList } from "lucide-react";
import { AppLink as Link } from "@/components/navigation-link";
import { useEffect, useRef, useState } from "react";
import { useReportRouteReady } from "@/lib/navigation-performance";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords as useLiveAppData } from "@/lib/live-app-data";
import { presentLiveError } from "@/lib/live-errors";
import { formatLiveDate } from "@/lib/live-workflow-ui";
import { workspaceHref } from "@/lib/workspace-routes";
import { LiveStateNotice } from "./live-state";
import styles from "./live-operating-loop.module.css";
import { WindowedCollection } from "./windowed-collection";
import { recordKey, retainedKey } from "@/lib/live-work-view-helpers";

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
  useReportRouteReady(!loading);
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
        <WindowedCollection
          className={styles.stack}
          items={visible}
          itemKey={recordKey}
          label="Work records"
        >
          {(record) => (
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
          )}
        </WindowedCollection>
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

export function LiveInboxFeature(props: {
  workspaceId: string;
  workspaceSlug: string;
}) {
  useReportRouteReady(true);
  return (
    <InboxExperience
      capturedWork={<LiveInbox {...props} />}
      initialArea="email"
    />
  );
}
