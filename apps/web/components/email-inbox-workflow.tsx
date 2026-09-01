"use client";

import {
  Archive,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Forward,
  Inbox,
  Mail,
  MailOpen,
  MoreHorizontal,
  Paperclip,
  PenLine,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  emailProvider,
  emailProviderDefinitions,
  yahooHosts,
  type EmailProviderDefinition,
  type EmailProviderKey,
} from "@/lib/email-providers";
import { InboxWorkflow, type EmailInboxAction } from "./inbox-workflow";
import { CapabilityNotice } from "./capability-status";

type InboxArea = "email" | "actionable" | "captured";
type MailFolder = "inbox" | "starred" | "sent" | "drafts" | "archive" | "trash";
type ComposeMode = "new" | "reply" | "forward";

interface EmailAccount {
  id: string;
  provider: EmailProviderKey;
  email: string;
  label: string;
  color: string;
  connectedAt: string;
  lastSyncedAt: string;
}

interface EmailMessage {
  id: string;
  accountId: string;
  from: string;
  fromEmail: string;
  to: string;
  subject: string;
  preview: string;
  body: string[];
  receivedAt: string;
  folder: MailFolder;
  unread: boolean;
  starred: boolean;
  attachments?: string[];
}

const ACCOUNT_STORAGE_KEY = "trevv.email-accounts.v1";
const ACCOUNT_CHANGE_EVENT = "trevv-email-accounts-change";

const initialAccounts: EmailAccount[] = [
  {
    id: "account-workspace",
    provider: "gmail",
    email: "mohammed@trevv.de",
    label: "TREVV",
    color: "#4285f4",
    connectedAt: "2026-08-25T09:00:00.000Z",
    lastSyncedAt: "2026-08-27T20:42:00.000Z",
  },
  {
    id: "account-outlook",
    provider: "microsoft",
    email: "mohammed@outlook.com",
    label: "Personal",
    color: "#0078d4",
    connectedAt: "2026-08-26T11:30:00.000Z",
    lastSyncedAt: "2026-08-27T20:41:00.000Z",
  },
];

const initialMessages: EmailMessage[] = [
  {
    id: "mail-1",
    accountId: "account-workspace",
    from: "Nora Klein",
    fromEmail: "nora@northstar.example",
    to: "mohammed@trevv.de",
    subject: "Final navigation notes before tomorrow’s review",
    preview:
      "I added the last two edge cases to the review doc. The strongest option is still the compact navigation…",
    body: [
      "Hi Mohammed,",
      "I added the last two edge cases to the review doc. The strongest option is still the compact navigation because it keeps the daily actions visible without crowding the workspace.",
      "Could you take one last look before tomorrow’s review? I attached the annotated summary so the decision is easy to scan.",
      "Thanks,\nNora",
    ],
    receivedAt: "20:34",
    folder: "inbox",
    unread: true,
    starred: true,
    attachments: ["Navigation-review.pdf"],
  },
  {
    id: "mail-2",
    accountId: "account-workspace",
    from: "Amira Demir",
    fromEmail: "amira@northstar.example",
    to: "mohammed@trevv.de",
    subject: "Supplier declaration received",
    preview:
      "Good news — the signed declaration arrived this afternoon. I have linked it to the compliance checklist…",
    body: [
      "Good news — the signed supplier declaration arrived this afternoon.",
      "I have linked it to the compliance checklist and marked the evidence gap as resolved. There is nothing you need to do; I’m sending this so you have the full context before the weekly review.",
      "Best,\nAmira",
    ],
    receivedAt: "18:12",
    folder: "inbox",
    unread: true,
    starred: false,
  },
  {
    id: "mail-3",
    accountId: "account-outlook",
    from: "Vercel",
    fromEmail: "notifications@vercel.com",
    to: "mohammed@outlook.com",
    subject: "Deployment completed successfully",
    preview:
      "Your production deployment is ready. All checks passed and the new version is now serving traffic.",
    body: [
      "Your production deployment is ready.",
      "All checks passed and the new version is now serving traffic. No action is required.",
    ],
    receivedAt: "16:48",
    folder: "inbox",
    unread: false,
    starred: false,
  },
  {
    id: "mail-4",
    accountId: "account-workspace",
    from: "Jana Roth",
    fromEmail: "jana@localreach.example",
    to: "mohammed@trevv.de",
    subject: "Storefront repair — before and after",
    preview:
      "The repair is live on the staging URL. I included screenshots of the checkout and collection pages…",
    body: [
      "The repair is live on the staging URL. I included screenshots of the checkout and collection pages and a short list of the changes made.",
      "If everything looks good, I can move the same patch to production tomorrow morning.",
      "Jana",
    ],
    receivedAt: "14:05",
    folder: "inbox",
    unread: false,
    starred: true,
    attachments: ["before-after.zip", "release-notes.txt"],
  },
  {
    id: "mail-5",
    accountId: "account-outlook",
    from: "Anna Zaman",
    fromEmail: "anna@example.com",
    to: "mohammed@outlook.com",
    subject: "Sunday lunch",
    preview: "Shall we meet at 13:00? I booked the table by the window.",
    body: [
      "Shall we meet at 13:00? I booked the table by the window.",
      "Let me know if we should move it a little later.",
    ],
    receivedAt: "Yesterday",
    folder: "inbox",
    unread: false,
    starred: false,
  },
  {
    id: "mail-6",
    accountId: "account-workspace",
    from: "Mohammed Zaman",
    fromEmail: "mohammed@trevv.de",
    to: "team@trevv.de",
    subject: "Weekly operating review",
    preview:
      "Here is the agenda for Friday: launch readiness, open decisions, and next week’s commitments.",
    body: [
      "Here is the agenda for Friday: launch readiness, open decisions, and next week’s commitments.",
    ],
    receivedAt: "Yesterday",
    folder: "sent",
    unread: false,
    starred: false,
  },
  {
    id: "mail-7",
    accountId: "account-outlook",
    from: "Mohammed Zaman",
    fromEmail: "mohammed@outlook.com",
    to: "",
    subject: "Travel notes for Hamburg",
    preview: "Train options and hotel shortlist…",
    body: ["Train options and hotel shortlist…"],
    receivedAt: "Mon",
    folder: "drafts",
    unread: false,
    starred: false,
  },
  {
    id: "mail-8",
    accountId: "account-workspace",
    from: "Google Workspace",
    fromEmail: "workspace-noreply@google.com",
    to: "mohammed@trevv.de",
    subject: "Your monthly security report",
    preview:
      "Review the sign-in and account protection activity for your organization.",
    body: [
      "Review the sign-in and account protection activity for your organization.",
    ],
    receivedAt: "Aug 19",
    folder: "archive",
    unread: false,
    starred: false,
  },
];

const folderLabels: Array<{
  key: MailFolder;
  label: string;
  icon: typeof Inbox;
}> = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "starred", label: "Starred", icon: Star },
  { key: "sent", label: "Sent", icon: Send },
  { key: "drafts", label: "Drafts", icon: FileText },
  { key: "archive", label: "Archive", icon: Archive },
  { key: "trash", label: "Trash", icon: Trash2 },
];

function loadEmailAccounts(raw: string | null) {
  if (!raw) return initialAccounts;
  try {
    const parsed = JSON.parse(raw) as EmailAccount[];
    return Array.isArray(parsed) ? parsed : initialAccounts;
  } catch {
    return initialAccounts;
  }
}

function subscribeToEmailAccounts(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(ACCOUNT_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(ACCOUNT_CHANGE_EVENT, onStoreChange);
  };
}

function getEmailAccountsSnapshot() {
  return window.localStorage.getItem(ACCOUNT_STORAGE_KEY);
}

export function InboxExperience({
  initialArea = "actionable",
  capturedWork,
}: {
  initialArea?: InboxArea;
  capturedWork?: ReactNode;
}) {
  const [area, setArea] = useState<InboxArea>(
    initialArea === "captured" && !capturedWork ? "actionable" : initialArea,
  );
  const [promotedMessages, setPromotedMessages] = useState<EmailInboxAction[]>(
    [],
  );

  const promoteMessage = (message: EmailMessage) => {
    setPromotedMessages((current) =>
      current.some((item) => item.id === `email-action-${message.id}`)
        ? current
        : [
            {
              id: `email-action-${message.id}`,
              title: message.subject,
              summary: message.preview,
              source: `${message.from} · Email`,
              receivedAt: message.receivedAt,
            },
            ...current,
          ],
    );
    setArea("actionable");
  };

  return (
    <div className="unified-inbox" data-layout="full-width">
      <div
        className="unified-inbox-tabs"
        role="tablist"
        aria-label="Inbox type"
      >
        <button
          role="tab"
          aria-selected={area === "email"}
          className={area === "email" ? "active" : ""}
          onClick={() => setArea("email")}
        >
          <Mail size={16} />
          Sample Email
          <b>2</b>
        </button>
        <button
          role="tab"
          aria-selected={area === "actionable"}
          className={area === "actionable" ? "active" : ""}
          onClick={() => setArea("actionable")}
        >
          <Sparkles size={16} />
          Workspace Actionable
          <b>{4 + promotedMessages.length}</b>
        </button>
        {capturedWork ? (
          <button
            role="tab"
            aria-selected={area === "captured"}
            className={area === "captured" ? "active" : ""}
            onClick={() => setArea("captured")}
          >
            <Inbox size={16} />
            Captured work
            <b>Live</b>
          </button>
        ) : null}
        <span>
          Email preview, Workspace actions, and durable capture remain separate
          but available in one Inbox.
        </span>
      </div>
      <div role="tabpanel">
        {area === "email" ? (
          <EmailInboxWorkflow onPromote={promoteMessage} />
        ) : area === "actionable" ? (
          <InboxWorkflow emailActions={promotedMessages} />
        ) : (
          capturedWork
        )}
      </div>
    </div>
  );
}

function EmailInboxWorkflow({
  onPromote,
}: {
  onPromote: (message: EmailMessage) => void;
}) {
  const storedAccounts = useSyncExternalStore(
    subscribeToEmailAccounts,
    getEmailAccountsSnapshot,
    () => null,
  );
  const accounts = useMemo(
    () => loadEmailAccounts(storedAccounts),
    [storedAccounts],
  );
  const [messages, setMessages] = useState<EmailMessage[]>(initialMessages);
  const [folder, setFolder] = useState<MailFolder>("inbox");
  const [accountId, setAccountId] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>("mail-1");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<ComposeMode>("new");
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<EmailMessage | null>(null);
  const [mailboxMenuOpen, setMailboxMenuOpen] = useState(false);
  const [messageMenuOpen, setMessageMenuOpen] = useState(false);
  const [senderDetailsOpen, setSenderDetailsOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const saveAccounts = (next: EmailAccount[]) => {
    window.localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(ACCOUNT_CHANGE_EVENT));
  };

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return messages.filter((message) => {
      const inFolder =
        folder === "starred" ? message.starred : message.folder === folder;
      return (
        inFolder &&
        (accountId === "all" || message.accountId === accountId) &&
        (!normalized ||
          `${message.from} ${message.fromEmail} ${message.subject} ${message.preview}`
            .toLocaleLowerCase()
            .includes(normalized))
      );
    });
  }, [accountId, folder, messages, query]);

  const selected = messages.find((message) => message.id === selectedId);
  const unreadCount = messages.filter(
    (message) => message.folder === "inbox" && message.unread,
  ).length;

  const updateMessage = (
    id: string,
    update: (message: EmailMessage) => EmailMessage,
  ) => {
    setMessages((current) =>
      current.map((message) => (message.id === id ? update(message) : message)),
    );
  };

  const openMessage = (message: EmailMessage) => {
    setSelectedId(message.id);
    setMessageMenuOpen(false);
    setSenderDetailsOpen(false);
    if (message.unread) {
      updateMessage(message.id, (current) => ({ ...current, unread: false }));
    }
  };

  const moveSelected = (nextFolder: MailFolder, message: string) => {
    if (!selected) return;
    updateMessage(selected.id, (current) => ({
      ...current,
      folder: nextFolder,
      unread: false,
    }));
    setSelectedId(null);
    setNotice(message);
  };

  const selectFolder = (nextFolder: MailFolder) => {
    setFolder(nextFolder);
    setSelectedId(null);
    setMailboxMenuOpen(false);
    setMessageMenuOpen(false);
    setSenderDetailsOpen(false);
  };

  return (
    <div className="email-workflow">
      <CapabilityNotice capability="email" />
      {notice && (
        <div className="workflow-toast email-toast" role="status">
          <CheckCircle2 size={15} />
          <span>{notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="email-command-bar">
        <div>
          <button
            className="primary-button"
            onClick={() => {
              setReplyTo(null);
              setComposeMode("new");
              setComposeOpen(true);
            }}
          >
            <PenLine size={15} /> Draft sample
          </button>
          <label className="email-search">
            <Search size={15} />
            <span className="sr-only">Search email</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the fictional mailbox…"
            />
          </label>
        </div>
        <div>
          <button
            className="email-sync-button"
            onClick={() => {
              setNotice(
                "Fictional mailbox refreshed from local data; no provider sync occurred.",
              );
              saveAccounts(
                accounts.map((account) => ({
                  ...account,
                  lastSyncedAt: new Date().toISOString(),
                })),
              );
            }}
          >
            <RefreshCw size={14} /> Refresh sample
          </button>
          <button
            className="email-manage-button"
            onClick={() => setAccountsOpen(true)}
          >
            <Settings2 size={14} /> Manage sample accounts
          </button>
        </div>
      </div>

      <section className="email-client" aria-label="Email inbox">
        <aside className="email-folders">
          <div className="email-account-filter">
            <button
              className={accountId === "all" ? "active" : ""}
              onClick={() => setAccountId("all")}
            >
              <span className="email-all-mark">
                <Mail size={14} />
              </span>
              <span>
                <strong>All sample inboxes</strong>
                <small>{accounts.length} fictional accounts</small>
              </span>
              <b>{unreadCount}</b>
            </button>
            {accounts.map((account) => {
              const provider = emailProvider(account.provider);
              const count = messages.filter(
                (message) =>
                  message.accountId === account.id &&
                  message.folder === "inbox" &&
                  message.unread,
              ).length;
              return (
                <button
                  key={account.id}
                  className={accountId === account.id ? "active" : ""}
                  onClick={() => setAccountId(account.id)}
                >
                  <span
                    className={`email-provider-mark tone-${provider.tone}`}
                    style={
                      { "--account-color": account.color } as CSSProperties
                    }
                  >
                    {provider.mark}
                  </span>
                  <span>
                    <strong>{account.label}</strong>
                    <small>{account.email}</small>
                  </span>
                  {count > 0 && <b>{count}</b>}
                </button>
              );
            })}
            <button
              className="email-add-account"
              onClick={() => setAccountsOpen(true)}
            >
              <Plus size={14} /> Add sample label
            </button>
          </div>
          <nav aria-label="Mail folders">
            {folderLabels.map(({ key, label, icon: Icon }) => {
              const count = messages.filter((message) =>
                key === "starred"
                  ? message.starred
                  : message.folder === key && message.unread,
              ).length;
              return (
                <button
                  key={key}
                  className={folder === key ? "active" : ""}
                  onClick={() => selectFolder(key)}
                >
                  <Icon size={15} />
                  <span>{label}</span>
                  {count > 0 && <b>{count}</b>}
                </button>
              );
            })}
          </nav>
          <div className="email-sync-state">
            <ShieldCheck size={14} />
            <span>
              <strong>Local sample data</strong>
              <small>No provider sync</small>
            </span>
          </div>
        </aside>

        <div
          className={`email-message-list ${selected ? "has-selection" : ""}`}
        >
          <header>
            <div>
              <h2>{folderLabels.find((item) => item.key === folder)?.label}</h2>
              <span>{visible.length} messages</span>
            </div>
            <div className="email-menu-wrap">
              <button
                type="button"
                aria-label="More mailbox actions"
                aria-expanded={mailboxMenuOpen}
                onClick={() => setMailboxMenuOpen((current) => !current)}
              >
                <MoreHorizontal size={16} />
              </button>
              {mailboxMenuOpen && (
                <div className="email-action-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const visibleIds = new Set(
                        visible.map((message) => message.id),
                      );
                      setMessages((current) =>
                        current.map((message) =>
                          visibleIds.has(message.id)
                            ? { ...message, unread: false }
                            : message,
                        ),
                      );
                      setMailboxMenuOpen(false);
                      setNotice("Visible messages marked as read.");
                    }}
                  >
                    <MailOpen size={14} /> Mark visible as read
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setQuery("");
                      setMailboxMenuOpen(false);
                    }}
                  >
                    <Search size={14} /> Clear search
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMailboxMenuOpen(false);
                      setAccountsOpen(true);
                    }}
                  >
                    <Settings2 size={14} /> Manage sample labels
                  </button>
                </div>
              )}
            </div>
          </header>
          <div className="email-list-scroll">
            {visible.map((message) => {
              const account = accounts.find(
                (candidate) => candidate.id === message.accountId,
              );
              return (
                <article
                  key={message.id}
                  className={`${selectedId === message.id ? "selected" : ""} ${
                    message.unread ? "unread" : ""
                  }`}
                >
                  <button
                    className="email-message-open"
                    onClick={() => openMessage(message)}
                  >
                    <span className="email-message-meta">
                      <strong>{message.from}</strong>
                      <time>{message.receivedAt}</time>
                    </span>
                    <span className="email-message-subject">
                      {message.subject}
                    </span>
                    <span className="email-message-preview">
                      {message.preview}
                    </span>
                    <span className="email-message-foot">
                      <i style={{ background: account?.color }} />
                      {account?.label}
                      {message.attachments && <Paperclip size={11} />}
                    </span>
                  </button>
                  <button
                    className={`email-star ${message.starred ? "active" : ""}`}
                    aria-label={`${message.starred ? "Unstar" : "Star"} ${message.subject}`}
                    onClick={() =>
                      updateMessage(message.id, (current) => ({
                        ...current,
                        starred: !current.starred,
                      }))
                    }
                  >
                    <Star
                      size={14}
                      fill={message.starred ? "currentColor" : "none"}
                    />
                  </button>
                </article>
              );
            })}
            {!visible.length && (
              <div className="email-empty">
                <MailOpen size={24} />
                <strong>No messages here</strong>
                <span>Try another account, folder, or search.</span>
              </div>
            )}
          </div>
        </div>

        <div className={`email-reading-pane ${selected ? "open" : ""}`}>
          {selected ? (
            <>
              <header className="email-reading-actions">
                <button
                  className="email-mobile-back"
                  aria-label="Back to message list"
                  onClick={() => setSelectedId(null)}
                >
                  <ArrowLeft size={16} />
                </button>
                <div>
                  <button
                    aria-label="Archive message"
                    onClick={() => moveSelected("archive", "Message archived.")}
                  >
                    <Archive size={15} />
                  </button>
                  <button
                    aria-label={
                      selected.unread ? "Mark as read" : "Mark as unread"
                    }
                    onClick={() =>
                      updateMessage(selected.id, (current) => ({
                        ...current,
                        unread: !current.unread,
                      }))
                    }
                  >
                    {selected.unread ? (
                      <MailOpen size={15} />
                    ) : (
                      <Mail size={15} />
                    )}
                  </button>
                  <button
                    aria-label="Delete message"
                    onClick={() =>
                      moveSelected("trash", "Message moved to Trash.")
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="email-menu-wrap email-message-menu-wrap">
                  <button
                    type="button"
                    aria-label="More message actions"
                    aria-expanded={messageMenuOpen}
                    onClick={() => setMessageMenuOpen((current) => !current)}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {messageMenuOpen && (
                    <div className="email-action-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          updateMessage(selected.id, (current) => ({
                            ...current,
                            unread: !current.unread,
                          }));
                          setMessageMenuOpen(false);
                          setNotice(
                            selected.unread
                              ? "Message marked as read."
                              : "Message marked as unread.",
                          );
                        }}
                      >
                        {selected.unread ? (
                          <MailOpen size={14} />
                        ) : (
                          <Mail size={14} />
                        )}
                        Mark as {selected.unread ? "read" : "unread"}
                      </button>
                      {selected.folder !== "inbox" && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMessageMenuOpen(false);
                            moveSelected("inbox", "Message moved to Inbox.");
                          }}
                        >
                          <Inbox size={14} /> Move to Inbox
                        </button>
                      )}
                      {selected.folder !== "archive" && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMessageMenuOpen(false);
                            moveSelected("archive", "Message archived.");
                          }}
                        >
                          <Archive size={14} /> Archive
                        </button>
                      )}
                      {selected.folder !== "trash" && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMessageMenuOpen(false);
                            moveSelected("trash", "Message moved to Trash.");
                          }}
                        >
                          <Trash2 size={14} /> Move to Trash
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </header>
              <div className="email-reading-scroll">
                <div className="email-reading-title">
                  <span>
                    {
                      emailProvider(
                        accounts.find(
                          (account) => account.id === selected.accountId,
                        )?.provider ?? "custom",
                      ).shortName
                    }
                  </span>
                  <h2>{selected.subject}</h2>
                </div>
                <div className="email-sender-row">
                  <span className="email-sender-avatar">
                    {initials(selected.from)}
                  </span>
                  <div>
                    <strong>{selected.from}</strong>
                    <button
                      type="button"
                      aria-expanded={senderDetailsOpen}
                      aria-label="Show sender and recipient details"
                      title={selected.fromEmail}
                      onClick={() =>
                        setSenderDetailsOpen((current) => !current)
                      }
                    >
                      to me <ChevronDown size={11} />
                    </button>
                  </div>
                  <time>{selected.receivedAt}</time>
                  <button
                    className={selected.starred ? "active" : ""}
                    aria-label="Toggle star"
                    onClick={() =>
                      updateMessage(selected.id, (current) => ({
                        ...current,
                        starred: !current.starred,
                      }))
                    }
                  >
                    <Star
                      size={15}
                      fill={selected.starred ? "currentColor" : "none"}
                    />
                  </button>
                </div>
                {senderDetailsOpen && (
                  <dl className="email-sender-details">
                    <div>
                      <dt>From</dt>
                      <dd>
                        {selected.from} &lt;{selected.fromEmail}&gt;
                      </dd>
                    </div>
                    <div>
                      <dt>To</dt>
                      <dd>{selected.to || "No recipient recorded"}</dd>
                    </div>
                    <div>
                      <dt>Account</dt>
                      <dd>
                        {accounts.find(
                          (account) => account.id === selected.accountId,
                        )?.email ?? "Missing sample label"}
                      </dd>
                    </div>
                  </dl>
                )}
                <div className="email-body">
                  {selected.body.map((paragraph, index) => (
                    <p key={`${selected.id}-${index}`}>{paragraph}</p>
                  ))}
                </div>
                {selected.attachments && (
                  <div className="email-attachments">
                    <strong>
                      <Paperclip size={13} /> {selected.attachments.length}{" "}
                      attachment
                      {selected.attachments.length === 1 ? "" : "s"}
                    </strong>
                    <div>
                      {selected.attachments.map((attachment) => (
                        <span
                          aria-label={`Attachment: ${attachment}`}
                          key={attachment}
                          title="Fictional attachment metadata; no file is stored"
                        >
                          <FileText size={17} />
                          <span>{attachment}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="email-reply-actions">
                  <button
                    onClick={() => {
                      setReplyTo(selected);
                      setComposeMode("reply");
                      setComposeOpen(true);
                    }}
                  >
                    <Reply size={14} /> Reply
                  </button>
                  <button
                    onClick={() => {
                      setReplyTo(selected);
                      setComposeMode("forward");
                      setComposeOpen(true);
                    }}
                  >
                    <Forward size={14} /> Forward
                  </button>
                  <button
                    className="email-promote-action"
                    onClick={() => onPromote(selected)}
                  >
                    <Sparkles size={14} /> Make actionable
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="email-reading-empty">
              <MailOpen size={30} />
              <strong>Select a message</strong>
              <span>
                Read, reply, archive, or turn an email into tracked work.
              </span>
            </div>
          )}
        </div>
      </section>

      {composeOpen && (
        <ComposeDialog
          accounts={accounts}
          mode={composeMode}
          replyTo={replyTo}
          onClose={() => {
            setComposeOpen(false);
            setComposeMode("new");
            setReplyTo(null);
          }}
          onSend={(message) => {
            setMessages((current) => [message, ...current]);
            setComposeOpen(false);
            setComposeMode("new");
            setReplyTo(null);
            setNotice(
              "Sample email added to the fictional Sent folder; nothing was delivered.",
            );
          }}
        />
      )}
      {accountsOpen && (
        <AccountManagerDialog
          accounts={accounts}
          onClose={() => setAccountsOpen(false)}
          onChange={saveAccounts}
          onNotice={setNotice}
        />
      )}
    </div>
  );
}

function ComposeDialog({
  accounts,
  mode,
  replyTo,
  onClose,
  onSend,
}: {
  accounts: EmailAccount[];
  mode: ComposeMode;
  replyTo: EmailMessage | null;
  onClose: () => void;
  onSend: (message: EmailMessage) => void;
}) {
  const [fromAccountId, setFromAccountId] = useState(
    replyTo?.accountId ?? accounts[0]?.id ?? "",
  );
  const [to, setTo] = useState(
    mode === "reply" ? (replyTo?.fromEmail ?? "") : "",
  );
  const [subject, setSubject] = useState(
    replyTo
      ? mode === "forward"
        ? `Fwd: ${replyTo.subject.replace(/^Fwd:\s*/i, "")}`
        : `Re: ${replyTo.subject.replace(/^Re:\s*/i, "")}`
      : "",
  );
  const [body, setBody] = useState(
    mode === "forward" && replyTo
      ? `\n\n---------- Forwarded message ----------\nFrom: ${replyTo.from} <${replyTo.fromEmail}>\nTo: ${replyTo.to}\nSubject: ${replyTo.subject}\n\n${replyTo.body.join("\n\n")}`
      : "",
  );
  const modeLabel =
    mode === "reply" ? "Reply" : mode === "forward" ? "Forward" : "New message";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const account = accounts.find(
      (candidate) => candidate.id === fromAccountId,
    );
    if (!account || !to.trim() || !subject.trim() || !body.trim()) return;
    onSend({
      id: `mail-${Date.now()}`,
      accountId: account.id,
      from: "Mohammed Zaman",
      fromEmail: account.email,
      to: to.trim(),
      subject: subject.trim(),
      preview: body.trim().slice(0, 130),
      body: body.trim().split(/\n\s*\n/),
      receivedAt: "Just now",
      folder: "sent",
      unread: false,
      starred: false,
    });
  };

  return (
    <div className="workflow-dialog-layer" role="presentation">
      <form className="workflow-dialog email-compose-dialog" onSubmit={submit}>
        <header>
          <span className="dialog-title-icon">
            <PenLine size={17} />
          </span>
          <div>
            <p>{modeLabel}</p>
            <h2>{replyTo ? replyTo.subject : "Compose sample email"}</h2>
          </div>
          <button type="button" aria-label="Close composer" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <div className="workflow-dialog-body email-compose-fields">
          <CapabilityNotice capability="email" />
          <label>
            <span>From</span>
            <select
              value={fromAccountId}
              onChange={(event) => setFromAccountId(event.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label} · {account.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>To</span>
            <input
              type="email"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="name@example.com"
              autoFocus
            />
          </label>
          <label>
            <span>Subject</span>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">Message</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write your message…"
              rows={9}
            />
          </label>
        </div>
        <footer className="workflow-dialog-actions">
          <span className="email-compose-safety">
            <ShieldCheck size={13} /> Stored only in this fictional mailbox; not
            sent
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
                !fromAccountId || !to.trim() || !subject.trim() || !body.trim()
              }
            >
              <Send size={14} /> Add to sample Sent folder
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function AccountManagerDialog({
  accounts,
  onClose,
  onChange,
  onNotice,
}: {
  accounts: EmailAccount[];
  onClose: () => void;
  onChange: (accounts: EmailAccount[]) => void;
  onNotice: (message: string) => void;
}) {
  const [selectedProvider, setSelectedProvider] =
    useState<EmailProviderDefinition | null>(null);
  const [email, setEmail] = useState("");
  const [label, setLabel] = useState("");
  const [incomingHost, setIncomingHost] = useState("");
  const [incomingPort, setIncomingPort] = useState("993");
  const [outgoingHost, setOutgoingHost] = useState("");
  const [outgoingPort, setOutgoingPort] = useState("587");

  const chooseProvider = (provider: EmailProviderDefinition) => {
    setSelectedProvider(provider);
    setEmail("");
    setLabel("");
    setIncomingHost(provider.incoming?.host ?? "");
    setIncomingPort(String(provider.incoming?.port ?? 993));
    setOutgoingHost(provider.outgoing?.host ?? "");
    setOutgoingPort(String(provider.outgoing?.port ?? 587));
  };

  const connect = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProvider || !email.trim()) return;
    if (
      selectedProvider.key === "custom" &&
      (!incomingHost.trim() || !outgoingHost.trim())
    )
      return;
    if (
      accounts.some(
        (account) =>
          account.email.toLocaleLowerCase() === email.toLocaleLowerCase(),
      )
    ) {
      onNotice("That sample account label already exists in this browser.");
      return;
    }

    const next: EmailAccount = {
      id: `account-${Date.now()}`,
      provider: selectedProvider.key,
      email: email.trim().toLocaleLowerCase(),
      label: label.trim() || selectedProvider.shortName,
      color: providerColor(selectedProvider.key),
      connectedAt: new Date().toISOString(),
      lastSyncedAt: new Date().toISOString(),
    };
    onChange([...accounts, next]);
    onNotice(
      `${next.label} saved as a browser-local sample. No mailbox was connected.`,
    );
    setSelectedProvider(null);
  };

  const effectiveHosts =
    selectedProvider?.key === "yahoo" && email
      ? yahooHosts(email)
      : { incoming: incomingHost, outgoing: outgoingHost };

  return (
    <div className="settings-dialog-layer" role="presentation">
      <section
        className="settings-dialog email-accounts-dialog"
        role="dialog"
        aria-modal="true"
      >
        <header className="settings-dialog-header">
          <span className="dialog-title-icon">
            <Mail size={17} />
          </span>
          <div>
            <p>Email</p>
            <h2>
              {selectedProvider
                ? `Preview ${selectedProvider.shortName} setup`
                : "Sample mail accounts"}
            </h2>
          </div>
          <button aria-label="Close account manager" onClick={onClose}>
            <X size={17} />
          </button>
        </header>

        {!selectedProvider ? (
          <div className="settings-dialog-body">
            <CapabilityNotice capability="email" />
            <div className="connected-mail-accounts">
              <strong>Browser-local sample labels</strong>
              {accounts.map((account) => {
                const provider = emailProvider(account.provider);
                return (
                  <article key={account.id}>
                    <span
                      className={`email-provider-mark tone-${provider.tone}`}
                    >
                      {provider.mark}
                    </span>
                    <div>
                      <strong>{account.label}</strong>
                      <span>{account.email}</span>
                      <small>
                        <CheckCircle2 size={11} /> Fictional label only
                      </small>
                    </div>
                    <button
                      aria-label={`Remove sample account ${account.email}`}
                      onClick={() => {
                        onChange(
                          accounts.filter(
                            (candidate) => candidate.id !== account.id,
                          ),
                        );
                        onNotice(
                          `${account.email} removed from this browser-only sample.`,
                        );
                      }}
                    >
                      Remove sample
                    </button>
                  </article>
                );
              })}
            </div>
            <div className="email-provider-picker">
              <strong>Add another fictional account label</strong>
              <div>
                {emailProviderDefinitions.map((provider) => (
                  <button
                    key={provider.key}
                    onClick={() => chooseProvider(provider)}
                  >
                    <span
                      className={`email-provider-mark tone-${provider.tone}`}
                    >
                      {provider.mark}
                    </span>
                    <span>
                      <strong>{provider.name}</strong>
                      <small>{provider.description}</small>
                    </span>
                    <Plus size={14} />
                  </button>
                ))}
              </div>
            </div>
            <div className="email-credential-note">
              <ShieldCheck size={16} />
              <span>
                <strong>Do not enter a password or real credential</strong>
                <small>
                  This preview stores only the sample address and label in this
                  browser. OAuth, IMAP, SMTP, sync, and secure credential
                  storage are unavailable.
                </small>
              </span>
            </div>
          </div>
        ) : (
          <form onSubmit={connect}>
            <div className="settings-dialog-body email-connect-form">
              <CapabilityNotice capability="email" />
              <div
                className={`email-provider-summary tone-${selectedProvider.tone}`}
              >
                <span
                  className={`email-provider-mark tone-${selectedProvider.tone}`}
                >
                  {selectedProvider.mark}
                </span>
                <div>
                  <strong>{selectedProvider.name}</strong>
                  <small>{selectedProvider.description}</small>
                </div>
              </div>

              <div className="email-connect-fields">
                <label>
                  <span>Fictional email label</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="sample@example.com"
                    autoFocus
                  />
                </label>
                <label>
                  <span>Account label</span>
                  <input
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder={`${selectedProvider.shortName} account`}
                  />
                </label>
              </div>

              {(selectedProvider.key === "custom" ||
                selectedProvider.key === "yahoo") && (
                <div className="email-server-grid">
                  <label>
                    <span>IMAP server</span>
                    <input
                      value={effectiveHosts.incoming}
                      onChange={(event) => setIncomingHost(event.target.value)}
                      readOnly={selectedProvider.key === "yahoo"}
                    />
                  </label>
                  <label>
                    <span>Port</span>
                    <input
                      inputMode="numeric"
                      value={incomingPort}
                      onChange={(event) => setIncomingPort(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>SMTP server</span>
                    <input
                      value={effectiveHosts.outgoing}
                      onChange={(event) => setOutgoingHost(event.target.value)}
                      readOnly={selectedProvider.key === "yahoo"}
                    />
                  </label>
                  <label>
                    <span>Port</span>
                    <input
                      inputMode="numeric"
                      value={outgoingPort}
                      onChange={(event) => setOutgoingPort(event.target.value)}
                    />
                  </label>
                </div>
              )}

              <div className="permission-list">
                <strong>Future live integration would request</strong>
                {selectedProvider.permissions.map((permission) => (
                  <span key={permission}>
                    <Check size={13} /> {permission}
                  </span>
                ))}
              </div>
              <p className="email-demo-disclaimer">
                <Clock3 size={13} /> Saving creates a browser-local sample label
                only. TREVV does not contact, authenticate, test, or synchronize
                with this provider.
              </p>
            </div>
            <footer className="settings-dialog-actions split-actions">
              <button type="button" onClick={() => setSelectedProvider(null)}>
                Back
              </button>
              <div>
                <button type="button" onClick={onClose}>
                  Cancel
                </button>
                <button
                  className="primary-button"
                  disabled={
                    !email.trim() ||
                    (selectedProvider.key === "custom" &&
                      (!incomingHost.trim() || !outgoingHost.trim()))
                  }
                >
                  Save sample label
                </button>
              </div>
            </footer>
          </form>
        )}

        {!selectedProvider && (
          <footer className="settings-dialog-actions">
            <button onClick={onClose}>Done</button>
          </footer>
        )}
      </section>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function providerColor(provider: EmailProviderKey) {
  return {
    gmail: "#4285f4",
    microsoft: "#0078d4",
    yahoo: "#720e9e",
    icloud: "#687386",
    zoho: "#e94235",
    custom: "#546178",
  }[provider];
}
