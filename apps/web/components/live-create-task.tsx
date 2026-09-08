"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { WorkspaceDto } from "@founderhq/api-contract";
import { AppLink as Link } from "@/components/navigation-link";
import { useAppSession } from "@/lib/app-session-context";
import { workspaceHref } from "@/lib/workspace-routes";
import {
  LiveQuickCaptureDialog,
  warmCreateDialog,
} from "./lazy-create-dialogs";
import type { LiveCaptureSuccess } from "./live-quick-capture";
import styles from "./live-operating-loop.module.css";

export function LiveCreateTask({ workspaces }: { workspaces: WorkspaceDto[] }) {
  const session = useAppSession();
  const [workspaceId, setWorkspaceId] = useState("");
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<LiveCaptureSuccess | null>(null);
  const workspace =
    workspaces.find((record) => record.id === workspaceId) ?? workspaces[0];
  return (
    <div className={styles.createTaskActions}>
      {workspaces.length > 1 ? (
        <label>
          <span className="sr-only">Create task in workspace</span>
          <select
            aria-label="Create task in workspace"
            value={workspace?.id ?? ""}
            onChange={(event) => setWorkspaceId(event.target.value)}
          >
            {workspaces.map((record) => (
              <option value={record.id} key={record.id}>
                {record.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button
        className="primary-button"
        type="button"
        disabled={!workspace}
        onClick={() => setOpen(true)}
        onPointerEnter={() => warmCreateDialog("live-capture")}
        onFocus={() => warmCreateDialog("live-capture")}
      >
        <Plus size={15} /> New task
      </button>
      {saved ? (
        <Link
          className={styles.savedTaskLink}
          href={
            saved.boardId
              ? `${workspaceHref(saved.workspaceSlug)}/boards/${encodeURIComponent(saved.boardId)}#${encodeURIComponent(saved.recordId)}`
              : workspaceHref(saved.workspaceSlug, "inbox")
          }
        >
          Open “{saved.title}”
        </Link>
      ) : null}
      {open && workspace ? (
        <LiveQuickCaptureDialog
          key={workspace.id}
          workspaceId={workspace.id}
          workspaceSlug={workspace.slug}
          defaultDestination="board"
          defaultAssigneeId={session.user.id}
          onClose={() => setOpen(false)}
          onConfirmed={(result) => {
            setSaved(result);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
