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
  FolderKanban,
  Grid2X2,
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
import { demoHubs, demoItems, demoPortfolios } from "@founderhq/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
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

const workspaceHealthLabels = {
  on_track: "On track",
  watch: "Needs attention",
  critical: "Critical",
  parked: "Parked",
} as const;

function workspaceWorkCounts(projectId: string) {
  const openItems = demoItems.filter(
    (item) => item.hubId === projectId && item.status !== "done",
  );

  return {
    open: openItems.length,
    blocked: openItems.filter((item) => item.status === "blocked").length,
  };
}

function formatWorkspaceDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

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
  const customHubs = useCustomHubs().map((record) => record.hub);
  const routeProject = hubSlug
    ? [...customHubs, ...demoHubs].find((project) => project.slug === hubSlug)
    : undefined;
  return (
    <WorkspaceProvider
      restoreStoredProject={active !== "home" && active !== "portfolio"}
      {...(routeProject
        ? {
            initialPortfolioId: routeProject.portfolioId,
            initialProjectId: routeProject.id,
          }
        : {})}
    >
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
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [workspaceQuery, setWorkspaceQuery] = useState("");
  const workspaceMenuRef = useRef<HTMLDivElement>(null);
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
    workspaceLevel,
    projectId,
    selectProject,
    dashboardAccess,
  } = useWorkspace();
  const customHubRecords = useCustomHubs();
  const customHubs = customHubRecords
    .filter((record) => record.hub.portfolioId === portfolioId)
    .map((record) => record.hub);
  const allowedPortfolioIds = new Set(dashboardAccess.portfolioIds);
  const allowedProjectIds = new Set(dashboardAccess.projectIds);
  const accessibleProjects = [
    ...customHubRecords.map((record) => record.hub),
    ...demoHubs,
  ].filter(
    (project) =>
      allowedProjectIds.has(project.id) ||
      allowedPortfolioIds.has(project.portfolioId),
  );
  const visiblePortfolioIds = new Set([
    ...allowedPortfolioIds,
    ...accessibleProjects.map((project) => project.portfolioId),
  ]);
  const accessiblePortfolios = demoPortfolios.filter((portfolio) =>
    visiblePortfolioIds.has(portfolio.id),
  );
  const activeProject = hubSlug
    ? accessibleProjects.find((project) => project.slug === hubSlug)
    : undefined;
  const contextPortfolio =
    accessiblePortfolios.find((portfolio) => portfolio.id === portfolioId) ??
    accessiblePortfolios.find(
      (portfolio) => portfolio.id === activeProject?.portfolioId,
    ) ??
    accessiblePortfolios[0];
  const projectsInContext = accessibleProjects.filter(
    (project) => project.portfolioId === contextPortfolio?.id,
  );
  const contextProject =
    activeProject ??
    (workspaceLevel === "project"
      ? projectsInContext.find((project) => project.id === projectId)
      : undefined);
  const normalizedWorkspaceQuery = workspaceQuery.trim().toLocaleLowerCase();
  const visibleWorkspaceProjects = projectsInContext
    .filter((project) =>
      [
        project.name,
        project.lead.name,
        project.stage,
        workspaceHealthLabels[project.health],
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedWorkspaceQuery),
    )
    .sort((left, right) => {
      if (left.id === contextProject?.id) return -1;
      if (right.id === contextProject?.id) return 1;
      return left.name.localeCompare(right.name);
    });
  const contextProjectCounts = contextProject
    ? workspaceWorkCounts(contextProject.id)
    : undefined;
  const favoriteHubs =
    workspaceLevel === "project" && contextProject
      ? [contextProject]
      : [...customHubs, ...scope.hubs];
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

  useEffect(() => {
    if (!workspaceMenuOpen) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      if (
        workspaceMenuRef.current &&
        !workspaceMenuRef.current.contains(event.target as Node)
      ) {
        setWorkspaceMenuOpen(false);
        setWorkspaceQuery("");
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setWorkspaceMenuOpen(false);
        setWorkspaceQuery("");
      }
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [workspaceMenuOpen]);

  // One number, from one place. See lib/attention.ts.
  const attentionCount = scope.attentionCount;

  const nav = [
    ["portfolio", copy.nav.portfolio, "/app/home", Grid2X2, undefined],
    ...(workspaceLevel === "project" && contextProject
      ? [
          [
            "hub",
            "Project",
            `/app/hubs/${contextProject.slug}`,
            FolderKanban,
            undefined,
          ] as const,
        ]
      : []),
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
          {contextPortfolio ? (
            <div className="workspace-switcher-wrap" ref={workspaceMenuRef}>
              <button
                type="button"
                className="workspace-context-switcher workspace-context-project workspace-switcher-trigger"
                aria-haspopup="dialog"
                aria-expanded={workspaceMenuOpen}
                onClick={() =>
                  setWorkspaceMenuOpen((currentOpen) => !currentOpen)
                }
              >
                <span
                  className="workspace-context-icon project"
                  style={
                    contextProject
                      ? {
                          background: `${contextProject.accent}18`,
                          color: contextProject.accent,
                        }
                      : undefined
                  }
                >
                  {contextProject?.icon ?? <FolderKanban size={15} />}
                </span>
                <span className="workspace-context-copy">
                  <small>Workspace</small>
                  <strong>{contextProject?.name ?? "Choose workspace"}</strong>
                </span>
                <ChevronDown
                  className={`workspace-context-chevron ${workspaceMenuOpen ? "open" : ""}`}
                  size={15}
                  aria-hidden="true"
                />
              </button>

              {workspaceMenuOpen && (
                <section
                  className="workspace-switcher-popover"
                  role="dialog"
                  aria-label="Workspace switcher"
                >
                  <header className="workspace-switcher-header">
                    <span
                      className="workspace-switcher-mark"
                      style={
                        contextProject
                          ? {
                              background: `${contextProject.accent}18`,
                              color: contextProject.accent,
                            }
                          : undefined
                      }
                    >
                      {contextProject?.icon ?? <FolderKanban size={20} />}
                    </span>
                    <div>
                      <small>Current workspace</small>
                      <h2>{contextProject?.name ?? "Select a workspace"}</h2>
                      <p>
                        {contextProject
                          ? `${contextProject.lead.name} · ${workspaceHealthLabels[contextProject.health]}`
                          : `${projectsInContext.length} available in this portfolio`}
                      </p>
                    </div>
                  </header>

                  {contextProject && contextProjectCounts && (
                    <div className="workspace-switcher-summary">
                      <div className="workspace-switcher-stats">
                        <span>
                          <strong>{contextProjectCounts.open}</strong>
                          <small>Open work</small>
                        </span>
                        <span>
                          <strong>{contextProjectCounts.blocked}</strong>
                          <small>Blocked</small>
                        </span>
                        <span>
                          <strong>
                            {formatWorkspaceDate(
                              contextProject.nextMilestone.date,
                            )}
                          </strong>
                          <small>Next milestone</small>
                        </span>
                      </div>
                      <p className="workspace-switcher-milestone">
                        {contextProject.nextMilestone.title}
                      </p>
                      <div className="workspace-switcher-actions">
                        <Link
                          href={`/app/hubs/${contextProject.slug}`}
                          onClick={() => {
                            setWorkspaceMenuOpen(false);
                            setWorkspaceQuery("");
                            setOpen(false);
                          }}
                        >
                          <FolderKanban size={15} /> Open workspace
                        </Link>
                        <Link
                          href="/app/team"
                          onClick={() => {
                            setWorkspaceMenuOpen(false);
                            setWorkspaceQuery("");
                            setOpen(false);
                          }}
                        >
                          <Users size={15} /> People
                        </Link>
                      </div>
                    </div>
                  )}

                  <div className="workspace-switcher-search">
                    <Search size={15} aria-hidden="true" />
                    <input
                      value={workspaceQuery}
                      onChange={(event) =>
                        setWorkspaceQuery(event.currentTarget.value)
                      }
                      placeholder="Find a workspace"
                      aria-label="Find a workspace"
                    />
                    {workspaceQuery && (
                      <button
                        type="button"
                        onClick={() => setWorkspaceQuery("")}
                        aria-label="Clear workspace search"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <div className="workspace-switcher-list">
                    <header>
                      <span>Switch workspace</span>
                      <strong>{visibleWorkspaceProjects.length}</strong>
                    </header>
                    {visibleWorkspaceProjects.map((project) => {
                      const counts = workspaceWorkCounts(project.id);
                      const isSelected = project.id === contextProject?.id;

                      return (
                        <button
                          type="button"
                          className={`workspace-switcher-option ${isSelected ? "selected" : ""}`}
                          aria-pressed={isSelected}
                          key={project.id}
                          onClick={() => {
                            selectProject(project.id, project.portfolioId);
                            setWorkspaceMenuOpen(false);
                            setWorkspaceQuery("");
                            setOpen(false);
                            if (active !== "hub" || project.slug !== hubSlug) {
                              router.push(`/app/hubs/${project.slug}`);
                            }
                          }}
                        >
                          <span
                            className="workspace-switcher-option-mark"
                            style={{
                              background: `${project.accent}18`,
                              color: project.accent,
                            }}
                          >
                            {project.icon}
                          </span>
                          <span className="workspace-switcher-option-copy">
                            <strong>{project.name}</strong>
                            <small>
                              <i
                                className={`workspace-switcher-health ${project.health}`}
                                aria-hidden="true"
                              />
                              {workspaceHealthLabels[project.health]} ·{" "}
                              {counts.open} open
                              {counts.blocked > 0
                                ? ` · ${counts.blocked} blocked`
                                : ""}
                            </small>
                          </span>
                          {isSelected && (
                            <CheckCircle2
                              className="workspace-switcher-selected"
                              size={17}
                              aria-label="Current workspace"
                            />
                          )}
                        </button>
                      );
                    })}
                    {visibleWorkspaceProjects.length === 0 && (
                      <p className="workspace-switcher-empty">
                        No workspace matches “{workspaceQuery.trim()}”.
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    className="workspace-switcher-create"
                    onClick={() => {
                      setWorkspaceMenuOpen(false);
                      setWorkspaceQuery("");
                      setOpen(false);
                      window.dispatchEvent(
                        new Event("trevv:open-workspace-creator"),
                      );
                      router.push("/app/hubs?create=project");
                    }}
                  >
                    <span className="workspace-switcher-create-icon">
                      <Plus size={16} />
                    </span>
                    <span>
                      <strong>New workspace</strong>
                      <small>Start with a project and its first board</small>
                    </span>
                  </button>
                </section>
              )}
            </div>
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
          {nav.map(([key, label, href, Icon, badge]) => {
            const isActive =
              key === "portfolio"
                ? active === "home" || active === "portfolio"
                : active === key;

            return (
              <Link
                key={key}
                className={`nav-item ${isActive ? "active" : ""}`}
                href={href}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <Icon size={17} />
                <span>{label}</span>
                {key === "inbox" && <span className="nav-dot" />}
                {badge !== undefined && badge > 0 && (
                  <span className="nav-badge">{badge}</span>
                )}
              </Link>
            );
          })}
          <p className="nav-label spaced">
            {workspaceLevel === "project"
              ? "Project workspace"
              : `${vocab.many} · Favorites`}
          </p>
          {favoriteHubs.slice(0, 4).map((hub) => (
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
          {contextPortfolio && (
            <label className="workspace-context-switcher sidebar-portfolio-switcher">
              <span className="workspace-context-icon portfolio">
                <Grid2X2 size={16} />
              </span>
              <span className="workspace-context-copy">
                <small>Portfolio</small>
                <strong>{contextPortfolio.name}</strong>
              </span>
              <ChevronDown
                className="workspace-context-chevron"
                size={15}
                aria-hidden="true"
              />
              <select
                className="workspace-context-select"
                aria-label="Current portfolio"
                value={contextPortfolio.id}
                onChange={(event) => {
                  const nextPortfolioId = event.currentTarget.value;
                  const canViewPortfolio =
                    allowedPortfolioIds.has(nextPortfolioId);
                  if (canViewPortfolio) {
                    setPortfolioId(nextPortfolioId);
                  } else {
                    const firstProject = accessibleProjects.find(
                      (project) => project.portfolioId === nextPortfolioId,
                    );
                    if (firstProject)
                      selectProject(firstProject.id, firstProject.portfolioId);
                  }
                  setOpen(false);
                  if (active === "hub") router.push("/app/home");
                }}
              >
                {accessiblePortfolios.map((portfolio) => (
                  <option value={portfolio.id} key={portfolio.id}>
                    {portfolio.name}
                  </option>
                ))}
              </select>
            </label>
          )}
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
              aria-describedby="create-work-shortcut"
            >
              <Plus size={16} />
              <span className="topbar-create-label">Create</span>
              <span
                className="topbar-create-shortcut"
                id="create-work-shortcut"
                role="tooltip"
              >
                Press <kbd>Q</kbd>
              </span>
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
          availableHubIds={scope.hubs.map((hub) => hub.id)}
          {...(workspaceLevel === "project" && projectId
            ? { defaultHubId: projectId }
            : {})}
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
