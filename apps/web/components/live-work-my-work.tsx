"use client";

import type { WorkItemDto } from "@founderhq/api-contract";
import { AppLink as Link } from "@/components/navigation-link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReportRouteReady } from "@/lib/navigation-performance";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords as useLiveAppData } from "@/lib/live-app-data";
import { presentLiveError, presentLiveReadError } from "@/lib/live-errors";
import { workspaceHref } from "@/lib/workspace-routes";
import { retainedKey } from "@/lib/live-work-view-helpers";
import { LiveStateNotice } from "./live-state";
import { LiveTaskList } from "./live-task-list";
import styles from "./live-operating-loop.module.css";

export function LiveMyWork({
  items,
  workspaceSlug,
  assignedToMe = true,
  title = "My tasks",
}: {
  items: WorkItemDto[];
  workspaceSlug?: string;
  assignedToMe?: boolean;
  title?: string;
}) {
  useReportRouteReady(true);
  const session = useAppSession();
  const liveData = useLiveAppData();
  const [localItems, setLocalItems] = useState(items);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const inFlight = useRef(new Set<string>());
  const [notice, setNotice] = useState<ReactNode>(null);
  const [conflict, setConflict] = useState<{
    itemId: string;
    status: WorkItemDto["status"];
    error: unknown;
  } | null>(null);
  const retryKeys = useRef(new Map<string, string>());
  const mine = assignedToMe
    ? localItems.filter((item) =>
        item.assignees.some((assignee) => assignee.id === session.user.id),
      )
    : localItems;

  useEffect(() => {
    if (pendingIds.size) return;
    const timer = window.setTimeout(() => setLocalItems(items), 0);
    return () => window.clearTimeout(timer);
  }, [items, pendingIds.size]);

  async function changeStatus(
    item: WorkItemDto,
    status: WorkItemDto["status"],
  ) {
    if (inFlight.current.has(item.id)) return;
    inFlight.current.add(item.id);
    const fingerprint = `status:${item.id}:${item.version}:${status}`;
    setLocalItems((current) =>
      current.map((record) =>
        record.id === item.id ? { ...record, status } : record,
      ),
    );
    setPendingIds((current) => new Set(current).add(item.id));
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
          description="Your change is saved."
          kind="saved"
          title={`Server confirmed “${response.data.title}”`}
        />,
      );
      void liveData.refresh({ backgroundRecords: true });
    } catch (reason) {
      setLocalItems((current) =>
        current.map((record) => (record.id === item.id ? item : record)),
      );
      const presented = presentLiveError(reason);
      if (presented.kind === "version-conflict")
        setConflict({ itemId: item.id, status, error: reason });
      setNotice(<LiveStateNotice {...presented} />);
    } finally {
      inFlight.current.delete(item.id);
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function reloadConflict(reapply: boolean) {
    if (!conflict) return;
    try {
      const latest = await liveData.client.item(conflict.itemId);
      await liveData.applyConfirmedItem(latest);
      setLocalItems((current) =>
        current.map((item) => (item.id === latest.id ? latest : item)),
      );
      setConflict(null);
      if (reapply) await changeStatus(latest, conflict.status);
      else
        setNotice(<LiveStateNotice kind="saved" title="Latest task loaded" />);
    } catch (error) {
      setNotice(<LiveStateNotice {...presentLiveReadError(error)} />);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="my-work-title">
      <header>
        <div>
          <p>
            {assignedToMe
              ? session.user.name
              : "Owners, deadlines, and progress"}
          </p>
          <h2 id="my-work-title">{title}</h2>
        </div>
        <Link
          href={workspaceSlug ? workspaceHref(workspaceSlug) : "/app/portfolio"}
        >
          Open boards
        </Link>
      </header>
      {notice}
      {conflict ? (
        <LiveStateNotice
          actions={
            <>
              <button onClick={() => void reloadConflict(false)} type="button">
                Load latest
              </button>
              <button onClick={() => void reloadConflict(true)} type="button">
                Reapply to latest
              </button>
            </>
          }
          description={presentLiveError(conflict.error).description}
          kind="version-conflict"
          title="Choose how to handle the newer WorkItem"
        />
      ) : null}
      {mine.length === 0 && !liveData.recordsComplete ? (
        <LiveStateNotice kind="loading" title="Loading assigned work" />
      ) : (
        <LiveTaskList
          items={mine}
          workspaces={
            workspaceSlug
              ? liveData.workspaces.filter(
                  (workspace) => workspace.slug === workspaceSlug,
                )
              : liveData.workspaces
          }
          userId={session.user.id}
          timezone={session.organization.timezone ?? "UTC"}
          pendingIds={pendingIds}
          onStatusChange={(item, status) => void changeStatus(item, status)}
          initialPeriod="open"
          complete={liveData.recordsComplete}
        />
      )}
    </section>
  );
}
