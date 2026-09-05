"use client";

import type {
  UpdateWorkspaceInput,
  WorkspaceDto,
} from "@founderhq/api-contract";
import { CheckCircle2, Save, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords as useLiveAppData } from "@/lib/live-app-data";
import { presentLiveError } from "@/lib/live-errors";
import { workspaceHref } from "@/lib/workspace-routes";
import { LiveStateNotice } from "./live-state";
import styles from "./live-operating-loop.module.css";

const workspaceTypes: WorkspaceDto["type"][] = [
  "business",
  "brand",
  "client",
  "product",
  "department",
  "venture",
  "initiative",
  "investment",
  "campaign",
  "program",
  "project",
  "shared_function",
  "client_program",
  "journey",
  "other",
];

const workspaceStages: WorkspaceDto["stage"][] = [
  "idea",
  "validate",
  "build",
  "launch",
  "grow",
  "operate",
  "paused",
  "archived",
];

const workspaceHealth: WorkspaceDto["health"][] = [
  "on_track",
  "watch",
  "critical",
  "parked",
];

interface WorkspaceSettingsDraft {
  name: string;
  slug: string;
  description: string;
  type: WorkspaceDto["type"];
  accent: string;
  icon: string;
  stage: WorkspaceDto["stage"];
  health: WorkspaceDto["health"];
  healthNote: string;
  priority: string;
  nextMilestoneTitle: string;
  nextMilestoneDate: string;
}

export function LiveWorkspaceSettings({
  workspace,
}: {
  workspace: WorkspaceDto;
}) {
  const session = useAppSession();
  const liveData = useLiveAppData();
  const router = useRouter();
  const canManage =
    ["owner", "admin"].includes(session.organization.role) ||
    session.managedWorkspaceIds.includes(workspace.id);
  const [draft, setDraft] = useState(() => draftFrom(workspace));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState<WorkspaceDto | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const baselineVersion = useRef(workspace.versionTag);
  const dirty = useRef(false);

  useEffect(() => {
    if (workspace.versionTag === baselineVersion.current || dirty.current)
      return;
    baselineVersion.current = workspace.versionTag;
    setDraft(draftFrom(workspace));
    setSaved((current) =>
      current?.versionTag === workspace.versionTag ? current : null,
    );
  }, [workspace]);

  if (!canManage)
    return (
      <LiveStateNotice
        description="An Organization Owner, Admin, or assigned Workspace manager can change these settings."
        kind="permission-loss"
        title="Workspace settings are read-only"
      />
    );

  function change<Field extends keyof WorkspaceSettingsDraft>(
    field: Field,
    value: WorkspaceSettingsDraft[Field],
  ) {
    dirty.current = true;
    setDraft((current) => ({ ...current, [field]: value }));
    setSaved(null);
    if (error) {
      setError(null);
      setIdempotencyKey(crypto.randomUUID());
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setSaved(null);
    const input: UpdateWorkspaceInput = {
      name: draft.name.trim(),
      slug: draft.slug.trim(),
      description: draft.description.trim(),
      type: draft.type,
      accent: draft.accent,
      icon: draft.icon.trim(),
      stage: draft.stage,
      health: draft.health,
      healthNote: draft.healthNote.trim(),
      priority: draft.priority.trim(),
      nextMilestoneTitle: draft.nextMilestoneTitle.trim(),
      nextMilestoneDate: draft.nextMilestoneDate || null,
    };
    try {
      const result = await liveData.client.updateWorkspace(
        workspace.id,
        input,
        baselineVersion.current,
        idempotencyKey,
      );
      baselineVersion.current = result.data.versionTag;
      dirty.current = false;
      setDraft(draftFrom(result.data));
      setSaved(result.data);
      setIdempotencyKey(crypto.randomUUID());
      await liveData.refresh();
      if (result.data.slug !== workspace.slug)
        router.replace(workspaceHref(result.data.slug, "settings"));
    } catch (reason) {
      setError(reason);
    } finally {
      setPending(false);
    }
  }

  const presentedError = error ? presentLiveError(error) : null;

  return (
    <form className={styles.panel} onSubmit={save}>
      <header>
        <div>
          <p>Canonical Workspace record</p>
          <h2>Identity and operating settings</h2>
        </div>
        <span>
          <ShieldCheck size={14} /> Server-authorized
        </span>
      </header>

      {presentedError ? (
        <LiveStateNotice
          actions={
            presentedError.kind === "version-conflict" ? (
              <button
                onClick={() => {
                  dirty.current = false;
                  setError(null);
                  void liveData.refresh();
                }}
                type="button"
              >
                Load latest settings
              </button>
            ) : undefined
          }
          description={presentedError.description}
          kind={presentedError.kind}
          title={presentedError.title}
        />
      ) : pending ? (
        <LiveStateNotice
          description="Your existing Workspace remains canonical until the server confirms this update."
          kind="pending"
          title="Saving Workspace settings"
        />
      ) : saved ? (
        <LiveStateNotice
          description="The new settings are durable and visible to authorized members."
          kind="saved"
          title={`Server confirmed “${saved.name}”`}
        />
      ) : null}

      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>Name</span>
          <input
            disabled={pending}
            maxLength={160}
            minLength={2}
            onChange={(event) => change("name", event.currentTarget.value)}
            required
            value={draft.name}
          />
        </label>
        <label className={styles.field}>
          <span>URL slug</span>
          <input
            disabled={pending}
            maxLength={80}
            minLength={2}
            onChange={(event) => change("slug", event.currentTarget.value)}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            required
            value={draft.slug}
          />
        </label>
        <label className={styles.field}>
          <span>Type</span>
          <select
            disabled={pending}
            onChange={(event) =>
              change("type", event.currentTarget.value as WorkspaceDto["type"])
            }
            value={draft.type}
          >
            {workspaceTypes.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Lifecycle stage</span>
          <select
            disabled={pending}
            onChange={(event) =>
              change(
                "stage",
                event.currentTarget.value as WorkspaceDto["stage"],
              )
            }
            value={draft.stage}
          >
            {workspaceStages.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Health</span>
          <select
            disabled={pending}
            onChange={(event) =>
              change(
                "health",
                event.currentTarget.value as WorkspaceDto["health"],
              )
            }
            value={draft.health}
          >
            {workspaceHealth.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Icon or short mark</span>
          <input
            disabled={pending}
            maxLength={12}
            onChange={(event) => change("icon", event.currentTarget.value)}
            required
            value={draft.icon}
          />
        </label>
        <label className={styles.field}>
          <span>Accent colour</span>
          <input
            disabled={pending}
            onChange={(event) => change("accent", event.currentTarget.value)}
            pattern="#[0-9a-fA-F]{6}"
            required
            type="text"
            value={draft.accent}
          />
        </label>
        <label className={styles.field}>
          <span>Current priority</span>
          <input
            disabled={pending}
            maxLength={500}
            onChange={(event) => change("priority", event.currentTarget.value)}
            value={draft.priority}
          />
        </label>
        <label className={styles.field}>
          <span>Next milestone</span>
          <input
            disabled={pending}
            maxLength={500}
            onChange={(event) =>
              change("nextMilestoneTitle", event.currentTarget.value)
            }
            value={draft.nextMilestoneTitle}
          />
        </label>
        <label className={styles.field}>
          <span>Milestone date</span>
          <input
            disabled={pending}
            onChange={(event) =>
              change("nextMilestoneDate", event.currentTarget.value)
            }
            type="date"
            value={draft.nextMilestoneDate}
          />
        </label>
      </div>

      <label className={styles.field}>
        <span>Description</span>
        <textarea
          disabled={pending}
          maxLength={5_000}
          onChange={(event) => change("description", event.currentTarget.value)}
          rows={4}
          value={draft.description}
        />
      </label>
      <label className={styles.field}>
        <span>Health note</span>
        <textarea
          disabled={pending}
          maxLength={1_000}
          onChange={(event) => change("healthNote", event.currentTarget.value)}
          rows={3}
          value={draft.healthNote}
        />
      </label>

      <div className={styles.rowActions}>
        <button className="primary-button" disabled={pending} type="submit">
          {pending ? (
            "Saving…"
          ) : (
            <>
              {saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
              Save Workspace settings
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function draftFrom(workspace: WorkspaceDto): WorkspaceSettingsDraft {
  return {
    name: workspace.name,
    slug: workspace.slug,
    description: workspace.description,
    type: workspace.type,
    accent: workspace.accent,
    icon: workspace.icon,
    stage: workspace.stage,
    health: workspace.health,
    healthNote: workspace.healthNote,
    priority: workspace.priority,
    nextMilestoneTitle: workspace.nextMilestone?.title ?? "",
    nextMilestoneDate: workspace.nextMilestone?.date ?? "",
  };
}

function label(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/^./u, (letter) => letter.toLocaleUpperCase());
}
