"use client";

import {
  Bell,
  BookOpenText,
  ChartColumn,
  CheckCircle2,
  ChevronDown,
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
import { demoHubs, demoPortfolios } from "@founderhq/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
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
    setPortfolioId,
    dashboardAccess,
  } = useWorkspace();
  const customHubRecords = useCustomHubs();
  const customHubs = customHubRecords
    .filter((record) => record.hub.portfolioId === portfolioId)
    .map((record) => record.hub);
  const allowedPortfolioIds = new Set(dashboardAccess.portfolioIds);
  const allowedProjectIds = new Set(dashboardAccess.projectIds);
  const accessiblePortfolios = demoPortfolios.filter((portfolio) =>
    allowedPortfolioIds.has(portfolio.id),
  );
  const accessibleProjects = [
    ...customHubRecords.map((record) => record.hub),
    ...demoHubs,
  ].filter(
    (project) =>
      allowedProjectIds.has(project.id) ||
      allowedPortfolioIds.has(project.portfolioId),
  );
  const activeProject = hubSlug
    ? accessibleProjects.find((project) => project.slug === hubSlug)
    : undefined;
  const contextLevel =
    activeProject || accessiblePortfolios.length === 0
      ? "project"
      : "portfolio";
  const contextPortfolio =
    accessiblePortfolios.find((portfolio) => portfolio.id === portfolioId) ??
    accessiblePortfolios[0];
  const contextProject = activeProject ?? accessibleProjects[0];
  const contextName =
    contextLevel === "project" ? contextProject?.name : contextPortfolio?.name;
  const contextValue =
    contextLevel === "project" ? contextProject?.id : contextPortfolio?.id;
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
        <div className="brand-row workspace-context-row">
          {contextName && contextValue ? (
            <label className="workspace-context-switcher">
              <span
                className={`workspace-context-icon ${contextLevel}`}
                style={
                  contextLevel === "project" && contextProject
                    ? {
                        background: `${contextProject.accent}18`,
                        color: contextProject.accent,
                      }
                    : undefined
                }
              >
                {contextLevel === "project" ? (
                  contextProject?.icon
                ) : (
                  <Grid2X2 size={16} />
                )}
              </span>
              <span className="workspace-context-copy">
                <small>{contextLevel}</small>
                <strong>{contextName}</strong>
              </span>
              <ChevronDown
                className="workspace-context-chevron"
                size={15}
                aria-hidden="true"
              />
              <select
                className="workspace-context-select"
                aria-label={`Current ${contextLevel}`}
                value={contextValue}
                onChange={(event) => {
                  if (contextLevel === "portfolio") {
                    setPortfolioId(event.currentTarget.value);
                    return;
                  }
                  const project = accessibleProjects.find(
                    (candidate) => candidate.id === event.currentTarget.value,
                  );
                  if (!project) return;
                  setPortfolioId(project.portfolioId);
                  setOpen(false);
                  if (project.slug !== hubSlug) {
                    router.push(`/app/hubs/${project.slug}`);
                  }
                }}
              >
                {contextLevel === "portfolio"
                  ? accessiblePortfolios.map((portfolio) => (
                      <option value={portfolio.id} key={portfolio.id}>
                        {portfolio.name}
                      </option>
                    ))
                  : accessibleProjects.map((project) => (
                      <option value={project.id} key={project.id}>
                        {project.name}
                      </option>
                    ))}
              </select>
            </label>
          ) : (
            <div className="workspace-context-switcher is-static">
              <span className="workspace-context-icon portfolio">
                <Grid2X2 size={16} />
              </span>
              <span className="workspace-context-copy">
                <small>Workspace</small>
                <strong>{trevvBrand.organization}</strong>
              </span>
            </div>
          )}
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
              <span>Owner · {trevvBrand.name}</span>
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
          <nav className="topbar-actions" aria-label="Workspace shortcuts">
            <button
              className="quiet-button capture-button topbar-create-button"
              onClick={() => setCaptureOpen(true)}
              aria-label="Create work"
              title="Create work (Q)"
            >
              <Plus size={16} />
              <span className="topbar-create-label">Create</span>
              <kbd>Q</kbd>
            </button>
            <Link
              className={`topbar-tool topbar-tool-attention ${active === "attention" ? "active" : ""}`}
              aria-label={`Attention, ${attentionCount} items`}
              aria-current={active === "attention" ? "page" : undefined}
              href="/app/attention"
              title={`Attention · ${attentionCount} items`}
            >
              <Sparkles size={17} />
              {attentionCount > 0 && (
                <span className="topbar-tool-badge" aria-hidden="true">
                  {attentionCount}
                </span>
              )}
            </Link>
            <Link
              className={`topbar-tool topbar-tool-inbox ${active === "inbox" ? "active" : ""}`}
              aria-label="Actionable Inbox"
              aria-current={active === "inbox" ? "page" : undefined}
              href="/app/inbox"
              title="Actionable Inbox"
            >
              <Inbox size={17} />
              <span className="topbar-tool-dot" aria-hidden="true" />
            </Link>
            <Link
              className={`topbar-tool topbar-tool-messages ${active === "messages" ? "active" : ""}`}
              aria-label="Messages"
              aria-current={active === "messages" ? "page" : undefined}
              href="/app/messages"
              title="Messages"
            >
              <MessageCircleMore size={18} />
            </Link>
            <Link
              className={`topbar-tool notification-button ${active === "notifications" ? "active" : ""}`}
              aria-label={copy.shell.notifications}
              aria-current={active === "notifications" ? "page" : undefined}
              href="/app/notifications"
              title={copy.shell.notifications}
            >
              <Bell size={18} />
              <span
                className="topbar-tool-dot notification-dot"
                aria-hidden="true"
              />
            </Link>
            <button
              className="topbar-tool topbar-tool-help"
              onClick={() => openLearningCenter()}
              aria-label="Open Learning Center"
              title="Learning Center"
            >
              <Lightbulb size={17} />
            </button>
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
                      <small>Owner · {trevvBrand.organization}</small>
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
                      toggleLocale();
                      setUserMenuOpen(false);
                    }}
                  >
                    <Languages size={14} />
                    Switch to {locale === "en" ? "German" : "English"}
                  </button>
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
          </nav>
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
