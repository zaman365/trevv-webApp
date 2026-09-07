"use client";

import { useReportRouteReady } from "@/lib/navigation-performance";

import type { WorkItemDto } from "@founderhq/api-contract";
import { AppLink as Link } from "@/components/navigation-link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords as useLiveAppData } from "@/lib/live-app-data";
import { presentLiveError } from "@/lib/live-errors";
import { workItemStatusLabel } from "@/lib/live-workflow-ui";
import { workspaceHref } from "@/lib/workspace-routes";
import { LiveStateNotice } from "./live-state";
import styles from "./live-operating-loop.module.css";
import { WindowedCollection } from "./windowed-collection";
import {
  recordKey,
  retainedKey,
  editableStatusOptions,
} from "@/lib/live-work-view-helpers";

export function LiveMyWork({
  items,
  workspaceSlug,
}: {
  items: WorkItemDto[];
  workspaceSlug: string;
}) {
  useReportRouteReady(true);
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
      await liveData.applyConfirmedItem(response.data);
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
      await liveData.refresh({ backgroundRecords: true });
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
          description={
            liveData.recordsComplete
              ? "Assign a WorkItem to yourself from its board details."
              : "More workspace records are still arriving."
          }
          kind={liveData.recordsComplete ? "empty" : "loading"}
          title={
            liveData.recordsComplete
              ? "Nothing is assigned to you"
              : "Loading assigned work"
          }
        />
      ) : (
        <WindowedCollection
          className={styles.itemTable}
          items={mine}
          itemKey={recordKey}
          label="Work records"
        >
          {(item) => (
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
          )}
        </WindowedCollection>
      )}
    </section>
  );
}
