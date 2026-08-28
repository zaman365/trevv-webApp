"use client";

import {
  Archive,
  ArrowRight,
  AtSign,
  BellRing,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronDown,
  FileCheck2,
  FileQuestion,
  Hash,
  Info,
  Link2,
  LockKeyhole,
  MessageCircleMore,
  MessageSquarePlus,
  MessagesSquare,
  Paperclip,
  Plus,
  Reply,
  Search,
  Send,
  ShieldCheck,
  SmilePlus,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { demoBoards, demoHubs, demoItems } from "@founderhq/core";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { storeCapturedWork, type CapturedWorkItem } from "@/lib/captured-work";
import { labelForProjectType } from "@/lib/terminology";
import { useWorkspace } from "@/lib/workspace-context";
import {
  currentMessagingUserId,
  messagingPeople,
  personById,
  seedConversations,
  seedMessages,
  type Conversation,
  type ConversationKind,
  type ConversationMessage,
  type MessageIntent,
} from "@/lib/messaging-data";

const conversationsStorageKey = "trevv:messaging-conversations";
const messagesStorageKey = "trevv:messaging-messages";
const demoNow = new Date("2026-08-27T10:00:00.000Z");

type FocusFilter = "all" | "needs-response" | "unread";
type NewConversationMode = "room" | "direct" | null;

const intentDetails: Record<
  MessageIntent,
  { label: string; hint: string; icon: typeof MessageCircleMore }
> = {
  message: {
    label: "Message",
    hint: "Share context without creating an obligation.",
    icon: MessageCircleMore,
  },
  request: {
    label: "Request",
    hint: "Assign a clear response owner and due time.",
    icon: BellRing,
  },
  decision: {
    label: "Decision",
    hint: "Record a choice and keep its work linked.",
    icon: FileQuestion,
  },
  update: {
    label: "Update",
    hint: "Post progress that can be found later.",
    icon: FileCheck2,
  },
};

export function MessagingWorkspace() {
  const { scope } = useWorkspace();
  const [conversations, setConversations] = useState(seedConversations);
  const [messages, setMessages] = useState(seedMessages);
  const [selectedId, setSelectedId] = useState(seedConversations[0]!.id);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<FocusFilter>("all");
  const [composer, setComposer] = useState("");
  const [intent, setIntent] = useState<MessageIntent>("message");
  const [responseOwnerId, setResponseOwnerId] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threadComposer, setThreadComposer] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const [newConversationMode, setNewConversationMode] =
    useState<NewConversationMode>(null);
  const [notice, setNotice] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const messageEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const storedConversations = JSON.parse(
          localStorage.getItem(conversationsStorageKey) ?? "null",
        ) as unknown;
        const storedMessages = JSON.parse(
          localStorage.getItem(messagesStorageKey) ?? "null",
        ) as unknown;
        if (Array.isArray(storedConversations) && storedConversations.length)
          setConversations(storedConversations as Conversation[]);
        if (Array.isArray(storedMessages) && storedMessages.length)
          setMessages(storedMessages as ConversationMessage[]);
      } catch {
        // The seeded workspace remains available if storage is unavailable.
      }
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        conversationsStorageKey,
        JSON.stringify(conversations),
      );
      localStorage.setItem(messagesStorageKey, JSON.stringify(messages));
    } catch {
      // State remains functional for the current session.
    }
  }, [conversations, hydrated, messages]);

  const scopedHubIds = useMemo(
    () => new Set(scope.hubs.map((hub) => hub.id)),
    [scope.hubs],
  );
  const scopedConversations = useMemo(
    () =>
      conversations.filter(
        (conversation) =>
          !conversation.hubId || scopedHubIds.has(conversation.hubId),
      ),
    [conversations, scopedHubIds],
  );
  const scopedConversationIds = useMemo(
    () => new Set(scopedConversations.map((conversation) => conversation.id)),
    [scopedConversations],
  );
  const selected =
    scopedConversations.find(
      (conversation) => conversation.id === selectedId,
    ) ?? scopedConversations[0]!;
  const selectedMessages = useMemo(
    () =>
      messages
        .filter(
          (message) =>
            message.conversationId === selected.id && !message.parentId,
        )
        .sort(
          (left, right) =>
            new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime(),
        ),
    [messages, selected.id],
  );
  const openResponses = messages.filter(
    (message) =>
      scopedConversationIds.has(message.conversationId) &&
      message.responseOwnerId === currentMessagingUserId &&
      message.responseState === "open",
  );
  const roomsNeedingResponse = new Set(
    openResponses.map((message) => message.conversationId),
  );
  const totalUnread = scopedConversations.reduce(
    (total, conversation) => total + conversation.unread,
    0,
  );
  const visibleConversations = scopedConversations
    .filter((conversation) => !conversation.archived)
    .filter((conversation) => {
      if (focus === "unread" && conversation.unread === 0) return false;
      if (
        focus === "needs-response" &&
        !roomsNeedingResponse.has(conversation.id)
      )
        return false;
      const normalized = query.trim().toLocaleLowerCase();
      if (!normalized) return true;
      const roomMessages = messages
        .filter((message) => message.conversationId === conversation.id)
        .map((message) => message.body)
        .join(" ");
      return `${conversation.title} ${conversation.purpose} ${roomMessages}`
        .toLocaleLowerCase()
        .includes(normalized);
    })
    .sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      return (
        new Date(right.lastActivity).getTime() -
        new Date(left.lastActivity).getTime()
      );
    });

  const participants = selected.participantIds.map(personById);
  const otherParticipants = participants.filter(
    (person) => person.id !== currentMessagingUserId,
  );
  const defaultResponseOwnerId =
    selected.participantIds.find((id) => id !== currentMessagingUserId) ??
    currentMessagingUserId;
  const effectiveResponseOwnerId = selected.participantIds.includes(
    responseOwnerId,
  )
    ? responseOwnerId
    : defaultResponseOwnerId;
  const selectedHub = demoHubs.find((hub) => hub.id === selected.hubId);
  const selectedHubItems = demoItems.filter(
    (item) => item.hubId === selected.hubId && item.status !== "done",
  );
  const roomOpenLoops = messages.filter(
    (message) =>
      message.conversationId === selected.id &&
      message.responseState === "open",
  );
  const threadMessage = threadId
    ? messages.find((message) => message.id === threadId)
    : undefined;
  const threadReplies = threadMessage
    ? messages.filter((message) => message.parentId === threadMessage.id)
    : [];

  const chooseConversation = (conversationId: string) => {
    setSelectedId(conversationId);
    setThreadId(null);
    setContextOpen(false);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, unread: 0 }
          : conversation,
      ),
    );
  };

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    const body = composer.trim();
    if (!body) return;
    const sentAt = new Date().toISOString();
    const needsResponse = intent === "request" || intent === "decision";
    const message: ConversationMessage = {
      id: createLocalId("message"),
      conversationId: selected.id,
      senderId: currentMessagingUserId,
      body,
      sentAt,
      intent,
      ...(needsResponse
        ? {
            responseOwnerId:
              effectiveResponseOwnerId ||
              otherParticipants[0]?.id ||
              currentMessagingUserId,
            responseDue: oneDayFromNow(),
            responseState: "open" as const,
          }
        : {}),
      reactions: [],
    };
    setMessages((current) => [...current, message]);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === selected.id
          ? { ...conversation, lastActivity: sentAt }
          : conversation,
      ),
    );
    setComposer("");
    setIntent("message");
    window.requestAnimationFrame(() =>
      messageEndRef.current?.scrollIntoView({ behavior: "smooth" }),
    );
  };

  const sendThreadReply = (event: FormEvent) => {
    event.preventDefault();
    if (!threadMessage || !threadComposer.trim()) return;
    const sentAt = new Date().toISOString();
    setMessages((current) => [
      ...current,
      {
        id: createLocalId("reply"),
        conversationId: selected.id,
        senderId: currentMessagingUserId,
        body: threadComposer.trim(),
        sentAt,
        intent: "message",
        parentId: threadMessage.id,
        reactions: [],
      },
    ]);
    setThreadComposer("");
  };

  const resolveResponse = (messageId: string) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? { ...message, responseState: "resolved" }
          : message,
      ),
    );
    setNotice("Response loop closed. It will leave your Needs response view.");
  };

  const toggleReaction = (messageId: string, emoji: string) => {
    setMessages((current) =>
      current.map((message) => {
        if (message.id !== messageId) return message;
        const existing = message.reactions.find(
          (reaction) => reaction.emoji === emoji,
        );
        if (!existing)
          return {
            ...message,
            reactions: [
              ...message.reactions,
              { emoji, userIds: [currentMessagingUserId] },
            ],
          };
        const selectedByUser = existing.userIds.includes(
          currentMessagingUserId,
        );
        return {
          ...message,
          reactions: message.reactions
            .map((reaction) =>
              reaction.emoji === emoji
                ? {
                    ...reaction,
                    userIds: selectedByUser
                      ? reaction.userIds.filter(
                          (userId) => userId !== currentMessagingUserId,
                        )
                      : [...reaction.userIds, currentMessagingUserId],
                  }
                : reaction,
            )
            .filter((reaction) => reaction.userIds.length),
        };
      }),
    );
  };

  const convertToWork = (message: ConversationMessage) => {
    const hubId = selected.hubId ?? "hub-centralops";
    const boardId =
      demoBoards.find((board) => board.hubId === hubId)?.id ?? "inbox";
    const type: CapturedWorkItem["type"] =
      message.intent === "decision"
        ? "decision"
        : message.intent === "request"
          ? "request"
          : "task";
    const item: CapturedWorkItem = {
      id: `capture-message-${message.id}`,
      type,
      title:
        message.body.length > 90
          ? `${message.body.slice(0, 87).trim()}…`
          : message.body,
      hubId,
      boardId,
      owner:
        message.responseOwnerId === currentMessagingUserId
          ? "Mohammed Zaman"
          : personById(message.responseOwnerId ?? currentMessagingUserId).name,
      priority: message.intent === "decision" ? "high" : "normal",
      details: `Created from ${selected.title}. Original message from ${personById(message.senderId).name}: ${message.body}`,
      createdAt: new Date().toISOString(),
      sendToInbox: true,
    };
    storeCapturedWork(item);
    setMessages((current) =>
      current.map((candidate) =>
        candidate.id === message.id
          ? {
              ...candidate,
              linkedWorkId: item.id,
              linkedWorkTitle: item.title,
            }
          : candidate,
      ),
    );
    setNotice(
      `${intentDetails[message.intent].label} added to TREVV work and Inbox.`,
    );
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <main className="messaging-page">
      <header className="messaging-page-header">
        <div>
          <span className="messaging-eyebrow">
            <MessagesSquare size={15} /> Team communication
          </span>
          <h1>Messages</h1>
          <p>
            Talk where the work lives. Requests, decisions, and updates stay
            connected to the Hub they move forward.
          </p>
        </div>
        <div className="messaging-header-actions">
          <button
            className="secondary-button"
            onClick={() => setNewConversationMode("direct")}
          >
            <AtSign size={15} /> New message
          </button>
          <button
            className="primary-button"
            onClick={() => setNewConversationMode("room")}
          >
            <Plus size={15} /> Create room
          </button>
        </div>
      </header>

      {notice && (
        <div className="workflow-toast messaging-toast" role="status">
          <CheckCircle2 size={16} />
          <span>{notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <section className="messaging-focus-bar" aria-label="Message focus">
        <button
          className={focus === "all" ? "active" : ""}
          onClick={() => setFocus("all")}
        >
          All conversations <b>{conversations.length}</b>
        </button>
        <button
          className={focus === "needs-response" ? "active" : ""}
          onClick={() => setFocus("needs-response")}
        >
          <BellRing size={14} /> Needs response <b>{openResponses.length}</b>
        </button>
        <button
          className={focus === "unread" ? "active" : ""}
          onClick={() => setFocus("unread")}
        >
          Unread <b>{totalUnread}</b>
        </button>
        <span>
          <ShieldCheck size={14} /> Hub and guest permissions apply
          automatically
        </span>
      </section>

      <section
        className="messaging-shell"
        aria-label="TREVV messaging workspace"
      >
        <aside className="conversation-rail">
          <header>
            <div>
              <strong>Conversations</strong>
              <span>{openResponses.length} open response loops</span>
            </div>
            <button
              aria-label="Create a room"
              onClick={() => setNewConversationMode("room")}
            >
              <MessageSquarePlus size={16} />
            </button>
          </header>
          <label className="conversation-search">
            <Search size={15} />
            <span className="sr-only">Search conversations and messages</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search messages…"
            />
          </label>
          <div className="conversation-list">
            {visibleConversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === selected.id}
                needsResponse={roomsNeedingResponse.has(conversation.id)}
                latestMessage={latestMessageFor(messages, conversation.id)}
                onSelect={() => chooseConversation(conversation.id)}
              />
            ))}
            {!visibleConversations.length && (
              <div className="conversation-empty">
                <Search size={19} />
                <strong>No conversations match</strong>
                <span>Try another search or focus view.</span>
              </div>
            )}
          </div>
          <button
            className="conversation-archive-link"
            onClick={() =>
              setNotice(
                "There are no archived conversations in this workspace.",
              )
            }
          >
            <Archive size={14} /> Archived conversations
          </button>
        </aside>

        <section className="message-column">
          <header className="conversation-header">
            <div className="conversation-heading-icon">
              {selected.kind === "direct" ? (
                <Avatar
                  personId={otherParticipants[0]?.id ?? currentMessagingUserId}
                />
              ) : selected.kind === "external" ? (
                <Users size={18} />
              ) : (
                <Hash size={18} />
              )}
            </div>
            <div>
              <h2>{selected.title}</h2>
              <p>{selected.purpose}</p>
            </div>
            <div className="conversation-header-meta">
              <span>
                <Users size={14} /> {participants.length}
              </span>
              <span
                className={`room-visibility visibility-${selected.visibility}`}
              >
                {selected.visibility === "private" ? (
                  <LockKeyhole size={12} />
                ) : (
                  <ShieldCheck size={12} />
                )}
                {visibilityLabel(selected.visibility)}
              </span>
              <button
                aria-label="Open room context"
                onClick={() => setContextOpen(true)}
              >
                <Info size={17} />
              </button>
            </div>
          </header>

          <div className="message-timeline" aria-live="polite">
            <div className="conversation-origin">
              <span>
                {selected.kind === "direct" ? (
                  <MessageCircleMore size={20} />
                ) : (
                  <Hash size={20} />
                )}
              </span>
              <div>
                <strong>{selected.title}</strong>
                <p>{selected.purpose}</p>
                {selectedHub && (
                  <Link href={`/app/hubs/${selectedHub.slug}`}>
                    {selectedHub.icon} Open {selectedHub.name} Hub{" "}
                    <ArrowRight size={12} />
                  </Link>
                )}
              </div>
            </div>
            {selectedMessages.map((message, index) => {
              const previous = selectedMessages[index - 1];
              const compact =
                previous?.senderId === message.senderId &&
                new Date(message.sentAt).getTime() -
                  new Date(previous.sentAt).getTime() <
                  10 * 60 * 1000;
              const replyCount = messages.filter(
                (candidate) => candidate.parentId === message.id,
              ).length;
              return (
                <MessageEntry
                  key={message.id}
                  message={message}
                  compact={compact}
                  replyCount={replyCount}
                  onOpenThread={() => setThreadId(message.id)}
                  onResolve={() => resolveResponse(message.id)}
                  onConvert={() => convertToWork(message)}
                  onReact={(emoji) => toggleReaction(message.id, emoji)}
                />
              );
            })}
            <div ref={messageEndRef} />
          </div>

          <form className="message-composer" onSubmit={sendMessage}>
            <div className="composer-mode-row">
              {(Object.keys(intentDetails) as MessageIntent[]).map((mode) => {
                const Icon = intentDetails[mode].icon;
                return (
                  <button
                    type="button"
                    key={mode}
                    className={intent === mode ? `active intent-${mode}` : ""}
                    onClick={() => setIntent(mode)}
                    title={intentDetails[mode].hint}
                  >
                    <Icon size={13} /> {intentDetails[mode].label}
                  </button>
                );
              })}
            </div>
            {(intent === "request" || intent === "decision") && (
              <div className="composer-response-row">
                <BellRing size={13} />
                <span>Response from</span>
                <label>
                  <span className="sr-only">Response owner</span>
                  <select
                    value={effectiveResponseOwnerId}
                    onChange={(event) => setResponseOwnerId(event.target.value)}
                  >
                    {otherParticipants.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={12} />
                </label>
                <span>within 24 hours</span>
              </div>
            )}
            <textarea
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={`Write a ${intentDetails[intent].label.toLocaleLowerCase()} to ${selected.title}…`}
              rows={2}
            />
            <footer>
              <div>
                <button
                  type="button"
                  aria-label="Attach a file"
                  aria-disabled="true"
                  disabled
                  title="Attachments require secure file storage to be connected"
                >
                  <Paperclip size={15} />
                </button>
                <span>⌘ + Enter to send</span>
              </div>
              <button className="composer-send" disabled={!composer.trim()}>
                <Send size={15} /> Send
              </button>
            </footer>
          </form>
        </section>

        <aside
          className={`conversation-context ${threadMessage ? "thread-open" : ""} ${contextOpen ? "mobile-open" : ""}`}
        >
          {threadMessage ? (
            <ThreadPanel
              root={threadMessage}
              replies={threadReplies}
              value={threadComposer}
              onChange={setThreadComposer}
              onSubmit={sendThreadReply}
              onClose={() => setThreadId(null)}
            />
          ) : (
            <RoomContext
              conversation={selected}
              participants={participants.map((person) => person.id)}
              hub={selectedHub}
              openItems={selectedHubItems}
              openLoops={roomOpenLoops}
              onOpenThread={(messageId) => setThreadId(messageId)}
              onClose={() => setContextOpen(false)}
            />
          )}
        </aside>
      </section>

      {newConversationMode && (
        <NewConversationDialog
          mode={newConversationMode}
          projects={scope.hubs}
          onClose={() => setNewConversationMode(null)}
          onCreate={(conversation) => {
            setConversations((current) => [conversation, ...current]);
            setSelectedId(conversation.id);
            setNewConversationMode(null);
            setNotice(
              conversation.kind === "direct"
                ? `Direct conversation with ${conversation.title} is ready.`
                : `${conversation.title} is ready with scoped access.`,
            );
          }}
        />
      )}
    </main>
  );
}

function ConversationRow({
  conversation,
  active,
  needsResponse,
  latestMessage,
  onSelect,
}: {
  conversation: Conversation;
  active: boolean;
  needsResponse: boolean;
  latestMessage?: ConversationMessage | undefined;
  onSelect: () => void;
}) {
  const directPerson = conversation.participantIds.find(
    (id) => id !== currentMessagingUserId,
  );
  return (
    <button
      className={`conversation-row ${active ? "active" : ""}`}
      onClick={onSelect}
      aria-label={`${conversation.title}${conversation.unread ? `, ${conversation.unread} unread` : ""}${needsResponse ? ", needs your response" : ""}`}
    >
      <span className="conversation-row-icon">
        {conversation.kind === "direct" ? (
          <Avatar personId={directPerson ?? currentMessagingUserId} small />
        ) : conversation.kind === "external" ? (
          <Users size={15} />
        ) : (
          <Hash size={15} />
        )}
      </span>
      <span className="conversation-row-copy">
        <span>
          <strong>{conversation.title}</strong>
          <time>{shortTime(conversation.lastActivity)}</time>
        </span>
        <small>{latestMessage?.body ?? conversation.purpose}</small>
        <em>
          {conversation.pinned && <Bookmark size={10} />}
          {needsResponse && (
            <span>
              <BellRing size={10} /> Needs you
            </span>
          )}
        </em>
      </span>
      {conversation.unread > 0 && (
        <b className="conversation-unread">{conversation.unread}</b>
      )}
    </button>
  );
}

function MessageEntry({
  message,
  compact,
  replyCount,
  onOpenThread,
  onResolve,
  onConvert,
  onReact,
}: {
  message: ConversationMessage;
  compact: boolean;
  replyCount: number;
  onOpenThread: () => void;
  onResolve: () => void;
  onConvert: () => void;
  onReact: (emoji: string) => void;
}) {
  const sender = personById(message.senderId);
  const owner = message.responseOwnerId
    ? personById(message.responseOwnerId)
    : undefined;
  const IntentIcon = intentDetails[message.intent].icon;
  const ownsResponse = message.responseOwnerId === currentMessagingUserId;
  return (
    <article
      className={`message-entry ${compact ? "compact" : ""} intent-${message.intent}`}
    >
      <div className="message-avatar-cell">
        {!compact && <Avatar personId={sender.id} />}
      </div>
      <div className="message-content">
        {!compact && (
          <header>
            <strong>{sender.name}</strong>
            <span>{sender.role}</span>
            {sender.external && <em>Guest</em>}
            <time>{messageTime(message.sentAt)}</time>
          </header>
        )}
        {message.intent !== "message" && (
          <span className={`message-intent intent-${message.intent}`}>
            <IntentIcon size={12} /> {intentDetails[message.intent].label}
          </span>
        )}
        <p>{message.body}</p>
        {message.responseState && owner && (
          <div className={`response-contract state-${message.responseState}`}>
            {message.responseState === "resolved" ? (
              <CheckCircle2 size={14} />
            ) : (
              <BellRing size={14} />
            )}
            <span>
              {message.responseState === "resolved"
                ? "Response closed"
                : `${owner.name} · ${responseDueLabel(message.responseDue)}`}
            </span>
            {ownsResponse && message.responseState === "open" && (
              <button onClick={onResolve}>
                <Check size={12} /> Mark answered
              </button>
            )}
          </div>
        )}
        {message.linkedWorkTitle && (
          <Link className="message-work-link" href="/app/my-work">
            <Link2 size={12} /> {message.linkedWorkTitle}{" "}
            <ArrowRight size={11} />
          </Link>
        )}
        <div className="message-reactions">
          {message.reactions.map((reaction) => (
            <button
              key={reaction.emoji}
              className={
                reaction.userIds.includes(currentMessagingUserId)
                  ? "active"
                  : ""
              }
              onClick={() => onReact(reaction.emoji)}
            >
              {reaction.emoji} <b>{reaction.userIds.length}</b>
            </button>
          ))}
          <button
            className="add-reaction"
            aria-label="Add acknowledgement"
            onClick={() => onReact("👍")}
          >
            <SmilePlus size={13} />
          </button>
        </div>
        {replyCount > 0 && (
          <button className="thread-summary" onClick={onOpenThread}>
            <MessageCircleMore size={13} /> {replyCount}{" "}
            {replyCount === 1 ? "reply" : "replies"}
            <span>Open thread</span>
          </button>
        )}
      </div>
      <div className="message-hover-actions">
        <button aria-label="Acknowledge" onClick={() => onReact("👍")}>
          <SmilePlus size={14} />
        </button>
        <button aria-label="Reply in thread" onClick={onOpenThread}>
          <Reply size={14} />
        </button>
        {!message.linkedWorkId && (
          <button aria-label="Turn into work" onClick={onConvert}>
            <Sparkles size={14} />
          </button>
        )}
      </div>
    </article>
  );
}

function RoomContext({
  conversation,
  participants,
  hub,
  openItems,
  openLoops,
  onOpenThread,
  onClose,
}: {
  conversation: Conversation;
  participants: string[];
  hub: (typeof demoHubs)[number] | undefined;
  openItems: typeof demoItems;
  openLoops: ConversationMessage[];
  onOpenThread: (messageId: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <header className="context-header">
        <div>
          <span>Room context</span>
          <strong>What this conversation moves</strong>
        </div>
        <button
          className="mobile-context-close"
          aria-label="Close room context"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      <div className="context-scroll">
        {hub ? (
          <section
            className="context-hub-card"
            style={{ "--room-accent": hub.accent } as React.CSSProperties}
          >
            <header>
              <span>{hub.icon}</span>
              <div>
                <small>{labelForProjectType(hub.type)}</small>
                <strong>{hub.name}</strong>
              </div>
              <span className={`health-label ${hub.health}`}>
                {hub.health.replace("_", " ")}
              </span>
            </header>
            <p>{hub.priority}</p>
            <div>
              <span>
                <b>{openItems.length}</b> open work items
              </span>
              <span>
                <b>
                  {openItems.filter((item) => item.status === "blocked").length}
                </b>{" "}
                blocked
              </span>
            </div>
            <Link href={`/app/hubs/${hub.slug}`}>
              Open project <ArrowRight size={12} />
            </Link>
          </section>
        ) : (
          <section className="context-purpose-card">
            <strong>Room purpose</strong>
            <p>{conversation.purpose}</p>
          </section>
        )}

        <section className="context-section">
          <header>
            <strong>Open response loops</strong>
            <span>{openLoops.length}</span>
          </header>
          {openLoops.length ? (
            openLoops.map((message) => (
              <button
                className="context-open-loop"
                key={message.id}
                onClick={() => onOpenThread(message.id)}
              >
                <span className={`loop-intent intent-${message.intent}`}>
                  {message.intent === "decision" ? (
                    <FileQuestion size={13} />
                  ) : (
                    <BellRing size={13} />
                  )}
                </span>
                <span>
                  <strong>{message.body}</strong>
                  <small>
                    {personById(message.responseOwnerId ?? "").name} ·{" "}
                    {responseDueLabel(message.responseDue)}
                  </small>
                </span>
              </button>
            ))
          ) : (
            <div className="context-empty-state">
              <CheckCircle2 size={17} />
              <span>No unanswered requests or decisions.</span>
            </div>
          )}
        </section>

        <section className="context-section">
          <header>
            <strong>People & access</strong>
            <span>{participants.length}</span>
          </header>
          <div className="context-people">
            {participants.map((id) => {
              const person = personById(id);
              return (
                <div key={id}>
                  <Avatar personId={id} small />
                  <span>
                    <strong>{person.name}</strong>
                    <small>
                      {person.external ? "External guest" : person.role}
                    </small>
                  </span>
                  <i className={`presence-${person.presence}`} />
                </div>
              );
            })}
          </div>
          <div className="context-access-note">
            <ShieldCheck size={14} />
            <span>
              {conversation.visibility === "guest-scoped"
                ? "Guests only see this room and explicitly shared work."
                : conversation.visibility === "private"
                  ? "Only invited participants can open this room."
                  : "Access follows organization and project membership."}
            </span>
          </div>
        </section>
      </div>
    </>
  );
}

function ThreadPanel({
  root,
  replies,
  value,
  onChange,
  onSubmit,
  onClose,
}: {
  root: ConversationMessage;
  replies: ConversationMessage[];
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}) {
  return (
    <>
      <header className="context-header thread-header">
        <div>
          <span>Thread</span>
          <strong>
            {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </strong>
        </div>
        <button aria-label="Close thread" onClick={onClose}>
          <X size={17} />
        </button>
      </header>
      <div className="thread-scroll">
        <ThreadMessage message={root} root />
        <div className="thread-divider">
          <span>
            {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </span>
        </div>
        {replies.map((reply) => (
          <ThreadMessage key={reply.id} message={reply} />
        ))}
      </div>
      <form className="thread-composer" onSubmit={onSubmit}>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Reply in thread…"
          rows={3}
        />
        <footer>
          <span>Keep the room focused</span>
          <button disabled={!value.trim()}>
            <Send size={14} /> Reply
          </button>
        </footer>
      </form>
    </>
  );
}

function ThreadMessage({
  message,
  root = false,
}: {
  message: ConversationMessage;
  root?: boolean;
}) {
  const sender = personById(message.senderId);
  return (
    <article className={`thread-message ${root ? "root" : ""}`}>
      <Avatar personId={sender.id} small />
      <div>
        <header>
          <strong>{sender.name}</strong>
          <time>{messageTime(message.sentAt)}</time>
        </header>
        <p>{message.body}</p>
      </div>
    </article>
  );
}

function NewConversationDialog({
  mode,
  projects,
  onClose,
  onCreate,
}: {
  mode: Exclude<NewConversationMode, null>;
  projects: typeof demoHubs;
  onClose: () => void;
  onCreate: (conversation: Conversation) => void;
}) {
  const currentHubs = projects;
  const availablePeople = messagingPeople.filter(
    (person) => person.id !== currentMessagingUserId,
  );
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [kind, setKind] = useState<ConversationKind>("hub");
  const [hubId, setHubId] = useState(currentHubs[0]?.id ?? "");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [directPersonId, setDirectPersonId] = useState(
    availablePeople.find((person) => !person.external)?.id ?? "",
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === "direct") {
      const person = personById(directPersonId);
      onCreate({
        id: createLocalId("conversation"),
        title: person.name,
        purpose: "Direct conversation",
        kind: "direct",
        participantIds: [currentMessagingUserId, person.id],
        unread: 0,
        visibility: "private",
        lastActivity: new Date().toISOString(),
      });
      return;
    }
    const hub = currentHubs.find((candidate) => candidate.id === hubId);
    onCreate({
      id: createLocalId("conversation"),
      title: title.trim(),
      purpose: purpose.trim(),
      kind,
      participantIds: [currentMessagingUserId, ...participantIds],
      ...(kind === "hub" && hub ? { hubId: hub.id, hubSlug: hub.slug } : {}),
      unread: 0,
      visibility: kind === "external" ? "guest-scoped" : "organization",
      lastActivity: new Date().toISOString(),
    });
  };

  const toggleParticipant = (personId: string) =>
    setParticipantIds((current) =>
      current.includes(personId)
        ? current.filter((id) => id !== personId)
        : [...current, personId],
    );

  return (
    <div
      className="workflow-dialog-layer"
      role="presentation"
      onMouseDown={onClose}
    >
      <form
        className="workflow-dialog messaging-create-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-conversation-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <header>
          <span className="dialog-title-icon">
            {mode === "direct" ? (
              <AtSign size={18} />
            ) : (
              <MessageSquarePlus size={18} />
            )}
          </span>
          <div>
            <p>Messages</p>
            <h2 id="new-conversation-title">
              {mode === "direct"
                ? "Start a direct message"
                : "Create a work room"}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>
        <div className="workflow-dialog-body messaging-create-body">
          {mode === "direct" ? (
            <fieldset className="direct-person-list">
              <legend>Choose a teammate</legend>
              {availablePeople
                .filter((person) => !person.external)
                .map((person) => (
                  <label key={person.id}>
                    <input
                      type="radio"
                      name="direct-person"
                      value={person.id}
                      checked={directPersonId === person.id}
                      onChange={() => setDirectPersonId(person.id)}
                    />
                    <Avatar personId={person.id} small />
                    <span>
                      <strong>{person.name}</strong>
                      <small>{person.role}</small>
                    </span>
                    <i className={`presence-${person.presence}`} />
                  </label>
                ))}
            </fieldset>
          ) : (
            <>
              <div className="form-grid-two">
                <label className="stacked-field">
                  <span>Room name</span>
                  <input
                    autoFocus
                    required
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="e.g. Northstar launch room"
                  />
                </label>
                <label className="stacked-field">
                  <span>Room type</span>
                  <select
                    value={kind}
                    onChange={(event) =>
                      setKind(event.target.value as ConversationKind)
                    }
                  >
                    <option value="hub">Project room</option>
                    <option value="team">Internal team room</option>
                    <option value="external">Guest-scoped room</option>
                  </select>
                </label>
              </div>
              <label className="stacked-field">
                <span>Purpose</span>
                <textarea
                  required
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                  placeholder="What work or outcome should this room move?"
                  rows={3}
                />
              </label>
              {kind === "hub" && (
                <label className="stacked-field">
                  <span>Linked project</span>
                  <select
                    value={hubId}
                    onChange={(event) => setHubId(event.target.value)}
                  >
                    {currentHubs.map((hub) => (
                      <option key={hub.id} value={hub.id}>
                        {hub.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <fieldset className="room-participant-grid">
                <legend>Participants</legend>
                {availablePeople
                  .filter((person) => kind === "external" || !person.external)
                  .map((person) => (
                    <label key={person.id}>
                      <input
                        type="checkbox"
                        checked={participantIds.includes(person.id)}
                        onChange={() => toggleParticipant(person.id)}
                      />
                      <Avatar personId={person.id} small />
                      <span>
                        <strong>{person.name}</strong>
                        <small>
                          {person.external ? "External guest" : person.role}
                        </small>
                      </span>
                    </label>
                  ))}
              </fieldset>
              <div className="room-security-preview">
                <ShieldCheck size={16} />
                <span>
                  {kind === "external"
                    ? "External people receive access only to this room and explicitly shared work."
                    : kind === "hub"
                      ? "Membership stays aligned with the linked project."
                      : "Only workspace members added here can participate."}
                </span>
              </div>
            </>
          )}
        </div>
        <footer className="workflow-dialog-actions">
          <span>
            {mode === "direct"
              ? "Direct messages are private to their participants."
              : "Rooms keep communication tied to an outcome."}
          </span>
          <div>
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="primary-button"
              disabled={
                mode === "direct"
                  ? !directPersonId
                  : !title.trim() || !purpose.trim()
              }
            >
              {mode === "direct" ? "Start message" : "Create room"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function Avatar({
  personId,
  small = false,
}: {
  personId: string;
  small?: boolean;
}) {
  const person = personById(personId);
  return (
    <span
      className={`message-avatar ${small ? "small" : ""}`}
      style={{ background: person.color }}
      title={person.name}
    >
      {person.initials}
      <i className={`presence-${person.presence}`} />
    </span>
  );
}

function latestMessageFor(
  messages: ConversationMessage[],
  conversationId: string,
) {
  return messages
    .filter((message) => message.conversationId === conversationId)
    .sort(
      (left, right) =>
        new Date(right.sentAt).getTime() - new Date(left.sentAt).getTime(),
    )[0];
}

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function oneDayFromNow() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

function visibilityLabel(visibility: Conversation["visibility"]) {
  if (visibility === "private") return "Private";
  if (visibility === "guest-scoped") return "Guest-scoped";
  return "Workspace";
}

function shortTime(value: string) {
  const date = new Date(value);
  if (date.toDateString() === demoNow.toDateString())
    return date.toLocaleTimeString("en", {
      hour: "2-digit",
      minute: "2-digit",
    });
  return date.toLocaleDateString("en", { weekday: "short" });
}

function messageTime(value: string) {
  return new Date(value).toLocaleTimeString("en", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function responseDueLabel(value?: string) {
  if (!value) return "Response requested";
  const due = new Date(value);
  const dayDifference = Math.round(
    (new Date(due.toDateString()).getTime() -
      new Date(demoNow.toDateString()).getTime()) /
      (24 * 60 * 60 * 1000),
  );
  const day =
    dayDifference === 0
      ? "Today"
      : dayDifference === 1
        ? "Tomorrow"
        : due.toLocaleDateString("en", { month: "short", day: "numeric" });
  return `${day}, ${due.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}`;
}
