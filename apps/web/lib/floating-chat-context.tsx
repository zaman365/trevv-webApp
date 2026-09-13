"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { MessageCircleMore } from "lucide-react";
import { useAppSession } from "./app-session-context";
import { useOptionalLiveAppRecords } from "./live-app-data";
import { LiveUnreadBadge } from "./live-collaboration";
import styles from "@/components/floating-chat-launcher.module.css";

const FloatingChatWindow = dynamic(
  () =>
    import("@/components/floating-chat-window").then(
      (module) => module.FloatingChatWindow,
    ),
  {
    ssr: false,
    loading: () => (
      <div className={styles.loading} role="status">
        Opening chats…
      </div>
    ),
  },
);

export interface ChatRequest {
  workspaceSlug: string;
  conversationId?: string;
  personId?: string;
}
interface ChatContextValue {
  openChat(request?: ChatRequest): void;
  closeChat(): void;
  isOpen: boolean;
  workspaceSlug: string;
  setBusy(busy: boolean): void;
}
const FloatingChatContext = createContext<ChatContextValue | null>(null);
export const useFloatingChat = () => useContext(FloatingChatContext);

export function FloatingChatProvider({
  children,
  defaultWorkspaceSlug,
}: {
  children: ReactNode;
  defaultWorkspaceSlug?: string;
}) {
  const session = useAppSession();
  const data = useOptionalLiveAppRecords();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState<
    (ChatRequest & { key: number }) | null
  >(null);
  const workspaceSlug =
    request?.workspaceSlug ??
    defaultWorkspaceSlug ??
    data?.workspaces[0]?.slug ??
    "";
  const workspace = data?.workspaces.find(
    (entry) => entry.slug === workspaceSlug,
  );
  const available = !session.demo && !data?.accessLost && Boolean(workspace);
  const openChat = useCallback(
    (next?: ChatRequest) => {
      if (busy) return;
      setRequest((current) => ({
        ...(next ?? { workspaceSlug }),
        key: (current?.key ?? 0) + 1,
      }));
      setOpen(true);
    },
    [busy, workspaceSlug],
  );
  const consumeRequest = useCallback(
    (key: number) =>
      setRequest((current) =>
        current?.key === key
          ? { workspaceSlug: current.workspaceSlug, key: current.key }
          : current,
      ),
    [],
  );
  const closeChat = useCallback(() => {
    if (!busy) setOpen(false);
  }, [busy]);
  const value = useMemo(
    () => ({
      openChat,
      closeChat,
      isOpen: open && available,
      workspaceSlug,
      setBusy,
    }),
    [openChat, closeChat, open, available, workspaceSlug],
  );
  return (
    <FloatingChatContext.Provider value={value}>
      {children}
      {available ? (
        <>
          {open ? (
            <FloatingChatWindow
              key={`${session.organization.id}:${session.user.id}:${workspaceSlug}`}
              workspaceSlug={workspaceSlug}
              request={request}
              onRequestHandled={consumeRequest}
              onClose={closeChat}
              onBusyChange={setBusy}
              onWorkspaceChange={(slug) => openChat({ workspaceSlug: slug })}
            />
          ) : null}
          <button
            type="button"
            className={styles.launcher}
            aria-label={open ? "Minimize chats" : "Open chats"}
            aria-expanded={open}
            aria-controls="floating-chat-window"
            disabled={busy}
            onClick={() => (open ? closeChat() : openChat())}
          >
            <MessageCircleMore size={23} aria-hidden="true" />
            <LiveUnreadBadge workspaceId={workspace!.id} />
          </button>
        </>
      ) : null}
    </FloatingChatContext.Provider>
  );
}
