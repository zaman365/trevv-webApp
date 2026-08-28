"use client";

import {
  Bell,
  BookOpenText,
  ChartColumn,
  CheckCircle2,
  ClipboardCheck,
  Command,
  FileQuestion,
  Grid2X2,
  House,
  Hourglass,
  Inbox,
  Languages,
  LayoutTemplate,
  Lightbulb,
  Menu,
  MessageCircleMore,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Sun,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { productCopy } from "@/lib/product-copy";
import { trevvBrand } from "@/lib/branding";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace-context";
import { vocabularyFor } from "@/lib/terminology";
import { LearningCenterProvider, useLearningCenter } from "./learning-center";
import type { CapturedWorkItem } from "@/lib/captured-work";
import {
  routeForCapturedType,
  UniversalCreateDialog,
} from "./universal-create";
import { useCustomHubs } from "@/lib/custom-hubs";

type ActivePage =
  | "home"
  | "portfolio"
  | "dashboard"
  | "attention"
  | "myWork"
  | "inbox"
  | "messages"
  | "waiting"
  | "decisions"
  | "approvals"
  | "ideas"
  | "team"
  | "reviews"
  | "notifications"
  | "search"
  | "templates"
  | "settings"
  | "hub";

/**
 * The one workspace shell. Every screen renders inside it, so the navigation,
 * the theme and language controls, Quick capture and — critically — the
 * attention badge are defined once and cannot drift between screens.
 */
export function WorkspaceFrame({
  children,
  active,
  hubSlug,
}: {
  children: ReactNode;
  active: ActivePage;
  hubSlug?: string | undefined;
}) {
  return (
    <WorkspaceProvider>
      <LearningCenterProvider>
        <WorkspaceChrome active={active} hubSlug={hubSlug}>
          {children}
        </WorkspaceChrome>
      </LearningCenterProvider>
    </WorkspaceProvider>
  );
}

function WorkspaceChrome({
  children,
  active,
  hubSlug,
}: {
  children: ReactNode;
  active: ActivePage;
  hubSlug?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [latestCapture, setLatestCapture] = useState<CapturedWorkItem | null>(
    null,
  );
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const {
    copy: messages,
    scope,
    theme,
    toggleTheme,
    locale,
    toggleLocale,
    captureOpen,
    setCaptureOpen,
    portfolioId,
  } = useWorkspace();
  const customHubs = useCustomHubs()
    .filter((record) => record.hub.portfolioId === portfolioId)
    .map((record) => record.hub);
  const copy = productCopy.en;
  const vocab = vocabularyFor();
  const { openLearningCenter } = useLearningCenter();

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (event.key === "Escape" && captureOpen) {
        setCaptureOpen(false);
      }
      if (
        event.key.toLocaleLowerCase() === "q" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isTyping
      ) {
        event.preventDefault();
        setCaptureOpen(true);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [captureOpen, setCaptureOpen]);

  // One number, from one place. See lib/attention.ts.
  const attentionCount = scope.attentionCount;

  const nav = [
    ["home", copy.nav.home, "/app/home", House, undefined],
    ["portfolio", copy.nav.portfolio, "/app/portfolio", Grid2X2, undefined],
    ["dashboard", "Dashboard", "/app/dashboard", ChartColumn, undefined],
    [
      "attention",
      copy.nav.attention,
      "/app/attention",
      Sparkles,
      attentionCount,
    ],
    ["myWork", copy.nav.myWork, "/app/my-work", ClipboardCheck, undefined],
    ["inbox", copy.nav.inbox, "/app/inbox", Inbox, undefined],
    ["messages", copy.nav.messages, "/app/messages", MessageCircleMore, 4],
  ] as const;

  return (
    <div className="product-shell workspace-product">
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <span className="brand-mark">
            <span>T</span>
          </span>
          <div>
            <strong>{trevvBrand.name}</strong>
            <span>{trevvBrand.organization}</span>
          </div>
          <button
            className="icon-button mobile-only"
            onClick={() => setOpen(false)}
            aria-label={copy.shell.closeNavigation}
          >
            <X size={18} />
          </button>
        </div>
        <nav aria-label="Primary navigation">
          <p className="nav-label">Workspace</p>
          {nav.map(([key, label, href, Icon, badge]) => (
            <Link
              key={key}
              className={`nav-item ${active === key ? "active" : ""}`}
              href={href}
              aria-current={active === key ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              <Icon size={17} />
              <span>{label}</span>
              {key === "inbox" && <span className="nav-dot" />}
              {badge !== undefined && badge > 0 && (
                <span className="nav-badge">{badge}</span>
              )}
            </Link>
          ))}
          <p className="nav-label spaced">{vocab.many} · Favorites</p>
          {[...customHubs, ...scope.hubs].slice(0, 4).map((hub) => (
            <Link
              className={`nav-item hub-nav ${active === "hub" && hubSlug === hub.slug ? "active" : ""}`}
              href={`/app/hubs/${hub.slug}`}
              key={hub.id}
              onClick={() => setOpen(false)}
            >
              <span
                className="hub-nav-icon"
                style={{ background: `${hub.accent}18`, color: hub.accent }}
              >
                {hub.icon}
              </span>
              <span>{hub.name}</span>
              {hub.health === "critical" && (
                <span className="health-pip critical">
                  <span className="sr-only">Critical</span>
                </span>
              )}
            </Link>
          ))}
          <Link className="nav-item" href="/app/hubs">
            <Grid2X2 size={16} />
            <span>All {vocab.many.toLowerCase()}</span>
          </Link>
          <p className="nav-label spaced">Workflows</p>
          <Link
            className={`nav-item ${active === "decisions" ? "active" : ""}`}
            href="/app/decisions"
          >
            <FileQuestion size={17} />
            <span>{copy.nav.decisions}</span>
          </Link>
          <Link
            className={`nav-item ${active === "ideas" ? "active" : ""}`}
            href="/app/ideas"
          >
            <Lightbulb size={17} />
            <span>{copy.nav.ideas}</span>
          </Link>
          <Link
            className={`nav-item ${active === "team" ? "active" : ""}`}
            href="/app/team"
          >
            <Users size={17} />
            <span>{copy.nav.team}</span>
          </Link>
          <button
            className="nav-item nav-button"
            onClick={() => setCaptureOpen(true)}
          >
            <Plus size={16} />
            <span>Create</span>
          </button>
        </nav>
        <div className="sidebar-foot">
          <Link
            className={`nav-item ${active === "templates" ? "active" : ""}`}
            href="/app/blueprints"
          >
            <LayoutTemplate size={17} />
            <span>Blueprints</span>
          </Link>
          <Link
            className={`nav-item ${active === "waiting" ? "active" : ""}`}
            href="/app/waiting"
          >
            <Hourglass size={17} />
            <span>{copy.nav.waiting}</span>
          </Link>
          <button
            className="nav-item nav-button learning-center-nav"
            onClick={() => {
              setOpen(false);
              openLearningCenter();
            }}
          >
            <BookOpenText size={17} />
            <span>Learning Center</span>
            <span className="learning-nav-mark">
              <Lightbulb size={11} />
            </span>
          </button>
          <Link
            className={`nav-item ${active === "settings" ? "active" : ""}`}
            href="/app/settings/integrations"
          >
            <Settings2 size={17} />
            <span>{copy.nav.settings}</span>
          </Link>
          <button
            aria-expanded={userMenuOpen}
            className="user-card"
            onClick={() => setUserMenuOpen((current) => !current)}
          >
            <span className="avatar avatar-mz">MZ</span>
            <div>
              <strong>Mohammed</strong>
              <span>Owner</span>
            </div>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>
      {open && (
        <button
          className="nav-scrim"
          aria-label={copy.shell.closeNavigation}
          onClick={() => setOpen(false)}
        />
      )}
      <div className="app-column">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setOpen(true)}
            aria-label={copy.shell.openNavigation}
          >
            <Menu size={20} />
          </button>
          <Link href="/app/search" className="search-trigger">
            <Search size={17} />
            <span>{copy.shell.search}</span>
            <kbd>
              <Command size={11} />K
            </kbd>
          </Link>
          <div className="topbar-actions">
            <button
              className="quiet-button capture-button"
              onClick={() => setCaptureOpen(true)}
            >
              <Plus size={16} />
              {copy.shell.capture}
              <kbd>Q</kbd>
            </button>
            <button
              className="icon-button"
              onClick={() => openLearningCenter()}
              aria-label="Open Learning Center"
              title="Learning Center"
            >
              <Lightbulb size={17} />
            </button>
            <button
              className="icon-button"
              onClick={toggleLocale}
              aria-label={messages.common.switchLanguage}
            >
              <Languages size={18} />
              <span className="language-code">{locale.toUpperCase()}</span>
            </button>
            <button
              className="icon-button"
              onClick={toggleTheme}
              aria-label={messages.common.theme}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <Link
              className="icon-button notification-button"
              aria-label={copy.shell.notifications}
              href="/app/notifications"
            >
              <Bell size={18} />
              <span />
            </Link>
            <div className="user-menu-wrap">
              <button
                aria-expanded={userMenuOpen}
                className="avatar avatar-mz avatar-button"
                aria-label={copy.shell.userMenu}
                onClick={() => setUserMenuOpen((current) => !current)}
              >
                MZ
              </button>
              {userMenuOpen && (
                <div className="user-menu" role="menu">
                  <header>
                    <span className="avatar avatar-mz">MZ</span>
                    <div>
                      <strong>Mohammed</strong>
                      <small>Owner · TREVV Demo</small>
                    </div>
                  </header>
                  <Link
                    href="/app/settings/integrations"
                    role="menuitem"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <Settings2 size={14} /> Workspace settings
                  </Link>
                  <Link
                    href="/app/team"
                    role="menuitem"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <Users size={14} /> Team and access
                  </Link>
                  <button
                    role="menuitem"
                    onClick={() => {
                      toggleTheme();
                      setUserMenuOpen(false);
                    }}
                  >
                    {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
                    Switch to {theme === "light" ? "dark" : "light"} mode
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {children}
      </div>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <Link
          className={active === "myWork" ? "active" : ""}
          href="/app/my-work"
        >
          <ClipboardCheck size={19} />
          <span>{messages.nav.myWork}</span>
        </Link>
        <button onClick={() => setCaptureOpen(true)}>
          <span className="mobile-capture">
            <Plus size={22} />
          </span>
          <span>{messages.common.quickCapture}</span>
        </button>
        <Link className={active === "inbox" ? "active" : ""} href="/app/inbox">
          <Inbox size={19} />
          <span>{messages.nav.inbox}</span>
        </Link>
        <Link
          className={active === "messages" ? "active" : ""}
          href="/app/messages"
        >
          <MessageCircleMore size={19} />
          <span>Messages</span>
        </Link>
        <button onClick={() => setOpen(true)}>
          <MoreHorizontal size={19} />
          <span>{messages.common.more}</span>
        </button>
      </nav>

      {latestCapture && (
        <div className="global-capture-toast" role="status">
          <CheckCircle2 size={16} />
          <div>
            <strong>{latestCapture.title}</strong>
            <span>
              {latestCapture.type} created
              {latestCapture.sendToInbox ? " and added to Inbox" : ""}.
            </span>
          </div>
          <Link href={routeForCapturedType(latestCapture.type)}>Open</Link>
          <button
            aria-label="Dismiss capture confirmation"
            onClick={() => setLatestCapture(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {captureOpen && (
        <UniversalCreateDialog
          onClose={() => setCaptureOpen(false)}
          onCreated={(item) => {
            setLatestCapture(item);
            setCaptureOpen(false);
          }}
        />
      )}
    </div>
  );
}
