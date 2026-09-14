"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  ConversationDto,
  CreateConversationInput,
} from "@founderhq/api-contract";
import {
  ArrowLeft,
  ArrowUpRight,
  MessageCircleMore,
  MessagesSquare,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";
import { AppLink as Link } from "@/components/navigation-link";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords } from "@/lib/live-app-data";
import {
  collaborationKeys,
  prioritizeConversations,
  useLiveConversations,
  useLiveTeamDirectory,
} from "@/lib/live-collaboration";
import { useLatestCallback } from "@/lib/use-latest-callback";
import { isLiveAccessLoss, presentLiveError } from "@/lib/live-errors";
import { readAllPages } from "@/lib/read-all-pages";
import {
  directConversationFor,
  personHref,
  recoverChatTabs,
} from "@/lib/people-workspace";
import { teamHref, workspaceHref } from "@/lib/workspace-routes";
import { initials } from "@/lib/team-workspace";
import type { ChatRequest } from "@/lib/floating-chat-context";
import {
  LiveMessagingContent,
  CreateConversationDialog,
} from "./live-messaging-workspace";
import { LiveStateNotice } from "./live-state";
import { PersonIdentity } from "./person-identity";
import styles from "./floating-chat.module.css";

type BrowseTab = "threads" | "people" | "teams";
const browseTabs = [
  { id: "threads", label: "Threads", icon: MessagesSquare },
  { id: "people", label: "People", icon: Users },
  { id: "teams", label: "Teams", icon: Users },
] as const;

export function FloatingChatWindow({
  workspaceSlug,
  request,
  onRequestHandled,
  onClose,
  onBusyChange,
  onWorkspaceChange,
}: {
  workspaceSlug: string;
  request: (ChatRequest & { key: number }) | null;
  onRequestHandled(key: number): void;
  onClose(): void;
  onBusyChange(busy: boolean): void;
  onWorkspaceChange(slug: string): void;
}) {
  const session = useAppSession();
  const data = useLiveAppRecords();
  const cache = useQueryClient();
  const workspace = data.workspaces.find(
    (entry) => entry.slug === workspaceSlug,
  );
  const conversationQuery = useLiveConversations(workspace?.id);
  const directory = useLiveTeamDirectory(workspace?.id);
  const accessLost =
    isLiveAccessLoss(conversationQuery.error) ||
    isLiveAccessLoss(directory.error) ||
    data.accessLost;
  const conversations = useMemo(
    () => (accessLost ? [] : (conversationQuery.data ?? [])),
    [accessLost, conversationQuery.data],
  );
  const members = accessLost ? [] : (directory.data?.availableMembers ?? []);
  const teams = accessLost ? [] : (directory.data?.teams ?? []);
  const canCreate =
    !["viewer", "guest"].includes(session.organization.role) && !accessLost;
  const [browse, setBrowse] = useState<BrowseTab>("threads");
  const [search, setSearch] = useState("");
  const [tabs, setTabs] = useState<{ ids: string[]; activeId: string | null }>({
    ids: [],
    activeId: null,
  });
  const [hydrated, setHydrated] = useState(false);
  const [mobile, setMobile] = useState<"directory" | "conversation">(
    "directory",
  );
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [messageBusy, setMessageBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [limitNotice, setLimitNotice] = useState("");
  const windowRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const handled = useRef<number | null>(null);
  const createAttempt = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  const busy = pending || messageBusy;
  const storageKey = `trevv:chat-tabs:v1:${session.organization.id}:${session.user.id}:${workspace?.id ?? "unavailable"}`;
  const activeConversation = conversations.find(
    (conversation) => conversation.id === tabs.activeId,
  );
  const openTabs = tabs.ids.flatMap((id) => {
    const conversation = conversations.find((entry) => entry.id === id);
    return conversation ? [conversation] : [];
  });
  const filter = search.trim().toLocaleLowerCase();
  const matches = (value: string) =>
    !filter || value.toLocaleLowerCase().includes(filter);
  const presented = error ?? conversationQuery.error ?? directory.error;

  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
  useLayoutEffect(() => {
    windowRef.current?.showPopover?.();
    const previous = document.activeElement as HTMLElement | null;
    windowRef.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setTabs(recoverChatTabs(sessionStorage.getItem(storageKey)));
      } catch {
        /* Session memory remains usable. */
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);
  useEffect(() => {
    if (!hydrated || accessLost) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(tabs));
    } catch {
      /* Keep open tabs in memory. */
    }
  }, [tabs, hydrated, storageKey, accessLost]);

  useEffect(() => {
    if (
      !hydrated ||
      accessLost ||
      !conversationQuery.isSuccess ||
      conversationQuery.isFetching
    )
      return;
    const timer = window.setTimeout(
      () =>
        setTabs((current) => {
          const ids = current.ids.filter((id) =>
            conversations.some((entry) => entry.id === id),
          );
          if (ids.length === current.ids.length) return current;
          return {
            ids,
            activeId: ids.includes(current.activeId ?? "")
              ? current.activeId
              : (ids.at(-1) ?? null),
          };
        }),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [
    hydrated,
    accessLost,
    conversationQuery.isSuccess,
    conversationQuery.isFetching,
    conversations,
  ]);

  const selectConversation = useCallback(
    (conversation: ConversationDto) => {
      setTabs((current) => {
        if (!current.ids.includes(conversation.id) && current.ids.length >= 12)
          return current;
        return {
          ids: current.ids.includes(conversation.id)
            ? current.ids
            : [...current.ids, conversation.id],
          activeId: conversation.id,
        };
      });
      setLimitNotice(
        tabs.ids.length >= 12 && !tabs.ids.includes(conversation.id)
          ? "Close a conversation tab to open another. Your drafts stay saved."
          : "",
      );
      setMobile("conversation");
    },
    [tabs.ids, setTabs, setMobile, setLimitNotice],
  );

  const rememberConversation = useCallback(
    (conversation: ConversationDto) => {
      cache.setQueryData<ConversationDto[]>(
        collaborationKeys.conversations(conversation.workspaceId),
        (current = []) => [
          conversation,
          ...current.filter((entry) => entry.id !== conversation.id),
        ],
      );
      selectConversation(conversation);
    },
    [cache, selectConversation],
  );

  const openDirect = useLatestCallback(async (personId: string) => {
    const person = members.find((entry) => entry.id === personId);
    if (
      !workspace ||
      !person ||
      person.id === session.user.id ||
      inFlight.current ||
      accessLost
    )
      return;
    setError(null);
    inFlight.current = true;
    setPending(true);
    const attemptKey = `${storageKey}:direct:${personId}`;
    try {
      const latest = await readAllPages((cursor) =>
        data.client.conversations({
          workspaceId: workspace.id,
          limit: 100,
          ...(cursor ? { cursor } : {}),
        }),
      );
      let conversation = directConversationFor(
        latest,
        workspace.id,
        session.user.id,
        personId,
      );
      if (!conversation) {
        if (!canCreate)
          throw new Error("Your role cannot start a new private conversation.");
        let key = crypto.randomUUID() as string;
        try {
          const saved = sessionStorage.getItem(attemptKey);
          if (saved && /^[a-f0-9-]{36}$/i.test(saved)) key = saved;
          sessionStorage.setItem(attemptKey, key);
        } catch {
          /* Retry still reconciles the conversation list first. */
        }
        conversation = (
          await data.client.createConversation(
            {
              workspaceId: workspace.id,
              title: `${session.user.name} & ${person.name}`.slice(0, 160),
              kind: "direct",
              purpose: "",
              visibility: "private",
              participantIds: [session.user.id, person.id],
              retentionDays: 365,
            },
            key,
          )
        ).data;
      }
      rememberConversation(conversation);
      try {
        sessionStorage.removeItem(attemptKey);
      } catch {
        /* A retained key remains safe to replay. */
      }
    } catch (reason) {
      setError(reason);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  });

  useEffect(() => {
    if (
      !hydrated ||
      !request ||
      handled.current === request.key ||
      request.workspaceSlug !== workspaceSlug ||
      directory.isLoading ||
      conversationQuery.isLoading ||
      accessLost
    )
      return;
    const timer = window.setTimeout(() => {
      handled.current = request.key;
      if (request.personId) void openDirect(request.personId);
      else if (request.conversationId) {
        const found = conversations.find(
          (entry) => entry.id === request.conversationId,
        );
        if (found) selectConversation(found);
        else
          setError(
            new Error(
              "This conversation is unavailable. Refresh the list or ask a participant to restore access.",
            ),
          );
      }
      onRequestHandled(request.key);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    hydrated,
    request,
    workspaceSlug,
    directory.isLoading,
    conversationQuery.isLoading,
    accessLost,
    openDirect,
    conversations,
    selectConversation,
    onRequestHandled,
  ]);

  async function createThread(input: CreateConversationInput) {
    if (inFlight.current || !canCreate) return false;
    inFlight.current = true;
    setPending(true);
    setError(null);
    const fingerprint = JSON.stringify(input);
    if (createAttempt.current?.fingerprint !== fingerprint)
      createAttempt.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const result = await data.client.createConversation(
        input,
        createAttempt.current.key,
      );
      rememberConversation(result.data);
      setCreating(false);
      createAttempt.current = null;
      return true;
    } catch (reason) {
      setError(reason);
      return false;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <div
      ref={windowRef}
      tabIndex={-1}
      id="floating-chat-window"
      popover="manual"
      role="dialog"
      aria-label="Floating chats"
      className={styles.window}
      data-mobile={mobile}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          !busy &&
          !windowRef.current?.querySelector('[aria-modal="true"]')
        ) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          {mobile === "conversation" ? (
            <button
              type="button"
              className={`${styles.iconButton} ${styles.mobileBack}`}
              aria-label="Back to chat directory"
              disabled={busy}
              onClick={() => setMobile("directory")}
            >
              <ArrowLeft size={18} />
            </button>
          ) : null}
          <MessageCircleMore size={22} aria-hidden="true" />
          <div>
            <h2>Messages</h2>
            <select
              aria-label="Chat workspace"
              value={workspaceSlug}
              disabled={busy}
              onChange={(event) => onWorkspaceChange(event.target.value)}
            >
              {data.workspaces.map((entry) => (
                <option key={entry.id} value={entry.slug}>
                  {entry.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div
          className={styles.headerActions}
          role="group"
          aria-label="Chat window actions"
        >
          <Link
            href={workspaceHref(
              workspaceSlug,
              "messages",
              activeConversation
                ? encodeURIComponent(activeConversation.id)
                : undefined,
            )}
            aria-label="Open in full page"
            title="Open in full page"
            onClick={(event) => {
              if (busy) event.preventDefault();
              else onClose();
            }}
          >
            <ArrowUpRight size={18} />
          </Link>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Minimize chat window"
            title="Minimize"
            disabled={busy}
            onClick={onClose}
          >
            <Minus size={19} />
          </button>
        </div>
      </header>
      {presented ? (
        <div className={styles.notice}>
          <LiveStateNotice
            compact
            {...presentLiveError(presented)}
            actions={
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  void conversationQuery.refetch();
                  void directory.refetch();
                }}
              >
                Refresh chats
              </button>
            }
          />
        </div>
      ) : null}
      {limitNotice ? (
        <p className={styles.notice} role="status">
          {limitNotice}
        </p>
      ) : null}
      <div className={styles.body}>
        <aside className={styles.directory} aria-label="Chat directory">
          <div
            role="tablist"
            aria-label="Chat categories"
            className={styles.primaryTabs}
          >
            {browseTabs.map(({ id, label, icon: Icon }, index) => (
              <button
                type="button"
                role="tab"
                id={`chat-category-${id}`}
                aria-controls="chat-directory-results"
                aria-selected={browse === id}
                tabIndex={browse === id ? 0 : -1}
                key={id}
                onClick={() => setBrowse(id)}
                onKeyDown={(event) => {
                  if (
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  )
                    return;
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? 2
                        : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
                  setBrowse(browseTabs[next]!.id);
                  (
                    event.currentTarget.parentElement?.children[
                      next
                    ] as HTMLElement
                  )?.focus();
                }}
              >
                <Icon size={14} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <label className={styles.search}>
            <Search size={16} aria-hidden="true" />
            <input
              aria-label={`Search ${browse}`}
              placeholder={`Search ${browse}…`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {canCreate ? (
            <button
              type="button"
              className={styles.newThread}
              disabled={busy || !directory.data || Boolean(directory.error)}
              onClick={() => {
                setError(null);
                setCreating(true);
              }}
            >
              <Plus size={18} />
              New thread
            </button>
          ) : null}
          <div
            role="tabpanel"
            id="chat-directory-results"
            aria-labelledby={`chat-category-${browse}`}
            className={styles.rows}
          >
            {conversationQuery.isLoading || directory.isLoading ? (
              <p role="status">Loading chats…</p>
            ) : null}
            {browse === "threads"
              ? prioritizeConversations(conversations)
                  .filter((entry) =>
                    matches(
                      `${entry.title} ${entry.purpose} ${entry.participants.map((member) => member.user.name).join(" ")}`,
                    ),
                  )
                  .map((entry) => (
                    <div className={styles.row} key={entry.id}>
                      <button
                        type="button"
                        disabled={busy || !hydrated}
                        onClick={() => selectConversation(entry)}
                      >
                        <span className={styles.avatar}>
                          <MessageCircleMore size={17} />
                        </span>
                        <span>
                          <strong>{entry.title}</strong>
                          <small>
                            {entry.kind === "direct"
                              ? "Private conversation"
                              : `${entry.participants.length} participants`}
                            {entry.needsResponseCount
                              ? ` · ${entry.needsResponseCount} need a response`
                              : ""}
                          </small>
                        </span>
                        {entry.unreadCount ? (
                          <span
                            className={styles.unread}
                            aria-label={`${entry.unreadCount} unread`}
                          >
                            {Math.min(99, entry.unreadCount)}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  ))
              : null}
            {browse === "people"
              ? members
                  .filter(
                    (person) =>
                      person.id !== session.user.id &&
                      matches(`${person.name} ${person.email}`),
                  )
                  .map((person) => (
                    <div className={styles.row} key={person.id}>
                      <span className={styles.avatar}>
                        {initials(person.name)}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <PersonIdentity
                          userId={person.id}
                          name={person.name}
                          workspaceSlug={workspaceSlug}
                        />
                        <small>
                          {person.organizationRole.replaceAll("_", " ")}
                        </small>
                        <Link href={personHref(workspaceSlug, person.id)}>
                          View profile
                        </Link>
                      </div>
                      <button
                        type="button"
                        aria-label={`Chat with ${person.name}`}
                        disabled={
                          busy ||
                          (!canCreate &&
                            !directConversationFor(
                              conversations,
                              workspace!.id,
                              session.user.id,
                              person.id,
                            ))
                        }
                        onClick={() => void openDirect(person.id)}
                        style={{ flex: "0 0 auto" }}
                      >
                        <MessageCircleMore size={18} />
                      </button>
                    </div>
                  ))
              : null}
            {browse === "teams"
              ? teams
                  .filter((team) => matches(`${team.name} ${team.purpose}`))
                  .map((team) => (
                    <div className={styles.row} key={team.id}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong>{team.name}</strong>
                        <small>
                          {team.members.length} members
                          {team.room ? "" : " · Room unavailable"}
                        </small>
                        <Link href={teamHref(workspaceSlug, team.id)}>
                          Open team
                        </Link>
                      </div>
                      <button
                        type="button"
                        aria-label={`Open ${team.name} chat`}
                        disabled={busy || !team.room}
                        onClick={() => {
                          const room = conversations.find(
                            (entry) => entry.id === team.room?.conversationId,
                          );
                          if (room) selectConversation(room);
                          else {
                            setError(
                              new Error(
                                "The team room is not available. Refresh chats to check your access.",
                              ),
                            );
                          }
                        }}
                        style={{ flex: "0 0 auto" }}
                      >
                        <MessageCircleMore size={18} />
                      </button>
                    </div>
                  ))
              : null}
            {!conversationQuery.isLoading &&
            !directory.isLoading &&
            !accessLost &&
            !(browse === "threads"
              ? conversations.some((entry) =>
                  matches(
                    `${entry.title} ${entry.purpose} ${entry.participants.map((member) => member.user.name).join(" ")}`,
                  ),
                )
              : browse === "people"
                ? members.some(
                    (person) =>
                      person.id !== session.user.id &&
                      matches(`${person.name} ${person.email}`),
                  )
                : teams.some((team) =>
                    matches(`${team.name} ${team.purpose}`),
                  )) ? (
              <p>
                No {browse} found.
                {browse === "people"
                  ? " Invite people from the Teams page to start working together."
                  : ""}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className={styles.newThread}
            disabled={conversationQuery.isFetching || directory.isFetching}
            onClick={() => {
              void conversationQuery.refetch();
              void directory.refetch();
            }}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </aside>
        <section
          className={styles.conversation}
          aria-label="Open conversations"
        >
          <div className={styles.tabBar}>
            <div
              role={openTabs.length ? "tablist" : "group"}
              aria-label="Open chat tabs"
              className={styles.chatTabs}
            >
              {openTabs.map((entry, index) => (
                <div
                  key={entry.id}
                  className={styles.chatTab}
                  data-active={entry.id === activeConversation?.id}
                >
                  <button
                    type="button"
                    role="tab"
                    id={`chat-tab-${entry.id}`}
                    tabIndex={entry.id === activeConversation?.id ? 0 : -1}
                    aria-selected={entry.id === activeConversation?.id}
                    aria-controls="floating-chat-conversation"
                    disabled={busy}
                    onClick={() => selectConversation(entry)}
                    onKeyDown={(event) => {
                      if (
                        !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                          event.key,
                        ) ||
                        busy
                      )
                        return;
                      event.preventDefault();
                      const nextIndex =
                        event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? openTabs.length - 1
                            : (index +
                                (event.key === "ArrowRight"
                                  ? 1
                                  : openTabs.length - 1)) %
                              openTabs.length;
                      const next = openTabs[nextIndex];
                      if (next) {
                        selectConversation(next);
                        document.getElementById(`chat-tab-${next.id}`)?.focus();
                      }
                    }}
                  >
                    {entry.title}
                  </button>
                </div>
              ))}
            </div>
            {activeConversation ? (
              <button
                type="button"
                className={styles.iconButton}
                aria-label={`Close ${activeConversation.title} tab`}
                disabled={busy}
                onClick={() =>
                  setTabs((current) => {
                    const ids = current.ids.filter(
                      (id) => id !== activeConversation.id,
                    );
                    return { ids, activeId: ids.at(-1) ?? null };
                  })
                }
              >
                <X size={15} />
              </button>
            ) : null}
          </div>
          <div
            id="floating-chat-conversation"
            role="tabpanel"
            aria-label={activeConversation?.title ?? "Conversation"}
            className={styles.conversationContent}
          >
            {activeConversation && hydrated && !accessLost ? (
              <LiveMessagingContent
                key={activeConversation.id}
                workspaceSlug={workspaceSlug}
                embedded
                floating
                conversationId={activeConversation.id}
                onBusyChange={setMessageBusy}
                onConversationSelected={rememberConversation}
              />
            ) : (
              <div className={styles.empty}>
                <MessagesSquare size={34} aria-hidden="true" />
                <h3>
                  {accessLost
                    ? "Chat access changed"
                    : "Keep the conversation close"}
                </h3>
                <p>
                  {accessLost
                    ? "Refresh chats to check your access."
                    : "Choose a thread, find a person or open a team room. Your work stays on this page."}
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
      {creating && workspace && !accessLost ? (
        <CreateConversationDialog
          currentUserId={session.user.id}
          initialKind="workspace"
          members={members}
          notice={error ? presentLiveError(error) : null}
          pending={pending}
          workspaceId={workspace.id}
          onClose={() => {
            if (!pending) setCreating(false);
          }}
          onSubmit={createThread}
        />
      ) : null}
    </div>
  );
}
