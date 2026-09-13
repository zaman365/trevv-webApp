"use client";

import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AttentionSignalDto,
  ConversationDto,
  WorkItemDto,
} from "@founderhq/api-contract";
import { Mail, Send } from "lucide-react";
import { AppLink as Link } from "@/components/navigation-link";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords } from "@/lib/live-app-data";
import {
  collaborationKeys,
  useLiveTeamDirectory,
} from "@/lib/live-collaboration";
import { isLiveAccessLoss, presentLiveError } from "@/lib/live-errors";
import { readAllPages } from "@/lib/read-all-pages";
import { useIssueDraft } from "@/lib/use-issue-draft";
import { issueContext, issueEmailHref } from "@/lib/attention-workspace";
import { workspaceHref } from "@/lib/workspace-routes";
import { LiveStateNotice } from "./live-state";
import styles from "./live-issue-detail.module.css";

export function LiveIssueCommunication({
  signal,
  item,
  workspaceId,
  workspaceSlug,
  url,
  active,
}: {
  signal: AttentionSignalDto;
  item?: WorkItemDto;
  workspaceId: string;
  workspaceSlug: string;
  url: string;
  active: boolean;
}) {
  const { client } = useLiveAppRecords();
  const session = useAppSession();
  const cache = useQueryClient();
  const directory = useLiveTeamDirectory(workspaceId, active);
  const rooms = useQuery({
    queryKey: collaborationKeys.conversations(workspaceId),
    queryFn: ({ signal: abort }) =>
      readAllPages((cursor) =>
        client.withSignal(abort).conversations({
          workspaceId,
          limit: 100,
          ...(cursor ? { cursor } : {}),
        }),
      ),
    enabled: active,
    staleTime: 10_000,
  });
  const people = isLiveAccessLoss(directory.error)
    ? []
    : (directory.data?.availableMembers ?? []);
  const conversations = isLiveAccessLoss(rooms.error) ? [] : (rooms.data ?? []);
  const { draft, setDraft, hydrated } = useIssueDraft(
    `issue-communication:${signal.id}`,
    {
      destination: "person",
      personId:
        item?.assignees.find((person) => person.id !== session.user.id)?.id ??
        "",
      roomId: "",
      body: `Can we agree on the next step, an owner and a realistic deadline?\n\n${issueContext(signal, url, item)}`,
      intent: "message",
      responseOwnerId: "",
      responseDue: "",
      messageKey: "",
      directKey: "",
      emailTo: "",
      emailSubject: `Action needed: ${signal.reason}`.slice(0, 300),
      emailBody: `Hi,\n\nCan we agree on how to move this forward, who will own it, and when?\n\n${issueContext(signal, url, item)}\n\nThanks`,
    },
  );
  const [mode, setMode] = useState<"message" | "email">("message");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const createdRooms = useRef(new Map<string, ConversationDto>());
  const [error, setError] = useState<unknown>(null);
  const [sentTo, setSentTo] = useState<ConversationDto | null>(null);
  const selectedRoom = conversations.find((room) => room.id === draft.roomId);
  const selectedPerson = people.find(
    (person) => person.id === draft.personId && person.id !== session.user.id,
  );
  const responsePeople =
    draft.destination === "person"
      ? selectedPerson
        ? [selectedPerson]
        : []
      : (selectedRoom?.participants.map((person) => person.user) ?? []);
  const responseOwnerId =
    draft.destination === "person" ? draft.personId : draft.responseOwnerId;
  const canWrite =
    !["viewer", "guest"].includes(session.organization.role) &&
    !isLiveAccessLoss(error) &&
    !isLiveAccessLoss(rooms.error) &&
    !isLiveAccessLoss(directory.error);
  function edit(patch: Partial<typeof draft>) {
    setDraft((current) => ({
      ...current,
      ...patch,
      messageKey: crypto.randomUUID(),
      ...(patch.personId ? { directKey: crypto.randomUUID() } : {}),
    }));
    setError(null);
    setSentTo(null);
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!hydrated || busy.current || !canWrite || !draft.body.trim()) return;
    if (draft.destination === "person" ? !selectedPerson : !selectedRoom)
      return;
    if (
      draft.intent !== "message" &&
      !responsePeople.some((person) => person.id === responseOwnerId)
    )
      return;
    busy.current = true;
    setPending(true);
    setError(null);
    setSentTo(null);
    const messageKey = draft.messageKey || crypto.randomUUID();
    const directKey = draft.directKey || crypto.randomUUID();
    setDraft((current) => ({ ...current, messageKey, directKey }));
    try {
      let room = selectedRoom;
      if (draft.destination === "person") {
        const latest = await readAllPages((cursor) =>
          client.conversations({
            workspaceId,
            limit: 100,
            ...(cursor ? { cursor } : {}),
          }),
        );
        room =
          latest.find(
            (entry) =>
              entry.kind === "direct" &&
              entry.participants.length === 2 &&
              [session.user.id, draft.personId].every((id) =>
                entry.participants.some((member) => member.user.id === id),
              ),
          ) ?? createdRooms.current.get(draft.personId);
        if (!room) {
          room = (
            await client.createConversation(
              {
                workspaceId,
                title: `${session.user.name} & ${selectedPerson!.name}`.slice(
                  0,
                  160,
                ),
                purpose: "",
                kind: "direct",
                visibility: "private",
                participantIds: [session.user.id, draft.personId],
                retentionDays: 365,
              },
              directKey,
            )
          ).data;
          createdRooms.current.set(draft.personId, room);
        }
      }
      const intent =
        draft.intent === "request"
          ? "request"
          : draft.intent === "decision"
            ? "decision"
            : "message";
      await client.sendConversationMessage(
        room!.id,
        {
          clientMessageId: messageKey,
          body: draft.body.trim(),
          intent,
          ...(intent !== "message"
            ? {
                responseOwnerId,
                ...(draft.responseDue
                  ? { responseDueAt: new Date(draft.responseDue).toISOString() }
                  : {}),
              }
            : {}),
          metadata: {
            attentionSignalId: signal.id,
            entityType: signal.entityType,
            entityId: signal.entityId,
          },
        },
        messageKey,
      );
      setSentTo(room!);
      setDraft((current) => ({ ...current, body: "", messageKey: "" }));
      void cache.invalidateQueries({
        queryKey: collaborationKeys.workspace(workspaceId),
      });
    } catch (reason) {
      setError(reason);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const emailValid = draft.emailTo
    .split(",")
    .every((value) => /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(value.trim()));
  return (
    <section className={styles.section} aria-label="Issue communication">
      <div
        className={styles.tabs}
        role="group"
        aria-label="Communication channel"
      >
        <button
          type="button"
          aria-pressed={mode === "message"}
          onClick={() => setMode("message")}
        >
          Message or request
        </button>
        <button
          type="button"
          aria-pressed={mode === "email"}
          onClick={() => setMode("email")}
        >
          Email draft
        </button>
      </div>
      <div hidden={mode !== "message"}>
        <p>
          Agree on ownership, ask for help, or negotiate a deadline. The issue
          link stays with the conversation.
        </p>
        {error || rooms.error || directory.error ? (
          <LiveStateNotice
            {...presentLiveError(error ?? rooms.error ?? directory.error)}
            actions={
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  void rooms.refetch();
                  void directory.refetch();
                }}
              >
                Refresh recipients
              </button>
            }
          />
        ) : null}
        {sentTo ? (
          <LiveStateNotice
            kind="saved"
            title="Message sent"
            description="The issue stays open until the underlying work is addressed."
            actions={
              <Link
                href={`${workspaceHref(workspaceSlug, "messages")}#${encodeURIComponent(sentTo.id)}`}
              >
                Open conversation
              </Link>
            }
          />
        ) : null}
        <form onSubmit={send} className={styles.form}>
          <fieldset disabled={!hydrated || pending || !canWrite}>
            <label>
              Send to
              <select
                aria-label="Send to"
                value={draft.destination}
                onChange={(event) => edit({ destination: event.target.value })}
              >
                <option value="person">A person privately</option>
                <option value="room">An existing conversation</option>
              </select>
            </label>
            {draft.destination === "person" ? (
              <label>
                Person
                <select
                  aria-label="Person"
                  value={draft.personId}
                  onChange={(event) => edit({ personId: event.target.value })}
                  required
                >
                  <option value="">Choose a person</option>
                  {people
                    .filter((person) => person.id !== session.user.id)
                    .map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <label>
                Conversation
                <select
                  aria-label="Conversation"
                  required
                  value={draft.roomId}
                  onChange={(event) => edit({ roomId: event.target.value })}
                >
                  <option value="">Choose a conversation</option>
                  {conversations.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Message type
              <select
                aria-label="Message type"
                value={draft.intent}
                onChange={(event) => edit({ intent: event.target.value })}
              >
                <option value="message">Message</option>
                <option value="request">Request a response</option>
                <option value="decision">Request a decision</option>
              </select>
            </label>
            {draft.intent !== "message" ? (
              <div className={styles.grid}>
                <label>
                  Response owner
                  <select
                    aria-label="Response owner"
                    required
                    value={responseOwnerId}
                    disabled={draft.destination === "person"}
                    onChange={(event) =>
                      edit({ responseOwnerId: event.target.value })
                    }
                  >
                    <option value="">Choose an owner</option>
                    {responsePeople.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Response due (your local time)
                  <input
                    type="datetime-local"
                    value={draft.responseDue}
                    onChange={(event) =>
                      edit({ responseDue: event.target.value })
                    }
                  />
                </label>
              </div>
            ) : null}
            <label>
              Message
              <textarea
                aria-label="Message"
                required
                maxLength={20_000}
                rows={7}
                value={draft.body}
                onChange={(event) => edit({ body: event.target.value })}
              />
            </label>
            <button
              className={styles.primary}
              type="submit"
              disabled={
                !draft.body.trim() ||
                (draft.destination === "person"
                  ? !selectedPerson
                  : !selectedRoom)
              }
            >
              <Send size={16} />
              {pending ? "Sending…" : "Send message"}
            </button>
          </fieldset>
          {!canWrite ? (
            <p>Messaging is unavailable with your current access.</p>
          ) : (
            <small>
              Your draft is kept on this browser. Nothing is sent until you
              choose Send message.
            </small>
          )}
        </form>
      </div>
      <div hidden={mode !== "email"} className={styles.form}>
        <p>
          Prepare an email with the issue details, then review and send it in
          your mail app.
        </p>
        <label>
          Email recipient
          <input
            type="email"
            multiple
            value={draft.emailTo}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                emailTo: event.target.value,
              }))
            }
            placeholder="person@company.com"
          />
        </label>
        <label>
          Subject
          <input
            maxLength={300}
            value={draft.emailSubject}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                emailSubject: event.target.value,
              }))
            }
          />
        </label>
        <label>
          Email body
          <textarea
            rows={9}
            maxLength={20_000}
            value={draft.emailBody}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                emailBody: event.target.value,
              }))
            }
          />
        </label>
        {hydrated && emailValid && draft.emailSubject.trim() ? (
          <a
            className={styles.primary}
            href={issueEmailHref(
              draft.emailTo,
              draft.emailSubject,
              draft.emailBody,
            )}
          >
            <Mail size={16} />
            Open draft in mail app
          </a>
        ) : (
          <p>Enter a valid recipient and subject to open the draft.</p>
        )}
      </div>
    </section>
  );
}
