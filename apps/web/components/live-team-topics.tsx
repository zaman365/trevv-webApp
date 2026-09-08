"use client";

import { useEffect, useRef, useState } from "react";
import type { TeamDto } from "@founderhq/api-contract";
import { TrevvApiError } from "@founderhq/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useLiveAppRecords } from "@/lib/live-app-data";
import { useAppSession } from "@/lib/app-session-context";
import {
  collaborationKeys,
  useLiveConversationMessages,
} from "@/lib/live-collaboration";
import { retainedKey } from "@/lib/live-work-view-helpers";
import { isLiveAccessLoss, presentLiveError } from "@/lib/live-errors";
import { teamPlaybooks } from "@/lib/team-playbooks";
import { liveDraftStorageKey } from "@/lib/live-workflow-ui";
import { LiveStateNotice } from "./live-state";
import styles from "./live-collaboration.module.css";

interface TopicDraft {
  title: string;
  body: string;
  topicId: string;
  replies: Record<string, string>;
  retryKeys: [string, string][];
}
function isTopicDraft(value: unknown): value is TopicDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<TopicDraft>;
  return (
    typeof draft.title === "string" &&
    draft.title.length <= 160 &&
    typeof draft.body === "string" &&
    draft.body.length <= 20_000 &&
    typeof draft.topicId === "string" &&
    Boolean(draft.replies) &&
    typeof draft.replies === "object" &&
    !Array.isArray(draft.replies) &&
    Object.values(draft.replies!).every(
      (reply) => typeof reply === "string" && reply.length <= 20_000,
    ) &&
    Array.isArray(draft.retryKeys) &&
    draft.retryKeys.every(
      (entry) =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        typeof entry[0] === "string" &&
        typeof entry[1] === "string" &&
        /^[a-f0-9-]{36}$/i.test(entry[1]),
    )
  );
}

export function LiveTeamTopics({
  team,
  active = true,
}: {
  team: TeamDto;
  workspaceSlug: string;
  active?: boolean;
}) {
  const { client } = useLiveAppRecords();
  const session = useAppSession();
  const cache = useQueryClient();
  const roomId = team.room?.conversationId;
  const messages = useLiveConversationMessages(team.workspaceId, roomId, {
    enabled: active,
  });
  const [topicId, setTopicId] = useState("");
  const replies = useLiveConversationMessages(team.workspaceId, roomId, {
    enabled: active && Boolean(topicId),
    parentMessageId: topicId,
  });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const reply = replyDrafts[topicId] ?? "";
  const setReply = (value: string) =>
    setReplyDrafts((current) => ({ ...current, [topicId]: value }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const keys = useRef(new Map<string, string>());
  const draftKey = liveDraftStorageKey({
    organizationId: session.organization.id,
    userId: session.user.id,
    scope: `team-topics:${team.id}`,
  });
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(draftKey);
        const parsed: unknown = saved ? JSON.parse(saved) : null;
        if (isTopicDraft(parsed)) {
          setTitle(parsed.title);
          setBody(parsed.body);
          setTopicId(parsed.topicId);
          setReplyDrafts(parsed.replies);
          keys.current = new Map(parsed.retryKeys);
        }
      } catch {
        /* A denied or damaged local draft does not block collaboration. */
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [draftKey]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        draftKey,
        JSON.stringify({
          title,
          body,
          topicId,
          replies: replyDrafts,
          retryKeys: [...keys.current],
        }),
      );
    } catch {
      /* Sending still works if local storage is unavailable. */
    }
  }, [draftKey, hydrated, title, body, topicId, replyDrafts, pending]);
  const accessLost =
    messages.error instanceof TrevvApiError &&
    [401, 403, 404].includes(messages.error.status);
  const roots = accessLost
    ? []
    : (messages.data?.pages.flatMap((page) => page.data) ?? []).filter(
        (entry) =>
          !entry.parentMessageId &&
          typeof entry.metadata.topicTitle === "string",
      );
  const selected = roots.find((entry) => entry.id === topicId);
  const canWrite =
    hydrated &&
    Boolean(roomId) &&
    !accessLost &&
    !["viewer", "guest"].includes(session.organization.role);

  async function send(isReply: boolean) {
    const text = isReply ? reply.trim() : body.trim();
    if (!roomId || !canWrite || pending || !text || (!isReply && !title.trim()))
      return;
    const fingerprint = JSON.stringify({
      roomId,
      parent: isReply ? topicId : "",
      title: isReply ? "" : title.trim(),
      text,
    });
    const key = retainedKey(keys.current, fingerprint);
    setPending(true);
    setError(null);
    try {
      const { data } = await client.sendConversationMessage(
        roomId,
        {
          clientMessageId: key,
          body: text,
          intent: "message",
          ...(isReply ? { parentMessageId: topicId } : {}),
          metadata: isReply
            ? {}
            : { topicTitle: title.trim(), topicCategory: team.preset },
        },
        key,
      );
      keys.current.delete(fingerprint);
      if (isReply) setReply("");
      else {
        setTitle("");
        setBody("");
        setTopicId(data.id);
      }
      await cache.invalidateQueries({
        queryKey: collaborationKeys.messages(team.workspaceId, roomId),
      });
    } catch (reason) {
      setError(reason);
    } finally {
      setPending(false);
    }
  }

  if (!roomId)
    return (
      <LiveStateNotice
        kind="empty"
        title="Join the team to use its topics"
        description="Team discussions are shared with its members. Add yourself in People if you manage this team."
      />
    );
  return (
    <section
      className={styles.drawerSection}
      aria-label={`${team.name} topics`}
    >
      <header>
        <div>
          <h3>Topics and discussions</h3>
          <p>{teamPlaybooks[team.preset].outcome}</p>
        </div>
      </header>
      <p>
        Keep one topic for each campaign, technical question or project
        discussion. Replies stay with that topic and also appear in the team
        room.
      </p>
      {messages.isPending ? <p role="status">Loading topics…</p> : null}
      {error || messages.error ? (
        <LiveStateNotice
          {...presentLiveError(error ?? messages.error)}
          compact
          actions={
            <button type="button" onClick={() => void messages.refetch()}>
              Retry topics
            </button>
          }
        />
      ) : null}
      <div className={styles.topicList}>
        {roots.map((topic) => (
          <button
            key={topic.id}
            type="button"
            aria-pressed={topicId === topic.id}
            onClick={() => {
              setTopicId(topic.id);
            }}
          >
            <strong>{String(topic.metadata.topicTitle)}</strong>
            <small>{topic.sender.name}</small>
          </button>
        ))}
      </div>
      {messages.hasNextPage ? (
        <button
          type="button"
          disabled={messages.isFetchingNextPage}
          onClick={() => void messages.fetchNextPage()}
        >
          Load older topics
        </button>
      ) : null}
      {!messages.isPending && !roots.length && !messages.error ? (
        <p>
          No topics yet. Start with{" "}
          {teamPlaybooks[team.preset].topics.join(", ").toLowerCase()}.
        </p>
      ) : null}
      {selected ? (
        <section className={styles.topicThread} aria-label="Topic discussion">
          <h4>{String(selected.metadata.topicTitle)}</h4>
          <p>{selected.body}</p>
          {replies.error ? (
            <LiveStateNotice {...presentLiveError(replies.error)} compact />
          ) : null}
          {(isLiveAccessLoss(replies.error)
            ? []
            : (replies.data?.pages.flatMap((page) => page.data) ?? [])
          ).map((entry) => (
            <article key={entry.id}>
              <strong>{entry.sender.name}</strong>
              <p>{entry.body}</p>
            </article>
          ))}
          {replies.hasNextPage ? (
            <button type="button" onClick={() => void replies.fetchNextPage()}>
              Load older replies
            </button>
          ) : null}
          {canWrite ? (
            <>
              <label>
                Reply to topic
                <textarea
                  value={reply}
                  maxLength={20_000}
                  disabled={pending}
                  onChange={(event) => setReply(event.target.value)}
                  rows={3}
                />
              </label>
              <button
                type="button"
                disabled={pending || !reply.trim()}
                onClick={() => void send(true)}
              >
                Send reply
              </button>
            </>
          ) : null}
        </section>
      ) : null}
      {canWrite ? (
        <details open={roots.length === 0}>
          <summary>Start a topic</summary>
          <label>
            Topic title
            <input
              value={title}
              disabled={pending}
              maxLength={160}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={teamPlaybooks[team.preset].topics[0]}
            />
          </label>
          <label>
            Context or question
            <textarea
              value={body}
              disabled={pending}
              maxLength={20_000}
              onChange={(event) => setBody(event.target.value)}
              rows={4}
            />
          </label>
          <button
            type="button"
            disabled={pending || !title.trim() || !body.trim()}
            onClick={() => void send(false)}
          >
            {pending ? "Saving…" : "Create topic"}
          </button>
        </details>
      ) : null}
    </section>
  );
}
