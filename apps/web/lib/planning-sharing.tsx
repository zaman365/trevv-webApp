"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CreateConversationInput } from "@founderhq/api-contract";
import { useQueryClient } from "@tanstack/react-query";
import { AppLink as Link } from "@/components/navigation-link";
import { useAppSession } from "./app-session-context";
import { useLiveAppRecords } from "./live-app-data";
import { collaborationKeys } from "./live-collaboration";
import { liveDraftStorageKey } from "./live-workflow-ui";
import { presentLiveError } from "./live-errors";
import { workspaceHref } from "./workspace-routes";
import styles from "@/components/planning-sharing-status.module.css";

export type PeopleChoice = {
  enabled: boolean;
  participantIds: string[];
  note: string;
};
export const emptyPeopleChoice: PeopleChoice = {
  enabled: false,
  participantIds: [],
  note: "",
};
export type SharedResource = {
  entityType: "board" | "work_item";
  entityId: string;
  title: string;
  description: string;
  workspaceId: string;
};
export type ShareJob = {
  key: string;
  input: CreateConversationInput;
  title: string;
  roomId?: string;
};
type ShareResource = (
  resource: SharedResource,
  people: PeopleChoice,
  sourceMutationKey?: string,
) => void;
const SharingContext = createContext<ShareResource | null>(null);

export function usePlanningSharing() {
  const value = useContext(SharingContext);
  if (!value) throw new Error("PlanningSharingProvider is required.");
  return value;
}

export function PlanningSharingProvider({ children }: { children: ReactNode }) {
  const session = useAppSession();
  const data = useLiveAppRecords();
  const cache = useQueryClient();
  const [jobs, setJobs] = useState<ShareJob[]>([]);
  const journal = useRef<ShareJob[]>([]);
  const running = useRef(new Set<string>());
  const [pending, setPending] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const storageKey = liveDraftStorageKey({
    organizationId: session.organization.id,
    userId: session.user.id,
    scope: "planning-sharing",
  });
  function persist(next: ShareJob[]) {
    journal.current = next;
    setJobs(next);
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify(next.filter((entry) => !entry.roomId)),
      );
    } catch {
      /* In-memory retry remains available. */
    }
  }
  useEffect(() => {
    let cancelled = false;
    async function recover() {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (!saved || saved === "[]") return;
        const { recoverShareJobs } =
          await import("./planning-sharing-recovery");
        const recovered = recoverShareJobs(JSON.parse(saved)).filter(
          (entry) => !entry.roomId,
        );
        if (cancelled) return;
        // A newly submitted job wins if recovery finishes after creation.
        const currentKeys = new Set(journal.current.map((entry) => entry.key));
        const next = [
          ...recovered.filter((entry) => !currentKeys.has(entry.key)),
          ...journal.current,
        ];
        journal.current = next;
        setJobs(next);
      } catch {
        /* A damaged local journal never grants access or sends a message. */
      }
    }
    void recover();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  async function send(job: ShareJob) {
    if (running.current.has(job.key) || job.roomId) return;
    running.current.add(job.key);
    setPending((current) => [...current, job.key]);
    setErrors((current) => ({ ...current, [job.key]: "" }));
    try {
      const result = await data.client.createConversation(job.input, job.key);
      persist(
        journal.current.map((entry) =>
          entry.key === job.key ? { ...entry, roomId: result.data.id } : entry,
        ),
      );
      void cache.invalidateQueries({
        queryKey: collaborationKeys.conversations(job.input.workspaceId),
      });
      void cache.invalidateQueries({
        queryKey: collaborationKeys.unread(job.input.workspaceId),
      });
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [job.key]: presentLiveError(error).title,
      }));
    } finally {
      running.current.delete(job.key);
      setPending((current) => current.filter((key) => key !== job.key));
    }
  }
  function share(
    resource: SharedResource,
    people: PeopleChoice,
    sourceMutationKey?: string,
  ) {
    if (!people.enabled || !people.participantIds.length) return;
    const participantIds = [
      ...new Set([session.user.id, ...people.participantIds]),
    ].sort();
    // A custom UUID (v8) retains the source mutation's random identifier while
    // using a distinct key. A replay stays safe even after dismissing its notice.
    const key = sourceMutationKey
      ? `${sourceMutationKey.slice(0, 14)}8${sourceMutationKey.slice(15)}`
      : crypto.randomUUID();
    const existing = journal.current.find((entry) => entry.key === key);
    if (existing) {
      void send(existing);
      return;
    }
    const label = resource.entityType === "board" ? "Plan" : "Idea";
    const job: ShareJob = {
      key,
      title: resource.title,
      input: {
        workspaceId: resource.workspaceId,
        title: `${label}: ${resource.title}`.slice(0, 160),
        purpose:
          `Discuss ${resource.title}. Share feedback, agree on next steps and keep the work connected.`.slice(
            0,
            1000,
          ),
        kind: "workspace",
        visibility: "private",
        participantIds,
        retentionDays: 365,
        context: {
          entityType: resource.entityType,
          entityId: resource.entityId,
        },
        openingMessage: [
          `${label} shared: ${resource.title}`,
          resource.description.length > 6000
            ? `${resource.description.slice(0, 6000)}…`
            : resource.description,
          people.note.trim() ||
            "I’d like your input. Share feedback and suggestions for the next steps here.",
        ]
          .filter(Boolean)
          .join("\n\n")
          .slice(0, 20_000),
      },
    };
    persist([...journal.current, job]);
    void send(job);
  }
  return (
    <SharingContext.Provider value={share}>
      {children}
      {jobs.length ? (
        <aside
          className={styles.tray}
          aria-label="Plan and idea sharing"
          aria-live="polite"
        >
          {jobs.map((job) => {
            const workspace = data.workspaces.find(
              (entry) => entry.id === job.input.workspaceId,
            );
            if (!workspace) return null;
            const busy = pending.includes(job.key);
            return (
              <div key={job.key} className={styles.shareStatus}>
                <strong>{job.title}</strong>
                <p>
                  {job.roomId
                    ? "Shared with your selected people. The discussion is ready."
                    : busy
                      ? "Saved. Sharing with your selected people…"
                      : "Saved. Sharing has not been confirmed; retry without creating another plan or idea."}
                </p>
                {errors[job.key] ? <p role="alert">{errors[job.key]}</p> : null}
                <div className={styles.actions}>
                  {job.roomId ? (
                    <Link
                      href={`${workspaceHref(workspace.slug, "messages")}#${encodeURIComponent(job.roomId)}`}
                      onClick={() =>
                        persist(
                          journal.current.filter(
                            (entry) => entry.key !== job.key,
                          ),
                        )
                      }
                    >
                      Open discussion
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void send(job)}
                    >
                      Retry sharing
                    </button>
                  )}
                  {job.roomId ? (
                    <button
                      type="button"
                      aria-label={`Dismiss sharing confirmation for ${job.title}`}
                      onClick={() =>
                        persist(
                          journal.current.filter(
                            (entry) => entry.key !== job.key,
                          ),
                        )
                      }
                    >
                      Dismiss
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </aside>
      ) : null}
    </SharingContext.Provider>
  );
}
