"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ConversationMessageDto, TeamDto } from "@founderhq/api-contract";
import {
  ArrowUpRight,
  CheckCheck,
  MessageCircleMore,
  Reply,
  Send,
  X,
} from "lucide-react";
import { AppLink as Link } from "@/components/navigation-link";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords } from "@/lib/live-app-data";
import {
  collaborationKeys,
  mergeConversationMessagePages,
  useLiveConversationMessages,
} from "@/lib/live-collaboration";
import { isLiveAccessLoss, presentLiveError } from "@/lib/live-errors";
import { liveDraftStorageKey } from "@/lib/live-workflow-ui";
import { workspaceHref } from "@/lib/workspace-routes";
import { dateTimeFormatter } from "@/lib/date-format";
import { initials } from "@/lib/team-workspace";
import { LiveStateNotice } from "./live-state";
import { LiveTeamTopics } from "./live-team-topics";
import styles from "./live-team-page.module.css";

type Draft = { body: string; key: string };
function recoverDrafts(value: unknown): Record<string, Draft> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([id, draft]) =>
        id.length <= 200 &&
        draft &&
        typeof draft === "object" &&
        typeof draft.body === "string" &&
        draft.body.length <= 20_000 &&
        typeof draft.key === "string" &&
        /^[a-f0-9-]{36}$/i.test(draft.key),
    ),
  );
}

export function LiveTeamCommunication({
  team,
  workspaceSlug,
  active,
  mode,
  onModeChange: setMode,
}: {
  team: TeamDto;
  workspaceSlug: string;
  active: boolean;
  mode: "conversation" | "topics";
  onModeChange: (mode: "conversation" | "topics") => void;
}) {
  const { client } = useLiveAppRecords();
  const session = useAppSession();
  const cache = useQueryClient();
  const [target, setTarget] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [hydrated, setHydrated] = useState(false);
  const [pending, setPending] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const roomId = team.room?.conversationId;
  const messages = useLiveConversationMessages(team.workspaceId, roomId, {
    enabled: active && mode === "conversation",
  });
  const replies = useLiveConversationMessages(team.workspaceId, roomId, {
    enabled: active && mode === "conversation" && Boolean(target),
    ...(target ? { parentMessageId: target } : {}),
  });
  const accessLost =
    isLiveAccessLoss(messages.error) || isLiveAccessLoss(error);
  const roots = accessLost
    ? []
    : mergeConversationMessagePages(messages.data?.pages)
        .filter((message) => !message.parentMessageId)
        .sort((a, b) => a.sequence - b.sequence);
  const selected = roots.find((message) => message.id === target);
  const thread =
    accessLost || isLiveAccessLoss(replies.error)
      ? []
      : mergeConversationMessagePages(replies.data?.pages).sort(
          (a, b) => a.sequence - b.sequence,
        );
  const key = target || "room";
  const draft = drafts[key];
  const canWrite =
    Boolean(roomId) && !accessLost && session.organization.role !== "viewer";
  const draftKey = liveDraftStorageKey({
    organizationId: session.organization.id,
    userId: session.user.id,
    scope: `team-conversation:${team.id}`,
  });
  const time = dateTimeFormatter("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: session.organization.timezone ?? "UTC",
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setDrafts(
          recoverDrafts(
            JSON.parse(window.localStorage.getItem(draftKey) ?? "{}"),
          ),
        );
      } catch {
        /* An unavailable local draft does not prevent sending. */
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [draftKey]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(drafts));
    } catch {
      /* Keep the working draft in memory. */
    }
  }, [draftKey, drafts, hydrated]);

  async function refresh() {
    if (!roomId) return;
    await Promise.all([
      cache.invalidateQueries({
        queryKey: collaborationKeys.messages(team.workspaceId, roomId),
      }),
      cache.invalidateQueries({
        queryKey: collaborationKeys.teams(team.workspaceId),
      }),
      cache.invalidateQueries({
        queryKey: collaborationKeys.conversations(team.workspaceId),
      }),
      cache.invalidateQueries({
        queryKey: collaborationKeys.unread(team.workspaceId),
      }),
    ]);
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (
      !roomId ||
      !hydrated ||
      !canWrite ||
      inFlight.current ||
      !draft?.body.trim() ||
      (target && (!selected || isLiveAccessLoss(replies.error)))
    )
      return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    setNotice("");
    const sentKey = key;
    const sentDraft = draft;
    try {
      await client.sendConversationMessage(
        roomId,
        {
          clientMessageId: sentDraft.key,
          body: sentDraft.body.trim(),
          intent: "message",
          metadata: {},
          ...(target ? { parentMessageId: target } : {}),
        },
        sentDraft.key,
      );
      setDrafts((current) => {
        const next = { ...current };
        if (next[sentKey]?.key === sentDraft.key) delete next[sentKey];
        return next;
      });
      setNotice(target ? "Your reply was sent." : "Your message was sent.");
      void refresh();
    } catch (reason) {
      setError(reason);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  async function markRead() {
    const latest = roots[roots.length - 1];
    if (!roomId || !latest || markingRead) return;
    setMarkingRead(true);
    setError(null);
    try {
      await client.markConversationRead(roomId, latest.id, crypto.randomUUID());
      setNotice("Team conversation marked as read.");
      void refresh();
    } catch (reason) {
      setError(reason);
    } finally {
      setMarkingRead(false);
    }
  }
  function messageRow(message: ConversationMessageDto, reply = false) {
    return (
      <li key={message.id} className={styles.message}>
        <span className={styles.avatar} aria-hidden="true">
          {initials(message.sender.name)}
        </span>
        <div>
          <header>
            <strong>{message.sender.name}</strong>
            <time dateTime={message.createdAt}>
              {time.format(new Date(message.createdAt))}
            </time>
          </header>
          {typeof message.metadata.topicTitle === "string" ? (
            <button
              type="button"
              className={styles.topicLink}
              onClick={() => setMode("topics")}
            >
              Topic: {message.metadata.topicTitle}
            </button>
          ) : null}
          <p>{message.body}</p>
          {!reply ? (
            <button
              type="button"
              onClick={() => {
                setTarget(message.id);
                setNotice("");
              }}
            >
              <Reply size={14} /> Replies to {message.sender.name}
            </button>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <section
      className={styles.section}
      aria-label="Team communication workspace"
    >
      <header className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>Conversations with context</p>
          <h2>Communication</h2>
          <p>
            Everyday updates in the team room. Focused discussions in named
            topics.
          </p>
        </div>
        {roomId ? (
          <Link
            href={`${workspaceHref(workspaceSlug, "messages")}#${encodeURIComponent(roomId)}`}
          >
            Open full Messages <ArrowUpRight size={15} />
          </Link>
        ) : null}
      </header>
      <div
        className={styles.switcher}
        role="group"
        aria-label="Communication view"
      >
        <button
          type="button"
          aria-pressed={mode === "conversation"}
          onClick={() => setMode("conversation")}
        >
          <MessageCircleMore size={15} /> Team conversation
        </button>
        <button
          type="button"
          aria-pressed={mode === "topics"}
          onClick={() => setMode("topics")}
        >
          Topics and discussions
        </button>
      </div>
      {!roomId ? (
        <LiveStateNotice
          kind="permission-loss"
          title="This team room is private"
          description="Only team members can read and participate. Review People & workload to manage membership."
        />
      ) : (
        <>
          <div hidden={mode !== "conversation"} className={styles.panel}>
            <header>
              <h2>{team.room!.title}</h2>
              {roots.length ? (
                <button
                  type="button"
                  disabled={markingRead || accessLost}
                  onClick={() => void markRead()}
                >
                  <CheckCheck size={15} /> Mark as read
                </button>
              ) : null}
            </header>
            {error || messages.error ? (
              <LiveStateNotice
                {...presentLiveError(error ?? messages.error)}
                actions={
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      void messages.refetch();
                    }}
                  >
                    Retry conversation
                  </button>
                }
              />
            ) : null}
            {notice ? (
              <p role="status" className={styles.success}>
                {notice}
              </p>
            ) : null}
            {messages.isPending ? (
              <p role="status">Loading conversation…</p>
            ) : null}
            {messages.hasNextPage ? (
              <button
                type="button"
                disabled={messages.isFetchingNextPage}
                onClick={() => void messages.fetchNextPage()}
              >
                Load older messages
              </button>
            ) : null}
            {!roots.length &&
            !messages.isPending &&
            !messages.error &&
            !accessLost ? (
              <p className={styles.empty}>
                Start the conversation. Share an update or a question with the
                team.
              </p>
            ) : null}
            <ol className={styles.messages} aria-label="Team messages">
              {roots.map((message) => messageRow(message))}
            </ol>
            {selected ? (
              <section className={styles.thread} aria-label="Message replies">
                <header>
                  <h3>Replies to {selected.sender.name}</h3>
                  <button
                    type="button"
                    onClick={() => setTarget("")}
                    aria-label="Close message replies"
                  >
                    <X size={16} />
                  </button>
                </header>
                <p>{selected.body}</p>
                {replies.error ? (
                  <LiveStateNotice
                    {...presentLiveError(replies.error)}
                    actions={
                      <button
                        type="button"
                        onClick={() => void replies.refetch()}
                      >
                        Retry replies
                      </button>
                    }
                  />
                ) : replies.isPending ? (
                  <p role="status">Loading replies…</p>
                ) : (
                  <ol className={styles.messages}>
                    {thread.map((message) => messageRow(message, true))}
                  </ol>
                )}
                {replies.hasNextPage ? (
                  <button
                    type="button"
                    disabled={replies.isFetchingNextPage}
                    onClick={() => void replies.fetchNextPage()}
                  >
                    Load older replies
                  </button>
                ) : null}
              </section>
            ) : null}
            {canWrite ? (
              <form className={styles.composer} onSubmit={send}>
                <label>
                  {target ? "Reply to conversation" : "Message your team"}
                  <textarea
                    value={draft?.body ?? ""}
                    disabled={!hydrated || pending}
                    maxLength={20_000}
                    rows={3}
                    placeholder={
                      target
                        ? "Write a reply…"
                        : "Share an update, question, or useful link…"
                    }
                    onChange={(event) => {
                      setDrafts((current) => ({
                        ...current,
                        [key]: {
                          body: event.target.value,
                          key: crypto.randomUUID(),
                        },
                      }));
                      setError(null);
                    }}
                  />
                </label>
                <div>
                  <small>Your draft is kept on this browser.</small>
                  <button
                    type="submit"
                    className={styles.primary}
                    disabled={
                      !hydrated ||
                      pending ||
                      !draft?.body.trim() ||
                      Boolean(
                        target &&
                        (!selected || isLiveAccessLoss(replies.error)),
                      )
                    }
                  >
                    <Send size={15} />
                    {pending
                      ? "Sending…"
                      : target
                        ? "Send reply"
                        : "Send message"}
                  </button>
                </div>
              </form>
            ) : !accessLost ? (
              <p className={styles.empty}>
                You have read-only access to this conversation.
              </p>
            ) : null}
          </div>
          <div hidden={mode !== "topics"} className={styles.panel}>
            <LiveTeamTopics
              team={team}
              workspaceSlug={workspaceSlug}
              active={active && mode === "topics"}
            />
          </div>
        </>
      )}
    </section>
  );
}
