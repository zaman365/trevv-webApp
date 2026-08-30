"use client";

import type {
  ConversationDto,
  ConversationMessageDto,
  CreateConversationInput,
  CreateConversationMessageInput,
  PaginatedConversationMessages,
} from "@founderhq/api-contract";
import { TrevvApiError } from "@founderhq/api-client";
import {
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleUserRound,
  Crown,
  Hash,
  Info,
  MessageCircleMore,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Reply,
  Send,
  ShieldCheck,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { useAppSession } from "@/lib/app-session-context";
import {
  collaborationKeys,
  clampConversationRailWidth,
  conversationRailWidth,
  conversationGroupFor,
  defaultLiveConversationLayoutPreference,
  liveConversationLayoutStorageKey,
  liveMessageDraftStorageKey,
  mergeConversationMessagePages,
  parseLiveConversationLayoutPreference,
  prioritizeConversations,
  useAccessibleDialog,
  useLiveConversation,
  useLiveConversationMessages,
  useLiveConversations,
  useLiveTeamDirectory,
  type ConversationGroup,
} from "@/lib/live-collaboration";
import { useLiveAppData } from "@/lib/live-app-data";
import { presentLiveError } from "@/lib/live-errors";
import {
  isLiveDraftEnvelope,
  type LiveDraftEnvelope,
} from "@/lib/live-workflow-ui";
import { workspaceHref } from "@/lib/workspace-routes";
import { LiveStateNotice, type LiveStateKind } from "./live-state";
import { WorkspaceFrame } from "./workspace-frame";
import styles from "./live-collaboration.module.css";

interface MessageDraft {
  body: string;
  clientMessageId: string;
  parentMessageId: string;
  attemptedFingerprint: string;
}

interface OptimisticDelivery {
  body: string;
  clientMessageId: string;
  conversationId: string;
  createdAt: string;
  parentMessageId: string;
  status: "sending" | "failed";
}

const conversationGroups: Array<{
  key: ConversationGroup;
  label: string;
  icon: typeof Users;
}> = [
  { key: "teams", label: "Teams", icon: Users },
  { key: "rooms", label: "Rooms", icon: Hash },
  { key: "people", label: "People", icon: CircleUserRound },
];

function emptyDraft(): MessageDraft {
  return {
    body: "",
    clientMessageId: crypto.randomUUID(),
    parentMessageId: "",
    attemptedFingerprint: "",
  };
}

export function LiveMessagingWorkspace({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const session = useAppSession();
  const liveData = useLiveAppData();
  const queryClient = useQueryClient();
  const workspace = liveData.workspaces.find(
    (record) => record.slug === workspaceSlug,
  );
  const conversationsQuery = useLiveConversations(workspace?.id);
  const directoryQuery = useLiveTeamDirectory(workspace?.id);
  const conversationListAccessLost =
    conversationsQuery.error instanceof TrevvApiError &&
    [401, 403, 404].includes(conversationsQuery.error.status);
  const conversations = useMemo(
    () => (conversationListAccessLost ? [] : (conversationsQuery.data ?? [])),
    [conversationListAccessLost, conversationsQuery.data],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const effectiveSelectedId =
    selectedId && conversations.some((item) => item.id === selectedId)
      ? selectedId
      : (conversations[0]?.id ?? null);
  const selectedSummary = conversations.find(
    (conversation) => conversation.id === effectiveSelectedId,
  );
  const conversationQuery = useLiveConversation(
    workspace?.id,
    effectiveSelectedId ?? undefined,
  );
  const conversationAccessLost =
    conversationQuery.error instanceof TrevvApiError &&
    [401, 403, 404].includes(conversationQuery.error.status);
  const selectedConversationCandidate = conversationAccessLost
    ? undefined
    : (conversationQuery.data ?? selectedSummary);
  const [threadTarget, setThreadTarget] = useState<{
    conversationId: string;
    messageId: string;
  } | null>(null);
  const activeThreadId =
    threadTarget &&
    threadTarget.conversationId === selectedConversationCandidate?.id
      ? threadTarget.messageId
      : null;
  const messageQuery = useLiveConversationMessages(
    workspace?.id,
    selectedConversationCandidate?.id,
  );
  const threadQuery = useLiveConversationMessages(
    workspace?.id,
    selectedConversationCandidate?.id,
    {
      enabled: Boolean(activeThreadId),
      ...(activeThreadId ? { parentMessageId: activeThreadId } : {}),
    },
  );
  const messageAccessLost =
    messageQuery.error instanceof TrevvApiError &&
    [401, 403, 404].includes(messageQuery.error.status);
  const selectedConversation = messageAccessLost
    ? undefined
    : selectedConversationCandidate;
  const messages = useMemo(
    () => mergeConversationMessagePages(messageQuery.data?.pages),
    [messageQuery.data?.pages],
  );
  const threadAccessLost =
    threadQuery.error instanceof TrevvApiError &&
    [401, 403, 404].includes(threadQuery.error.status);
  const threadMessages = useMemo(
    () =>
      threadAccessLost
        ? []
        : mergeConversationMessagePages(threadQuery.data?.pages),
    [threadAccessLost, threadQuery.data?.pages],
  );
  const activeThreadRoot = activeThreadId
    ? messages.find((message) => message.id === activeThreadId)
    : undefined;
  const [createOpen, setCreateOpen] = useState(false);
  const [createConversationKind, setCreateConversationKind] = useState<
    "direct" | "workspace"
  >("direct");
  const [contextOpen, setContextOpen] = useState(false);
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [conversationRailCollapsed, setConversationRailCollapsed] = useState(
    defaultLiveConversationLayoutPreference.conversationRailCollapsed,
  );
  const [conversationRailWidthValue, setConversationRailWidthValue] = useState(
    defaultLiveConversationLayoutPreference.conversationRailWidth,
  );
  const [layoutHydratedKey, setLayoutHydratedKey] = useState("");
  const [notice, setNotice] = useState<{
    kind: LiveStateKind;
    title: string;
    description?: string;
  } | null>(null);
  const [pendingAction, setPendingAction] = useState("");
  const [delivery, setDelivery] = useState<OptimisticDelivery | null>(null);
  const [draft, setDraft] = useState<MessageDraft>(() => emptyDraft());
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [hydratedDraftKey, setHydratedDraftKey] = useState("");
  const markedReadRef = useRef("");
  const timelineRef = useRef<HTMLDivElement>(null);
  const contextToggleRef = useRef<HTMLButtonElement>(null);
  const loadingHistoryRef = useRef(false);
  const followTimelineRef = useRef(true);
  const previousConversationRef = useRef<string | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const canCreateConversation = canCreateMessages(session.organization.role);
  const canSendMessage = session.organization.role !== "viewer";
  const timezone = session.organization.timezone ?? "UTC";
  const layoutStorageKey = workspace
    ? liveConversationLayoutStorageKey({
        organizationId: session.organization.id,
        userId: session.user.id,
        workspaceId: workspace.id,
      })
    : "";
  const draftStorageKey = selectedConversation
    ? liveMessageDraftStorageKey({
        organizationId: session.organization.id,
        userId: session.user.id,
        conversationId: selectedConversation.id,
      })
    : "";
  const draftHydrated =
    Boolean(draftStorageKey) && hydratedDraftKey === draftStorageKey;

  useEffect(() => {
    let preference = { ...defaultLiveConversationLayoutPreference };
    if (layoutStorageKey) {
      try {
        preference = parseLiveConversationLayoutPreference(
          window.localStorage.getItem(layoutStorageKey),
        );
      } catch {
        // A blocked preference store must not block collaboration.
      }
    }
    const timer = window.setTimeout(() => {
      setConversationRailCollapsed(preference.conversationRailCollapsed);
      setConversationRailWidthValue(preference.conversationRailWidth);
      setLayoutHydratedKey(layoutStorageKey);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [layoutStorageKey]);

  useEffect(() => {
    if (!layoutStorageKey || layoutHydratedKey !== layoutStorageKey) return;
    try {
      window.localStorage.setItem(
        layoutStorageKey,
        JSON.stringify({
          version: 1,
          conversationRailCollapsed,
          conversationRailWidth: conversationRailWidthValue,
        }),
      );
    } catch {
      // Layout preferences are optional and never business state.
    }
  }, [
    conversationRailCollapsed,
    conversationRailWidthValue,
    layoutHydratedKey,
    layoutStorageKey,
  ]);

  useEffect(
    () => () => {
      resizeCleanupRef.current?.();
    },
    [],
  );

  useEffect(() => {
    let recovered: LiveDraftEnvelope<MessageDraft> | null = null;
    if (draftStorageKey) {
      try {
        const value = window.localStorage.getItem(draftStorageKey);
        if (value) {
          const parsed: unknown = JSON.parse(value);
          if (isLiveDraftEnvelope(parsed, isMessageDraft)) recovered = parsed;
        }
      } catch {
        // Draft recovery is best effort; conversation state is always remote.
      }
    }
    const next = recovered?.payload ?? emptyDraft();
    const timer = window.setTimeout(() => {
      setDelivery(null);
      setDraft(next);
      setIdempotencyKey(recovered?.idempotencyKey ?? crypto.randomUUID());
      setHydratedDraftKey(draftStorageKey);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [draftStorageKey]);

  useEffect(() => {
    if (!draftHydrated || !draftStorageKey) return;
    persistMessageDraft(draftStorageKey, draft, idempotencyKey);
  }, [draft, draftHydrated, draftStorageKey, idempotencyKey]);

  useEffect(() => {
    if (!delivery) return;
    if (delivery.conversationId !== selectedConversation?.id) return;
    const authoritativeMessages = delivery.parentMessageId
      ? threadMessages
      : messages;
    if (
      authoritativeMessages.some(
        (message) => message.clientMessageId === delivery.clientMessageId,
      )
    ) {
      clearMessageDraft(draftStorageKey);
      const timer = window.setTimeout(() => {
        setDelivery(null);
        setDraft(emptyDraft());
        setIdempotencyKey(crypto.randomUUID());
        setNotice({
          kind: "saved",
          title: "Recovered sent message",
          description:
            "TREVV found the server-confirmed message without duplicating it.",
        });
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [
    delivery,
    draftStorageKey,
    messages,
    selectedConversation?.id,
    threadMessages,
  ]);

  useEffect(() => {
    const latest = [...messages, ...threadMessages]
      .sort((left, right) => left.sequence - right.sequence)
      .at(-1);
    if (
      !workspace ||
      !selectedConversation ||
      !latest ||
      selectedConversation.unreadCount < 1
    )
      return;
    const fingerprint = `${selectedConversation.id}:${latest.id}`;
    if (markedReadRef.current === fingerprint) return;
    markedReadRef.current = fingerprint;
    liveData.client
      .markConversationRead(
        selectedConversation.id,
        latest.id,
        crypto.randomUUID(),
      )
      .then(() =>
        queryClient.invalidateQueries({
          queryKey: collaborationKeys.conversations(workspace!.id),
        }),
      )
      .catch(() => {
        markedReadRef.current = "";
      });
  }, [
    liveData.client,
    messages,
    queryClient,
    selectedConversation,
    threadMessages,
    workspace,
  ]);

  useEffect(() => {
    if (loadingHistoryRef.current) return;
    const conversationChanged =
      previousConversationRef.current !== effectiveSelectedId;
    previousConversationRef.current = effectiveSelectedId;
    if (!conversationChanged && !followTimelineRef.current) return;
    timelineRef.current?.scrollTo({
      top: timelineRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [delivery?.clientMessageId, effectiveSelectedId, messages.length]);

  async function loadEarlierMessages() {
    const timeline = timelineRef.current;
    if (!timeline || messageQuery.isFetchingNextPage) return;
    const previousHeight = timeline.scrollHeight;
    const previousTop = timeline.scrollTop;
    loadingHistoryRef.current = true;
    try {
      await messageQuery.fetchNextPage();
      window.requestAnimationFrame(() => {
        timeline.scrollTop =
          previousTop + Math.max(0, timeline.scrollHeight - previousHeight);
        loadingHistoryRef.current = false;
      });
    } catch {
      loadingHistoryRef.current = false;
    }
  }

  async function refreshConversation() {
    if (!workspace || !selectedConversation) return;
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.conversations(workspace.id),
      }),
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.conversation(
          workspace.id,
          selectedConversation.id,
        ),
      }),
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.messages(
          workspace.id,
          selectedConversation.id,
        ),
      }),
    ]);
  }

  function updateDraft(body: string) {
    const nextFingerprint = messageFingerprint({ ...draft, body });
    const changedAfterAttempt =
      Boolean(draft.attemptedFingerprint) &&
      nextFingerprint !== draft.attemptedFingerprint;
    setDraft((current) => ({
      ...current,
      body,
      ...(changedAfterAttempt
        ? {
            clientMessageId: crypto.randomUUID(),
            attemptedFingerprint: "",
          }
        : {}),
    }));
    if (changedAfterAttempt) {
      setIdempotencyKey(crypto.randomUUID());
      setDelivery(null);
      setNotice(null);
    }
  }

  function setReplyTarget(parentMessageId: string) {
    const next = { ...draft, parentMessageId };
    const changedAfterAttempt =
      Boolean(draft.attemptedFingerprint) &&
      messageFingerprint(next) !== draft.attemptedFingerprint;
    setDraft({
      ...next,
      ...(changedAfterAttempt
        ? {
            clientMessageId: crypto.randomUUID(),
            attemptedFingerprint: "",
          }
        : {}),
    });
    if (changedAfterAttempt) {
      setIdempotencyKey(crypto.randomUUID());
      setDelivery(null);
      setNotice(null);
    }
  }

  function openThread(parentMessageId: string) {
    if (!selectedConversation) return;
    setThreadTarget({
      conversationId: selectedConversation.id,
      messageId: parentMessageId,
    });
    setReplyTarget(parentMessageId);
  }

  function openConversationCreator(kind: "direct" | "workspace") {
    setNotice(null);
    setCreateConversationKind(kind);
    setCreateOpen(true);
  }

  function beginConversationRailResize(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeCleanupRef.current?.();
    const startX = event.clientX;
    const startWidth = conversationRailWidthValue;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const move = (pointerEvent: PointerEvent) => {
      setConversationRailWidthValue(
        clampConversationRailWidth(startWidth + pointerEvent.clientX - startX),
      );
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      resizeCleanupRef.current = null;
    };
    resizeCleanupRef.current = stop;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !selectedConversation ||
      !workspace ||
      !draftHydrated ||
      !draft.body.trim() ||
      pendingAction === "send"
    )
      return;
    const attempted = {
      ...draft,
      body: draft.body.trim(),
      attemptedFingerprint: messageFingerprint(draft),
    };
    setDraft(attempted);
    persistMessageDraft(draftStorageKey, attempted, idempotencyKey);
    setDelivery({
      body: attempted.body,
      clientMessageId: attempted.clientMessageId,
      conversationId: selectedConversation.id,
      createdAt: new Date().toISOString(),
      parentMessageId: attempted.parentMessageId,
      status: "sending",
    });
    followTimelineRef.current = true;
    setPendingAction("send");
    setNotice(null);
    const input: CreateConversationMessageInput = {
      clientMessageId: attempted.clientMessageId,
      body: attempted.body,
      intent: "message",
      metadata: {},
      ...(attempted.parentMessageId
        ? { parentMessageId: attempted.parentMessageId }
        : {}),
    };
    try {
      const result = await liveData.client.sendConversationMessage(
        selectedConversation.id,
        input,
        idempotencyKey,
      );
      replaceMessageInCache(
        queryClient,
        collaborationKeys.messages(
          workspace.id,
          selectedConversation.id,
          attempted.parentMessageId || undefined,
        ),
        result.data,
      );
      setDelivery(null);
      clearMessageDraft(draftStorageKey);
      setDraft(emptyDraft());
      setIdempotencyKey(crypto.randomUUID());
      setNotice({
        kind: "saved",
        title: result.replayed ? "Recovered sent message" : "Message sent",
        description: result.replayed
          ? "TREVV recovered the original server-confirmed result without duplicating it."
          : "The server confirmed this message.",
      });
      await refreshConversation();
    } catch (reason) {
      const confirmed = findMessageInCache(
        queryClient,
        collaborationKeys.messages(
          workspace.id,
          selectedConversation.id,
          attempted.parentMessageId || undefined,
        ),
        attempted.clientMessageId,
      );
      if (confirmed) {
        setDelivery(null);
        clearMessageDraft(draftStorageKey);
        setDraft(emptyDraft());
        setIdempotencyKey(crypto.randomUUID());
        setNotice({
          kind: "saved",
          title: "Recovered sent message",
          description:
            "TREVV found the server-confirmed message without duplicating it.",
        });
        return;
      }
      setDelivery((current) =>
        current ? { ...current, status: "failed" } : current,
      );
      const presented = presentLiveError(reason);
      setNotice({
        kind: presented.kind,
        title: presented.title,
        description: `${presented.description} Your draft is still available.`,
      });
    } finally {
      setPendingAction("");
    }
  }

  async function toggleReaction(
    message: ConversationMessageDto,
    emoji: string,
  ) {
    if (!workspace || pendingAction) return;
    const existing = message.reactions.find(
      (reaction) => reaction.emoji === emoji,
    );
    setPendingAction(`reaction:${message.id}:${emoji}`);
    setNotice(null);
    try {
      const result = existing?.reactedByCurrentUser
        ? await liveData.client.removeMessageReaction(
            message.id,
            emoji,
            message.version,
            crypto.randomUUID(),
          )
        : await liveData.client.addMessageReaction(
            message.id,
            emoji,
            message.version,
            crypto.randomUUID(),
          );
      replaceMessageInCache(
        queryClient,
        collaborationKeys.messages(
          workspace.id,
          message.conversationId,
          message.parentMessageId,
        ),
        result.data,
      );
      await refreshConversation();
    } catch (reason) {
      const presented = presentLiveError(reason);
      setNotice({
        kind: presented.kind,
        title: presented.title,
        description: presented.description,
      });
    } finally {
      setPendingAction("");
    }
  }

  async function toggleResponse(message: ConversationMessageDto) {
    if (!workspace || pendingAction || message.responseState === "cancelled")
      return;
    const responseState =
      message.responseState === "resolved" ? "open" : "resolved";
    setPendingAction(`response:${message.id}`);
    setNotice(null);
    try {
      const result = await liveData.client.setMessageResponse(
        message.id,
        responseState,
        message.version,
        crypto.randomUUID(),
      );
      replaceMessageInCache(
        queryClient,
        collaborationKeys.messages(
          workspace.id,
          message.conversationId,
          message.parentMessageId,
        ),
        result.data,
      );
      setNotice({
        kind: "saved",
        title:
          responseState === "resolved"
            ? "Response marked resolved"
            : "Response reopened",
      });
      await refreshConversation();
    } catch (reason) {
      const presented = presentLiveError(reason);
      setNotice({
        kind: presented.kind,
        title: presented.title,
        description: presented.description,
      });
    } finally {
      setPendingAction("");
    }
  }

  async function createConversation(input: CreateConversationInput) {
    setPendingAction("create-conversation");
    setNotice(null);
    try {
      const result = await liveData.client.createConversation(
        input,
        crypto.randomUUID(),
      );
      queryClient.setQueryData<ConversationDto[]>(
        collaborationKeys.conversations(input.workspaceId),
        (current = []) => [
          result.data,
          ...current.filter((item) => item.id !== result.data.id),
        ],
      );
      setCreateOpen(false);
      setSelectedId(result.data.id);
      setMobileThreadOpen(true);
      setNotice({
        kind: "saved",
        title: `“${result.data.title}” was created`,
        description: "Participants and retention are now stored on the server.",
      });
      await queryClient.invalidateQueries({
        queryKey: collaborationKeys.conversations(input.workspaceId),
      });
      return true;
    } catch (reason) {
      const presented = presentLiveError(reason);
      setNotice({
        kind: presented.kind,
        title: presented.title,
        description: presented.description,
      });
      return false;
    } finally {
      setPendingAction("");
    }
  }

  async function removeConversationParticipant(userId: string) {
    if (!workspace || !selectedConversation || pendingAction) return;
    setPendingAction(`participant:${userId}`);
    setNotice(null);
    try {
      const result = await liveData.client.removeConversationParticipant(
        selectedConversation.id,
        userId,
        selectedConversation.version,
        crypto.randomUUID(),
      );
      queryClient.setQueryData(
        collaborationKeys.conversation(workspace.id, selectedConversation.id),
        result.data,
      );
      queryClient.setQueryData<ConversationDto[]>(
        collaborationKeys.conversations(workspace.id),
        (current = []) =>
          current.map((conversation) =>
            conversation.id === result.data.id ? result.data : conversation,
          ),
      );
      setNotice({
        kind: "saved",
        title: "Participant removed",
        description:
          "The server removed this person from the room and future room access.",
      });
      await refreshConversation();
    } catch (reason) {
      const presented = presentLiveError(reason);
      setNotice({
        kind: presented.kind,
        title: presented.title,
        description: presented.description,
      });
    } finally {
      setPendingAction("");
    }
  }

  async function transferConversationOwnership(userId: string) {
    if (!workspace || !selectedConversation || pendingAction) return;
    setPendingAction(`participant:${userId}`);
    setNotice(null);
    try {
      const result = await liveData.client.setConversationParticipant(
        selectedConversation.id,
        userId,
        selectedConversation.version,
        crypto.randomUUID(),
        "owner",
      );
      queryClient.setQueryData(
        collaborationKeys.conversation(workspace.id, selectedConversation.id),
        result.data,
      );
      queryClient.setQueryData<ConversationDto[]>(
        collaborationKeys.conversations(workspace.id),
        (current = []) =>
          current.map((conversation) =>
            conversation.id === result.data.id ? result.data : conversation,
          ),
      );
      setNotice({
        kind: "saved",
        title: "Conversation owner transferred",
        description:
          "The selected participant can now manage this room. The previous owner remains a member.",
      });
      await refreshConversation();
    } catch (reason) {
      const presented = presentLiveError(reason);
      setNotice({
        kind: presented.kind,
        title: presented.title,
        description: presented.description,
      });
    } finally {
      setPendingAction("");
    }
  }

  if (!workspace) {
    return (
      <WorkspaceFrame active="messages" workspaceSlug={workspaceSlug}>
        <main className={styles.routeMain}>
          <LiveStateNotice
            kind="permission-loss"
            title="Workspace not available"
            description="This workspace is outside your current access or no longer exists."
          />
        </main>
      </WorkspaceFrame>
    );
  }

  const queryError =
    conversationsQuery.error ??
    directoryQuery.error ??
    conversationQuery.error ??
    messageQuery.error;
  const presentedQueryError = queryError ? presentLiveError(queryError) : null;
  const grouped = groupConversations(conversations);
  const emptyPromptGroup = conversationGroups.find(
    ({ key }) => grouped[key].length === 0,
  )?.key;

  return (
    <WorkspaceFrame active="messages" workspaceSlug={workspaceSlug}>
      <main className={styles.messagePage} data-testid="live-messages">
        <header className={styles.pageHeader}>
          <div>
            <p>{workspace.name} / Collaboration</p>
            <h1>Messages</h1>
            <span>
              Contextual Team rooms, work rooms, and direct conversations.
            </span>
          </div>
          {canCreateConversation ? (
            <button
              className="primary-button"
              disabled={
                pendingAction === "send" ||
                directoryQuery.isLoading ||
                Boolean(directoryQuery.error)
              }
              onClick={() => {
                openConversationCreator("direct");
              }}
              type="button"
            >
              <Plus size={16} /> New message
            </button>
          ) : null}
        </header>

        <div className={styles.messageNotices}>
          {notice ? (
            <LiveStateNotice
              kind={notice.kind}
              title={notice.title}
              {...(notice.description
                ? { description: notice.description }
                : {})}
              {...(notice.kind === "version-conflict" && selectedConversation
                ? {
                    actions: (
                      <button
                        onClick={() => void refreshConversation()}
                        type="button"
                      >
                        Load latest
                      </button>
                    ),
                  }
                : {})}
            />
          ) : null}
          {presentedQueryError ? (
            <LiveStateNotice
              {...presentedQueryError}
              {...(conversationsQuery.dataUpdatedAt > 0
                ? {
                    lastSyncedAt: new Date(conversationsQuery.dataUpdatedAt),
                  }
                : {})}
              actions={
                <button
                  onClick={() =>
                    void Promise.all([
                      conversationsQuery.refetch(),
                      directoryQuery.refetch(),
                    ])
                  }
                  type="button"
                >
                  Retry
                </button>
              }
            />
          ) : null}
        </div>

        <section
          aria-label="Messaging workspace"
          className={styles.messageLayout}
          data-conversation-rail={
            conversationRailCollapsed ? "collapsed" : "open"
          }
          data-mobile-thread={mobileThreadOpen ? "open" : "list"}
          style={
            {
              "--conversation-rail-width": `${conversationRailWidthValue}px`,
            } as CSSProperties
          }
        >
          <aside
            className={styles.conversationRail}
            id="live-conversation-rail"
          >
            <header>
              <div>
                <p>Conversations</p>
                {conversations.length > 0 ? (
                  <strong>{conversations.length}</strong>
                ) : null}
              </div>
              <div className={styles.railActions}>
                <button
                  aria-label="Refresh conversations"
                  disabled={conversationsQuery.isFetching}
                  onClick={() => void conversationsQuery.refetch()}
                  type="button"
                >
                  <RefreshCw size={15} />
                </button>
                <button
                  aria-controls="live-conversation-rail"
                  aria-expanded="true"
                  aria-label="Collapse conversations"
                  className={styles.tabletRailCollapse}
                  onClick={() => setConversationRailCollapsed(true)}
                  type="button"
                >
                  <PanelLeftClose size={15} />
                </button>
              </div>
            </header>
            <nav aria-label="Teams, rooms, and people">
              {conversationsQuery.isLoading ? (
                <LiveStateNotice
                  compact
                  kind="loading"
                  title="Loading conversations"
                />
              ) : null}
              {!conversationsQuery.isLoading
                ? conversationGroups.map(({ key, label, icon: Icon }) => (
                    <section
                      aria-labelledby={`live-message-group-${key}`}
                      key={key}
                    >
                      <header>
                        <span id={`live-message-group-${key}`}>
                          <Icon size={14} aria-hidden="true" /> {label}
                        </span>
                        {grouped[key].length > 0 ? (
                          <small>{grouped[key].length}</small>
                        ) : null}
                      </header>
                      {grouped[key].length === 0 ? (
                        key === emptyPromptGroup ? (
                          <div className={styles.emptyGroup}>
                            <span>
                              {key === "teams"
                                ? "Creating a Team automatically creates its private Team room."
                                : key === "rooms"
                                  ? "Rooms coordinate selected people around a specific piece of work."
                                  : "Direct messages are private conversations between two people."}
                            </span>
                            {key === "teams" ? (
                              <Link
                                href={workspaceHref(workspaceSlug, "teams")}
                              >
                                Create a Team
                              </Link>
                            ) : canCreateConversation ? (
                              <button
                                onClick={() =>
                                  openConversationCreator(
                                    key === "rooms" ? "workspace" : "direct",
                                  )
                                }
                                type="button"
                              >
                                {key === "rooms"
                                  ? "Create a Room"
                                  : "Message a person"}
                              </button>
                            ) : null}
                          </div>
                        ) : null
                      ) : (
                        grouped[key].map((conversation) => (
                          <button
                            aria-current={
                              selectedConversation?.id === conversation.id
                                ? "page"
                                : undefined
                            }
                            className={
                              selectedConversation?.id === conversation.id
                                ? styles.activeConversation
                                : undefined
                            }
                            disabled={pendingAction === "send"}
                            key={conversation.id}
                            onClick={() => {
                              setSelectedId(conversation.id);
                              setMobileThreadOpen(true);
                            }}
                            type="button"
                          >
                            <span
                              className={styles.conversationIcon}
                              aria-hidden="true"
                            >
                              {key === "teams" ? (
                                <Users size={15} />
                              ) : key === "people" ? (
                                <CircleUserRound size={15} />
                              ) : (
                                <Hash size={15} />
                              )}
                            </span>
                            <span>
                              <strong>{conversation.title}</strong>
                              <small>
                                {conversationKindLabel(conversation)}
                              </small>
                            </span>
                            {conversation.needsResponseCount > 0 ? (
                              <span
                                className={styles.needsResponseCount}
                                aria-label={`${conversation.needsResponseCount} need your response`}
                              >
                                {conversation.needsResponseCount} need you
                              </span>
                            ) : conversation.unreadCount > 0 ? (
                              <b
                                aria-label={`${conversation.unreadCount} unread`}
                              >
                                {conversation.unreadCount > 99
                                  ? "99+"
                                  : conversation.unreadCount}
                              </b>
                            ) : null}
                          </button>
                        ))
                      )}
                    </section>
                  ))
                : null}
            </nav>
          </aside>

          <div
            aria-controls="live-conversation-rail"
            aria-label="Resize conversation list"
            aria-orientation="vertical"
            aria-valuemax={conversationRailWidth.maximum}
            aria-valuemin={conversationRailWidth.minimum}
            aria-valuenow={conversationRailWidthValue}
            className={styles.conversationRailResizer}
            data-testid="conversation-rail-resizer"
            onKeyDown={(event) => {
              if (event.key === "Home") {
                event.preventDefault();
                setConversationRailWidthValue(conversationRailWidth.minimum);
              } else if (event.key === "End") {
                event.preventDefault();
                setConversationRailWidthValue(conversationRailWidth.maximum);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                setConversationRailWidthValue((current) =>
                  clampConversationRailWidth(current - 16),
                );
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                setConversationRailWidthValue((current) =>
                  clampConversationRailWidth(current + 16),
                );
              }
            }}
            onPointerDown={beginConversationRailResize}
            role="separator"
            tabIndex={0}
          >
            <span aria-hidden="true" />
          </div>

          <button
            aria-controls="live-conversation-rail"
            aria-expanded="false"
            aria-label="Show conversations"
            className={styles.collapsedRailButton}
            onClick={() => setConversationRailCollapsed(false)}
            type="button"
          >
            <PanelLeftOpen size={17} />
          </button>

          <section
            className={styles.threadPane}
            aria-labelledby="live-thread-title"
          >
            {selectedConversation ? (
              <>
                <header className={styles.threadHeader}>
                  <button
                    className={styles.mobileBack}
                    disabled={pendingAction === "send"}
                    onClick={() => setMobileThreadOpen(false)}
                    type="button"
                  >
                    <ArrowLeft size={16} /> Conversations
                  </button>
                  <div>
                    <span>{conversationKindLabel(selectedConversation)}</span>
                    <h2 id="live-thread-title">{selectedConversation.title}</h2>
                    <small>
                      {selectedConversation.participants.length} participants ·{" "}
                      {selectedConversation.retentionDays}-day retention
                    </small>
                  </div>
                  <button
                    aria-expanded={contextOpen}
                    aria-label="Open conversation context"
                    className={styles.contextToggle}
                    onClick={() => setContextOpen(true)}
                    ref={contextToggleRef}
                    type="button"
                  >
                    <Info size={17} /> Context
                  </button>
                </header>

                <div
                  className={styles.timeline}
                  ref={timelineRef}
                  onScroll={(event) => {
                    const timeline = event.currentTarget;
                    followTimelineRef.current =
                      timeline.scrollHeight -
                        timeline.scrollTop -
                        timeline.clientHeight <
                      120;
                  }}
                >
                  {messageQuery.hasNextPage ? (
                    <button
                      className={styles.loadHistory}
                      disabled={messageQuery.isFetchingNextPage}
                      onClick={() => void loadEarlierMessages()}
                      type="button"
                    >
                      <ChevronDown size={14} />
                      {messageQuery.isFetchingNextPage
                        ? "Loading history…"
                        : "Load earlier messages"}
                    </button>
                  ) : null}
                  {messageQuery.isLoading ? (
                    <LiveStateNotice
                      compact
                      kind="loading"
                      title="Loading messages"
                    />
                  ) : null}
                  {!messageQuery.isLoading && messages.length === 0 ? (
                    <div className={styles.threadEmpty}>
                      <MessageCircleMore size={24} aria-hidden="true" />
                      <h3>Start this conversation</h3>
                      <p>
                        The first message appears only after the server confirms
                        it.
                      </p>
                    </div>
                  ) : null}
                  {messages.map((message) => (
                    <Fragment key={message.id}>
                      <MessageRow
                        canInteract={canSendMessage}
                        canToggleResponse={canToggleMessageResponse(
                          selectedConversation,
                          message,
                          session.user.id,
                          session.managedWorkspaceIds,
                          canSendMessage,
                        )}
                        currentUserId={session.user.id}
                        message={message}
                        pendingAction={pendingAction}
                        timezone={timezone}
                        onReact={toggleReaction}
                        onReply={() => openThread(message.id)}
                        onToggleResponse={toggleResponse}
                      />
                      {activeThreadRoot?.id === message.id ? (
                        <ThreadReplyPanel
                          canInteract={canSendMessage}
                          canToggleResponse={(message) =>
                            canToggleMessageResponse(
                              selectedConversation,
                              message,
                              session.user.id,
                              session.managedWorkspaceIds,
                              canSendMessage,
                            )
                          }
                          closeDisabled={
                            pendingAction === "send" ||
                            (draft.parentMessageId === message.id &&
                              Boolean(draft.body.trim()))
                          }
                          currentUserId={session.user.id}
                          currentUserName={session.user.name}
                          delivery={
                            delivery?.parentMessageId === message.id
                              ? delivery
                              : null
                          }
                          error={threadQuery.error}
                          hasMore={Boolean(threadQuery.hasNextPage)}
                          isFetchingMore={threadQuery.isFetchingNextPage}
                          isLoading={threadQuery.isLoading}
                          messages={threadMessages}
                          pendingAction={pendingAction}
                          rootMessage={message}
                          timezone={timezone}
                          onClose={() => {
                            if (
                              draft.parentMessageId === message.id &&
                              draft.body.trim()
                            )
                              return;
                            if (draft.parentMessageId === message.id)
                              setReplyTarget("");
                            setThreadTarget(null);
                          }}
                          onLoadMore={() => threadQuery.fetchNextPage()}
                          onReact={toggleReaction}
                          onReply={() => setReplyTarget(message.id)}
                          onRetry={() => threadQuery.refetch()}
                          onToggleResponse={toggleResponse}
                        />
                      ) : null}
                    </Fragment>
                  ))}
                  {delivery &&
                  delivery.conversationId === selectedConversation.id &&
                  !delivery.parentMessageId &&
                  !messages.some(
                    (message) =>
                      message.clientMessageId === delivery.clientMessageId,
                  ) ? (
                    <OptimisticMessageRow
                      delivery={delivery}
                      userName={session.user.name}
                    />
                  ) : null}
                </div>

                {canSendMessage ? (
                  <form className={styles.composer} onSubmit={sendMessage}>
                    {draft.parentMessageId ? (
                      <div className={styles.replyContext}>
                        <Reply size={14} aria-hidden="true" />
                        <span>Replying in context</span>
                        <button
                          aria-label="Cancel reply"
                          disabled={pendingAction === "send"}
                          onClick={() => setReplyTarget("")}
                          type="button"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : null}
                    <label className="sr-only" htmlFor="live-message-composer">
                      Message
                    </label>
                    <textarea
                      disabled={pendingAction === "send"}
                      id="live-message-composer"
                      onChange={(event) => updateDraft(event.target.value)}
                      placeholder={`Message ${selectedConversation.title}`}
                      rows={2}
                      value={draft.body}
                    />
                    <div>
                      <small>
                        Draft recovered only on this signed-in browser · Server
                        acknowledgement required
                      </small>
                      <button
                        className="primary-button"
                        disabled={
                          !draftHydrated ||
                          !draft.body.trim() ||
                          pendingAction === "send"
                        }
                        type="submit"
                      >
                        <Send size={15} />
                        {delivery?.status === "failed"
                          ? "Retry send"
                          : pendingAction === "send"
                            ? "Sending…"
                            : "Send"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className={styles.readOnlyComposer}>
                    <ShieldCheck size={16} aria-hidden="true" />
                    <span>
                      Viewer access is read-only in this conversation.
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className={styles.threadEmpty}>
                <MessageCircleMore size={25} aria-hidden="true" />
                <h2 id="live-thread-title">Choose a conversation</h2>
                <p>
                  Select a Team room, work room, or person. Empty navigation
                  groups explain how to create the missing conversation type.
                </p>
              </div>
            )}
          </section>

          {selectedConversation ? (
            <ConversationContext
              canManageParticipants={canManageConversationParticipants(
                selectedConversation,
                session.user.id,
                session.managedWorkspaceIds,
                session.organization.role,
              )}
              className={styles.contextRail ?? ""}
              conversation={selectedConversation}
              currentUserId={session.user.id}
              pendingAction={pendingAction}
              onRemoveParticipant={removeConversationParticipant}
              onTransferOwnership={transferConversationOwnership}
            />
          ) : null}
        </section>
      </main>

      {createOpen && directoryQuery.data ? (
        <CreateConversationDialog
          currentUserId={session.user.id}
          initialKind={createConversationKind}
          members={directoryQuery.data.availableMembers}
          notice={notice?.kind !== "saved" ? notice : null}
          pending={pendingAction === "create-conversation"}
          workspaceId={workspace.id}
          onClose={() => setCreateOpen(false)}
          onSubmit={createConversation}
        />
      ) : null}
      {contextOpen && selectedConversation ? (
        <ConversationContextDrawer
          canManageParticipants={canManageConversationParticipants(
            selectedConversation,
            session.user.id,
            session.managedWorkspaceIds,
            session.organization.role,
          )}
          conversation={selectedConversation}
          currentUserId={session.user.id}
          pendingAction={pendingAction}
          returnFocusRef={contextToggleRef}
          onClose={() => setContextOpen(false)}
          onRemoveParticipant={removeConversationParticipant}
          onTransferOwnership={transferConversationOwnership}
        />
      ) : null}
    </WorkspaceFrame>
  );
}

function ThreadReplyPanel({
  canInteract,
  canToggleResponse,
  closeDisabled,
  currentUserId,
  currentUserName,
  delivery,
  error,
  hasMore,
  isFetchingMore,
  isLoading,
  messages,
  pendingAction,
  rootMessage,
  timezone,
  onClose,
  onLoadMore,
  onReact,
  onReply,
  onRetry,
  onToggleResponse,
}: {
  canInteract: boolean;
  canToggleResponse: (message: ConversationMessageDto) => boolean;
  closeDisabled: boolean;
  currentUserId: string;
  currentUserName: string;
  delivery: OptimisticDelivery | null;
  error: unknown;
  hasMore: boolean;
  isFetchingMore: boolean;
  isLoading: boolean;
  messages: ConversationMessageDto[];
  pendingAction: string;
  rootMessage: ConversationMessageDto;
  timezone: string;
  onClose: () => void;
  onLoadMore: () => Promise<unknown>;
  onReact: (message: ConversationMessageDto, emoji: string) => Promise<void>;
  onReply: () => void;
  onRetry: () => Promise<unknown>;
  onToggleResponse: (message: ConversationMessageDto) => Promise<void>;
}) {
  const presentedError = error ? presentLiveError(error) : null;
  return (
    <section
      aria-labelledby={`live-thread-replies-${rootMessage.id}`}
      className={styles.threadReplies}
    >
      <header className={styles.threadRepliesHeader}>
        <div>
          <span>Thread</span>
          <h3 id={`live-thread-replies-${rootMessage.id}`}>
            Replies to {rootMessage.sender.name}
          </h3>
        </div>
        <div>
          {canInteract ? (
            <button
              onClick={() => {
                onReply();
                document.getElementById("live-message-composer")?.focus();
              }}
              type="button"
            >
              <Reply size={13} /> Reply
            </button>
          ) : null}
          <button
            aria-label="Close thread"
            disabled={closeDisabled}
            onClick={onClose}
            title={
              closeDisabled
                ? "Send or clear the current reply draft before closing this thread."
                : "Close thread"
            }
            type="button"
          >
            <X size={14} />
          </button>
        </div>
      </header>
      {presentedError ? (
        <LiveStateNotice
          {...presentedError}
          actions={
            <button onClick={() => void onRetry()} type="button">
              Retry thread
            </button>
          }
          compact
        />
      ) : null}
      {hasMore ? (
        <button
          className={styles.loadHistory}
          disabled={isFetchingMore}
          onClick={() => void onLoadMore()}
          type="button"
        >
          <ChevronDown size={14} />
          {isFetchingMore ? "Loading replies…" : "Load earlier replies"}
        </button>
      ) : null}
      {isLoading ? (
        <LiveStateNotice compact kind="loading" title="Loading replies" />
      ) : null}
      {!isLoading && !error && messages.length === 0 && !delivery ? (
        <p className={styles.threadRepliesEmpty}>
          No replies yet. A reply appears here only after the server confirms
          it.
        </p>
      ) : null}
      {messages.map((message) => (
        <MessageRow
          canInteract={canInteract}
          canToggleResponse={canToggleResponse(message)}
          currentUserId={currentUserId}
          key={message.id}
          message={message}
          pendingAction={pendingAction}
          timezone={timezone}
          onReact={onReact}
          onReply={onReply}
          onToggleResponse={onToggleResponse}
        />
      ))}
      {delivery &&
      !messages.some(
        (message) => message.clientMessageId === delivery.clientMessageId,
      ) ? (
        <OptimisticMessageRow delivery={delivery} userName={currentUserName} />
      ) : null}
    </section>
  );
}

function OptimisticMessageRow({
  delivery,
  userName,
}: {
  delivery: OptimisticDelivery;
  userName: string;
}) {
  return (
    <article
      className={`${styles.messageRow} ${styles.ownMessage} ${styles.optimisticMessage}`}
      data-delivery-status={delivery.status}
    >
      <span className={styles.avatar} aria-hidden="true">
        {initials(userName)}
      </span>
      <div>
        <header>
          <strong>{userName}</strong>
          <time dateTime={delivery.createdAt}>Now</time>
        </header>
        <p>{delivery.body}</p>
        <small role="status">
          {delivery.status === "sending"
            ? "Sending — awaiting server confirmation"
            : "Not confirmed — use Retry send below"}
        </small>
      </div>
    </article>
  );
}

function MessageRow({
  canInteract,
  canToggleResponse,
  currentUserId,
  message,
  pendingAction,
  timezone,
  onReact,
  onReply,
  onToggleResponse,
}: {
  canInteract: boolean;
  canToggleResponse: boolean;
  currentUserId: string;
  message: ConversationMessageDto;
  pendingAction: string;
  timezone: string;
  onReact: (message: ConversationMessageDto, emoji: string) => Promise<void>;
  onReply: () => void;
  onToggleResponse: (message: ConversationMessageDto) => Promise<void>;
}) {
  const own = message.senderId === currentUserId;
  const needsResponse =
    (message.intent === "request" || message.intent === "decision") &&
    message.responseState;
  return (
    <article
      className={`${styles.messageRow} ${own ? styles.ownMessage : ""}`}
      data-message-id={message.id}
    >
      <span className={styles.avatar} aria-hidden="true">
        {initials(message.sender.name)}
      </span>
      <div>
        <header>
          <strong>{message.sender.name}</strong>
          <span>{message.intent}</span>
          <time dateTime={message.createdAt}>
            {formatMessageTime(message.createdAt, timezone)}
          </time>
        </header>
        {message.parentMessageId ? (
          <small className={styles.threadReference}>
            <Reply size={12} aria-hidden="true" /> Threaded reply
          </small>
        ) : null}
        <p>{message.body}</p>
        {needsResponse ? (
          <div className={styles.responseState}>
            <span>
              Response{" "}
              {message.responseState === "resolved"
                ? "resolved"
                : message.responseState === "cancelled"
                  ? "cancelled after access changed"
                  : "open"}
            </span>
            {message.responseState !== "cancelled" ? (
              <button
                disabled={!canToggleResponse || Boolean(pendingAction)}
                onClick={() => void onToggleResponse(message)}
                type="button"
              >
                <Check size={13} />
                {message.responseState === "resolved" ? "Reopen" : "Resolve"}
              </button>
            ) : null}
          </div>
        ) : null}
        <footer className={styles.messageActions}>
          {message.reactions.map((reaction) => (
            <button
              aria-label={`${reaction.reactedByCurrentUser ? "Remove" : "Add"} ${reaction.emoji} reaction, ${reaction.userIds.length} total`}
              aria-pressed={reaction.reactedByCurrentUser}
              disabled={!canInteract || Boolean(pendingAction)}
              key={reaction.emoji}
              onClick={() => void onReact(message, reaction.emoji)}
              type="button"
            >
              {reaction.emoji} {reaction.userIds.length}
            </button>
          ))}
          {!message.reactions.some((reaction) => reaction.emoji === "👍") ? (
            <button
              aria-label="Add thumbs up reaction"
              aria-pressed="false"
              disabled={!canInteract || Boolean(pendingAction)}
              onClick={() => void onReact(message, "👍")}
              type="button"
            >
              👍
            </button>
          ) : null}
          <button
            aria-label={`Reply to ${message.sender.name}`}
            disabled={!canInteract || Boolean(pendingAction)}
            onClick={onReply}
            type="button"
          >
            <Reply size={13} /> Reply
          </button>
        </footer>
      </div>
    </article>
  );
}

function ConversationContext({
  canManageParticipants,
  className,
  conversation,
  currentUserId,
  pendingAction,
  onRemoveParticipant,
  onTransferOwnership,
}: {
  canManageParticipants: boolean;
  className?: string;
  conversation: ConversationDto;
  currentUserId: string;
  pendingAction: string;
  onRemoveParticipant: (userId: string) => Promise<void>;
  onTransferOwnership: (userId: string) => Promise<void>;
}) {
  return (
    <aside className={className} aria-label="Conversation context">
      <header>
        <Info size={17} aria-hidden="true" />
        <div>
          <strong>Context</strong>
          <span>{conversationKindLabel(conversation)}</span>
        </div>
      </header>
      <section>
        <h3>Purpose</h3>
        <p>{conversation.purpose || "No purpose has been added yet."}</p>
      </section>
      <section>
        <h3>People</h3>
        <div className={styles.contextPeople}>
          {conversation.participants.map((participant) => (
            <article key={participant.user.id}>
              <span className={styles.avatar} aria-hidden="true">
                {initials(participant.user.name)}
              </span>
              <div>
                <strong>{participant.user.name}</strong>
                <small>
                  {participant.participantRole} ·{" "}
                  {participant.user.organizationRole.replaceAll("_", " ")}
                </small>
              </div>
              {canManageParticipants &&
              participant.user.id !== currentUserId ? (
                <span className={styles.contextActions}>
                  {participant.participantRole !== "owner" &&
                  participant.user.organizationRole !== "guest" &&
                  participant.user.organizationRole !== "viewer" ? (
                    <button
                      aria-label={`Make ${participant.user.name} the owner of ${conversation.title}`}
                      disabled={Boolean(pendingAction)}
                      onClick={() =>
                        void onTransferOwnership(participant.user.id)
                      }
                      title={`Make ${participant.user.name} owner`}
                      type="button"
                    >
                      <Crown size={15} aria-hidden="true" />
                    </button>
                  ) : null}
                  <button
                    aria-label={`Remove ${participant.user.name} from ${conversation.title}`}
                    disabled={Boolean(pendingAction)}
                    onClick={() =>
                      void onRemoveParticipant(participant.user.id)
                    }
                    title={`Remove ${participant.user.name}`}
                    type="button"
                  >
                    <UserMinus size={15} aria-hidden="true" />
                  </button>
                </span>
              ) : null}
            </article>
          ))}
        </div>
      </section>
      <section className={styles.accessNote}>
        <ShieldCheck size={16} aria-hidden="true" />
        <p>
          Participant access is resolved by the server. This conversation keeps
          messages for {conversation.retentionDays} days.
        </p>
      </section>
    </aside>
  );
}

function ConversationContextDrawer({
  canManageParticipants,
  conversation,
  currentUserId,
  pendingAction,
  returnFocusRef,
  onClose,
  onRemoveParticipant,
  onTransferOwnership,
}: {
  canManageParticipants: boolean;
  conversation: ConversationDto;
  currentUserId: string;
  pendingAction: string;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onRemoveParticipant: (userId: string) => Promise<void>;
  onTransferOwnership: (userId: string) => Promise<void>;
}) {
  const dialogRef = useAccessibleDialog(onClose, returnFocusRef);
  return (
    <div className={styles.drawerBackdrop}>
      <div
        aria-label={`${conversation.title} context`}
        aria-modal="true"
        className={`${styles.drawer} ${styles.contextDrawer}`}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className={styles.drawerCloseRow}>
          <strong>Conversation context</strong>
          <button
            aria-label="Close conversation context"
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        </div>
        <ConversationContext
          canManageParticipants={canManageParticipants}
          conversation={conversation}
          currentUserId={currentUserId}
          pendingAction={pendingAction}
          onRemoveParticipant={onRemoveParticipant}
          onTransferOwnership={onTransferOwnership}
        />
      </div>
    </div>
  );
}

function CreateConversationDialog({
  currentUserId,
  initialKind,
  members,
  notice,
  pending,
  workspaceId,
  onClose,
  onSubmit,
}: {
  currentUserId: string;
  initialKind: "direct" | "workspace";
  members: Array<{ id: string; name: string; email: string }>;
  notice: {
    kind: LiveStateKind;
    title: string;
    description?: string;
  } | null;
  pending: boolean;
  workspaceId: string;
  onClose: () => void;
  onSubmit: (input: CreateConversationInput) => Promise<boolean>;
}) {
  const dialogRef = useAccessibleDialog(onClose);
  const [kind, setKind] = useState<"direct" | "workspace">(initialKind);
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const selectableMembers = members.filter(
    (member) => member.id !== currentUserId,
  );
  const valid =
    kind === "direct"
      ? participantIds.length === 1
      : Boolean(title.trim()) && participantIds.length > 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || pending) return;
    const directPerson = selectableMembers.find(
      (member) => member.id === participantIds[0],
    );
    await onSubmit({
      workspaceId,
      title:
        kind === "direct"
          ? (directPerson?.name ?? "Direct conversation")
          : title,
      purpose,
      kind,
      visibility: "private",
      participantIds: [currentUserId, ...participantIds],
      retentionDays: 365,
    });
  }

  return (
    <div className={styles.modalBackdrop}>
      <div
        aria-labelledby="create-live-conversation-title"
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <div>
            <p>New conversation</p>
            <h2 id="create-live-conversation-title">Choose its job</h2>
          </div>
          <button
            aria-label="Close conversation creator"
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        </header>
        <form className={styles.dialogBody} onSubmit={submit}>
          {notice ? (
            <LiveStateNotice
              kind={notice.kind}
              title={notice.title}
              {...(notice.description
                ? { description: notice.description }
                : {})}
              compact
            />
          ) : null}
          <fieldset className={styles.kindChoices}>
            <legend>Conversation type</legend>
            <label>
              <input
                checked={kind === "direct"}
                name="conversation-kind"
                onChange={() => {
                  setKind("direct");
                  setParticipantIds((current) => current.slice(0, 1));
                }}
                type="radio"
              />
              <span>
                <CircleUserRound size={17} />
                <strong>Person</strong>
                <small>One private direct conversation</small>
              </span>
            </label>
            <label>
              <input
                checked={kind === "workspace"}
                name="conversation-kind"
                onChange={() => setKind("workspace")}
                type="radio"
              />
              <span>
                <Hash size={17} />
                <strong>Room</strong>
                <small>Contextual coordination for selected people</small>
              </span>
            </label>
          </fieldset>
          {kind === "workspace" ? (
            <>
              <label>
                Room name
                <input
                  autoFocus
                  maxLength={160}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  value={title}
                />
              </label>
              <label>
                Purpose
                <textarea
                  maxLength={1_000}
                  onChange={(event) => setPurpose(event.target.value)}
                  rows={3}
                  value={purpose}
                />
              </label>
            </>
          ) : null}
          <fieldset className={styles.choiceList}>
            <legend>
              {kind === "direct" ? "Choose a person" : "Choose people"}
            </legend>
            {selectableMembers.length === 0 ? (
              <p>No other organization members are available.</p>
            ) : (
              selectableMembers.map((member) => {
                const selected = participantIds.includes(member.id);
                return (
                  <label key={member.id}>
                    <input
                      checked={selected}
                      name={kind === "direct" ? "direct-person" : undefined}
                      onChange={(event) =>
                        setParticipantIds((current) =>
                          kind === "direct"
                            ? event.target.checked
                              ? [member.id]
                              : []
                            : event.target.checked
                              ? [...new Set([...current, member.id])]
                              : current.filter((id) => id !== member.id),
                        )
                      }
                      type={kind === "direct" ? "radio" : "checkbox"}
                    />
                    <span>
                      <strong>{member.name}</strong>
                      <small>{member.email}</small>
                    </span>
                  </label>
                );
              })
            )}
          </fieldset>
          <footer className={styles.dialogActions}>
            <button onClick={onClose} type="button">
              Cancel
            </button>
            <button
              className="primary-button"
              disabled={!valid || pending}
              type="submit"
            >
              {pending
                ? "Creating…"
                : kind === "direct"
                  ? "Start message"
                  : "Create room"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function groupConversations(conversations: readonly ConversationDto[]) {
  const groups: Record<ConversationGroup, ConversationDto[]> = {
    teams: [],
    rooms: [],
    people: [],
  };
  for (const conversation of conversations) {
    groups[conversationGroupFor(conversation)].push(conversation);
  }
  for (const group of Object.keys(groups) as ConversationGroup[]) {
    groups[group] = prioritizeConversations(groups[group]);
  }
  return groups;
}

function replaceMessageInCache(
  queryClient: QueryClient,
  queryKey: ReturnType<typeof collaborationKeys.messages>,
  next: ConversationMessageDto,
) {
  queryClient.setQueryData<InfiniteData<PaginatedConversationMessages>>(
    queryKey,
    (current) => {
      if (!current) return current;
      let found = false;
      const pages = current.pages.map((page) => ({
        ...page,
        data: page.data.map((message) => {
          if (message.id !== next.id) return message;
          found = true;
          return next;
        }),
      }));
      if (!found && pages[0]) {
        pages[0] = { ...pages[0], data: [...pages[0].data, next] };
      }
      return { ...current, pages };
    },
  );
}

function findMessageInCache(
  queryClient: QueryClient,
  queryKey: ReturnType<typeof collaborationKeys.messages>,
  clientMessageId: string,
) {
  const current =
    queryClient.getQueryData<InfiniteData<PaginatedConversationMessages>>(
      queryKey,
    );
  return current?.pages
    .flatMap((page) => page.data)
    .find((message) => message.clientMessageId === clientMessageId);
}

function persistMessageDraft(
  storageKey: string,
  draft: MessageDraft,
  idempotencyKey: string,
) {
  if (!storageKey) return;
  if (
    !draft.body.trim() &&
    !draft.parentMessageId &&
    !draft.attemptedFingerprint
  ) {
    clearMessageDraft(storageKey);
    return;
  }
  const envelope: LiveDraftEnvelope<MessageDraft> = {
    version: 1,
    idempotencyKey,
    payload: draft,
    updatedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(envelope));
  } catch {
    // Sending still works when recoverable browser-draft storage is unavailable.
  }
}

function clearMessageDraft(storageKey: string) {
  if (!storageKey) return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Canonical messages already live on the server.
  }
}

function isMessageDraft(value: unknown): value is MessageDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<MessageDraft>;
  return (
    typeof draft.body === "string" &&
    typeof draft.clientMessageId === "string" &&
    typeof draft.parentMessageId === "string" &&
    typeof draft.attemptedFingerprint === "string"
  );
}

function messageFingerprint(
  draft: Pick<MessageDraft, "body" | "parentMessageId">,
) {
  return JSON.stringify({
    body: draft.body.trim(),
    parentMessageId: draft.parentMessageId,
  });
}

function canCreateMessages(role: string) {
  return role !== "guest" && role !== "viewer";
}

function canManageConversationParticipants(
  conversation: ConversationDto,
  currentUserId: string,
  managedWorkspaceIds: readonly string[],
  organizationRole: string,
) {
  if (organizationRole === "guest" || organizationRole === "viewer") {
    return false;
  }
  if (conversation.kind === "team" || conversation.kind === "direct") {
    return false;
  }
  return (
    managedWorkspaceIds.includes(conversation.workspaceId) ||
    conversation.participants.some(
      (participant) =>
        participant.user.id === currentUserId &&
        participant.participantRole === "owner",
    )
  );
}

function canToggleMessageResponse(
  conversation: ConversationDto,
  message: ConversationMessageDto,
  currentUserId: string,
  managedWorkspaceIds: readonly string[],
  canInteract: boolean,
) {
  if (!canInteract || !message.responseState) return false;
  return (
    managedWorkspaceIds.includes(conversation.workspaceId) ||
    message.senderId === currentUserId ||
    message.responseOwnerId === currentUserId ||
    conversation.participants.some(
      (participant) =>
        participant.user.id === currentUserId &&
        participant.participantRole === "owner",
    )
  );
}

function conversationKindLabel(conversation: ConversationDto) {
  if (conversation.kind === "team") return "Team room";
  if (conversation.kind === "direct") return "Direct message";
  if (conversation.kind === "external") return "External room";
  return "Room";
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toLocaleUpperCase();
}

function formatMessageTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}
