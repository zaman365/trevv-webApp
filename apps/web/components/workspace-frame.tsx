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
  Mail,
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
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { productCopy } from "@/lib/product-copy";
import { trevvBrand } from "@/lib/branding";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace-context";
import { LearningCenterProvider, useLearningCenter } from "./learning-center";
import type { CapturedWorkItem } from "@/lib/captured-work";
import { UniversalCreateDialog } from "./universal-create";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import { useCustomHubs } from "@/lib/custom-hubs";
import {
  createCustomPortfolio,
  portfolioAccentOptions,
  portfolioVisualFor,
  useCustomPortfolios,
  type CustomPortfolioRecord,
} from "@/lib/custom-portfolios";
import {
  workspaceHref,
  workspaceScopeHref,
  type WorkspaceView,
} from "@/lib/workspace-routes";

type ActivePage =
  | "home"
  | "portfolio"
  | "dashboard"
  | "attention"
  | "myWork"
  | "inbox"
  | "mail"
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

function workspaceViewForCapturedType(
  type: CapturedWorkItem["type"],
): WorkspaceView {
  if (type === "decision") return "decisions";
  if (type === "approval") return "approvals";
  if (type === "idea") return "ideas";
  if (type === "note" || type === "link") return "inbox";
  return "my-work";
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
  const [workspaceCreateOpen, setWorkspaceCreateOpen] = useState(false);
  const [portfolioMenuOpen, setPortfolioMenuOpen] = useState(false);
  const [portfolioCreateOpen, setPortfolioCreateOpen] = useState(false);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const portfolioMenuRef = useRef<HTMLDivElement>(null);
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
  const customPortfolioRecords = useCustomPortfolios();
  const allowedPortfolioIds = new Set(dashboardAccess.portfolioIds);
  const allowedProjectIds = new Set(dashboardAccess.projectIds);
  const customProjectIds = new Set(
    customHubRecords.map((record) => record.hub.id),
  );
  const customPortfolioIds = new Set(
    customPortfolioRecords.map((record) => record.portfolio.id),
  );
  const accessibleProjects = [
    ...customHubRecords.map((record) => record.hub),
    ...demoHubs,
  ].filter(
    (project) =>
      allowedProjectIds.has(project.id) ||
      allowedPortfolioIds.has(project.portfolioId) ||
      customProjectIds.has(project.id),
  );
  const visiblePortfolioIds = new Set([
    ...allowedPortfolioIds,
    ...accessibleProjects.map((project) => project.portfolioId),
  ]);
  const accessiblePortfolios = [
    ...demoPortfolios,
    ...customPortfolioRecords.map((record) => record.portfolio),
  ].filter(
    (portfolio) =>
      visiblePortfolioIds.has(portfolio.id) ||
      customPortfolioIds.has(portfolio.id),
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
  const visibleWorkspaceProjects = [...projectsInContext].sort(
    (left, right) => {
      if (left.id === contextProject?.id) return -1;
      if (right.id === contextProject?.id) return 1;
      return left.name.localeCompare(right.name);
    },
  );
  const contextProjectCounts = contextProject
    ? workspaceWorkCounts(contextProject.id)
    : undefined;
  const contextPortfolioVisual = contextPortfolio
    ? portfolioVisualFor(contextPortfolio, customPortfolioRecords)
    : undefined;
  const copy = productCopy.en;
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
        contextProject &&
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
  }, [captureOpen, contextProject, setCaptureOpen]);

  useEffect(() => {
    if (!workspaceMenuOpen) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      if (
        workspaceMenuRef.current &&
        !workspaceMenuRef.current.contains(event.target as Node)
      ) {
        setWorkspaceMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setWorkspaceMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [workspaceMenuOpen]);

  useEffect(() => {
    if (!portfolioMenuOpen) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      if (
        portfolioMenuRef.current &&
        !portfolioMenuRef.current.contains(event.target as Node)
      ) {
        setPortfolioMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPortfolioMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [portfolioMenuOpen]);

  // One number, from one place. See lib/attention.ts.
  const attentionCount = scope.attentionCount;
  const scopedHref = (view?: WorkspaceView) =>
    workspaceScopeHref(contextProject?.slug, view);

  const nav = [
    ...(contextProject
      ? [["hub", "Overview", scopedHref(), FolderKanban, undefined] as const]
      : []),
    ["dashboard", "Dashboard", scopedHref("dashboard"), ChartColumn, undefined],
    [
      "attention",
      copy.nav.attention,
      scopedHref("attention"),
      Sparkles,
      attentionCount,
    ],
    [
      "myWork",
      copy.nav.myWork,
      scopedHref("my-work"),
      ClipboardCheck,
      undefined,
    ],
    ["inbox", copy.nav.inbox, scopedHref("inbox"), Inbox, undefined],
    [
      "messages",
      copy.nav.messages,
      scopedHref("messages"),
      MessageCircleMore,
      4,
    ],
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
                          href={workspaceHref(contextProject.slug)}
                          onClick={() => {
                            setWorkspaceMenuOpen(false);
                            setOpen(false);
                          }}
                        >
                          <FolderKanban size={15} /> Open workspace
                        </Link>
                        <Link
                          href={workspaceHref(contextProject.slug, "team")}
                          onClick={() => {
                            setWorkspaceMenuOpen(false);
                            setOpen(false);
                          }}
                        >
                          <Users size={15} /> People
                        </Link>
                      </div>
                    </div>
                  )}

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
                            setOpen(false);
                            if (active !== "hub" || project.slug !== hubSlug) {
                              router.push(workspaceHref(project.slug));
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
                  </div>

                  <button
                    type="button"
                    className="workspace-switcher-create"
                    onClick={() => {
                      setWorkspaceMenuOpen(false);
                      setOpen(false);
                      setWorkspaceCreateOpen(true);
                    }}
                  >
                    <span className="workspace-switcher-create-icon">
                      <Plus size={16} />
                    </span>
                    <span>
                      <strong>New workspace</strong>
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
          <Link
            className={`nav-label nav-section-link ${active === "portfolio" ? "active" : ""}`}
            href="/app/portfolio"
            aria-current={active === "portfolio" ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            Portfolio
          </Link>
          <p className="nav-label spaced">Workspace</p>
          {contextProject ? (
            <>
              {nav.map(([key, label, href, Icon, badge]) => {
                const isActive = active === key;

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
              <p className="nav-label spaced">Work</p>
              <Link
                className={`nav-item ${active === "decisions" ? "active" : ""}`}
                href={scopedHref("decisions")}
              >
                <FileQuestion size={17} />
                <span>{copy.nav.decisions}</span>
              </Link>
              <Link
                className={`nav-item ${active === "approvals" ? "active" : ""}`}
                href={scopedHref("approvals")}
              >
                <CheckCircle2 size={17} />
                <span>{copy.nav.approvals}</span>
              </Link>
              <Link
                className={`nav-item ${active === "ideas" ? "active" : ""}`}
                href={scopedHref("ideas")}
              >
                <Lightbulb size={17} />
                <span>{copy.nav.ideas}</span>
              </Link>
              <Link
                className={`nav-item ${active === "reviews" ? "active" : ""}`}
                href={scopedHref("reviews")}
              >
                <ClipboardCheck size={17} />
                <span>{copy.nav.reviews}</span>
              </Link>
              <Link
                className={`nav-item ${active === "waiting" ? "active" : ""}`}
                href={scopedHref("waiting")}
              >
                <Hourglass size={17} />
                <span>{copy.nav.waiting}</span>
              </Link>
              <button
                className="nav-item nav-button"
                onClick={() => setCaptureOpen(true)}
              >
                <Plus size={16} />
                <span>Create</span>
              </button>
              <p className="nav-label spaced">People</p>
              <Link
                className={`nav-item ${active === "team" ? "active" : ""}`}
                href={scopedHref("team")}
              >
                <Users size={17} />
                <span>{copy.nav.team}</span>
              </Link>
            </>
          ) : (
            <button
              className="nav-item nav-button workspace-nav-select"
              type="button"
              onClick={() => setWorkspaceMenuOpen(true)}
            >
              <FolderKanban size={17} />
              <span>Choose a workspace</span>
            </button>
          )}
        </nav>
        <div className="sidebar-foot">
          {contextProject && (
            <>
              <p className="nav-label">System</p>
              <Link
                className={`nav-item ${active === "templates" ? "active" : ""}`}
                href={scopedHref("blueprints")}
              >
                <LayoutTemplate size={17} />
                <span>Blueprints</span>
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
                href={scopedHref("settings")}
              >
                <Settings2 size={17} />
                <span>{copy.nav.settings}</span>
              </Link>
            </>
          )}
          {contextPortfolio && (
            <div className="portfolio-switcher-wrap" ref={portfolioMenuRef}>
              <button
                type="button"
                className="workspace-context-switcher sidebar-portfolio-switcher portfolio-switcher-trigger"
                aria-haspopup="dialog"
                aria-expanded={portfolioMenuOpen}
                onClick={() =>
                  setPortfolioMenuOpen((currentOpen) => !currentOpen)
                }
              >
                <span
                  className="workspace-context-icon portfolio portfolio-logo"
                  style={{
                    background: `${contextPortfolioVisual?.accent ?? "#5b56db"}18`,
                    color: contextPortfolioVisual?.accent ?? "#5b56db",
                  }}
                >
                  {contextPortfolioVisual?.mark ?? "P"}
                </span>
                <span className="workspace-context-copy">
                  <small>Portfolio</small>
                  <strong>{contextPortfolio.name}</strong>
                </span>
                <ChevronDown
                  className={`workspace-context-chevron ${portfolioMenuOpen ? "open" : ""}`}
                  size={15}
                  aria-hidden="true"
                />
              </button>

              {portfolioMenuOpen && (
                <section
                  className="portfolio-switcher-popover"
                  role="dialog"
                  aria-label="Portfolio switcher"
                >
                  <header className="portfolio-switcher-header">
                    <div>
                      <small>Portfolio</small>
                      <h2>Choose portfolio</h2>
                    </div>
                    <span>{accessiblePortfolios.length}</span>
                  </header>

                  <div className="portfolio-switcher-list">
                    {accessiblePortfolios.map((portfolio) => {
                      const visual = portfolioVisualFor(
                        portfolio,
                        customPortfolioRecords,
                      );
                      const portfolioProjectCount = accessibleProjects.filter(
                        (project) => project.portfolioId === portfolio.id,
                      ).length;
                      const isSelected = portfolio.id === contextPortfolio.id;

                      return (
                        <button
                          type="button"
                          className={`portfolio-switcher-option ${isSelected ? "selected" : ""}`}
                          aria-pressed={isSelected}
                          key={portfolio.id}
                          onClick={() => {
                            const canViewPortfolio =
                              allowedPortfolioIds.has(portfolio.id) ||
                              customPortfolioIds.has(portfolio.id);
                            if (canViewPortfolio) {
                              setPortfolioId(portfolio.id);
                              if (active !== "portfolio") {
                                router.push("/app/portfolio");
                              }
                            } else {
                              const firstProject = accessibleProjects.find(
                                (project) =>
                                  project.portfolioId === portfolio.id,
                              );
                              if (firstProject) {
                                selectProject(
                                  firstProject.id,
                                  firstProject.portfolioId,
                                );
                                router.push(workspaceHref(firstProject.slug));
                              }
                            }
                            setPortfolioMenuOpen(false);
                            setOpen(false);
                          }}
                        >
                          <span
                            className="portfolio-option-logo"
                            style={{
                              background: `${visual.accent}18`,
                              color: visual.accent,
                            }}
                          >
                            {visual.mark}
                          </span>
                          <span className="portfolio-option-copy">
                            <strong>{portfolio.name}</strong>
                            <small>
                              {portfolioProjectCount}{" "}
                              {portfolioProjectCount === 1
                                ? "Workspace"
                                : "Workspaces"}
                            </small>
                          </span>
                          {isSelected && (
                            <CheckCircle2
                              className="workspace-switcher-selected"
                              size={17}
                              aria-label="Current portfolio"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    className="portfolio-switcher-create"
                    onClick={() => {
                      setPortfolioMenuOpen(false);
                      setPortfolioCreateOpen(true);
                    }}
                  >
                    <span>
                      <Plus size={16} />
                    </span>
                    <span>
                      <strong>New portfolio</strong>
                      <small>Create a new Workspace collection</small>
                    </span>
                  </button>
                </section>
              )}
            </div>
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
          {contextProject && (
            <Link href={scopedHref("search")} className="search-trigger">
              <Search size={17} />
              <span>{copy.shell.search}</span>
              <kbd>
                <Command size={11} />K
              </kbd>
            </Link>
          )}
          <nav className="topbar-actions" aria-label="Workspace shortcuts">
            {contextProject && (
              <>
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
                  href={scopedHref("attention")}
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
                  href={scopedHref("inbox")}
                  title="Actionable Inbox"
                >
                  <Inbox size={17} />
                  <span className="topbar-tool-dot" aria-hidden="true" />
                </Link>
              </>
            )}
            <Link
              className={`topbar-tool topbar-tool-mail ${active === "mail" ? "active" : ""}`}
              aria-label="Email"
              aria-current={active === "mail" ? "page" : undefined}
              href="/app/mail"
              title="Email"
            >
              <Mail size={18} />
            </Link>
            {contextProject && (
              <>
                <Link
                  className={`topbar-tool topbar-tool-messages ${active === "messages" ? "active" : ""}`}
                  aria-label="Messages"
                  aria-current={active === "messages" ? "page" : undefined}
                  href={scopedHref("messages")}
                  title="Messages"
                >
                  <MessageCircleMore size={18} />
                </Link>
                <Link
                  className={`topbar-tool notification-button ${active === "notifications" ? "active" : ""}`}
                  aria-label={copy.shell.notifications}
                  aria-current={active === "notifications" ? "page" : undefined}
                  href={scopedHref("notifications")}
                  title={copy.shell.notifications}
                >
                  <Bell size={18} />
                  <span
                    className="topbar-tool-dot notification-dot"
                    aria-hidden="true"
                  />
                </Link>
              </>
            )}
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
                  {contextProject && (
                    <>
                      <Link
                        href={scopedHref("settings")}
                        role="menuitem"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <Settings2 size={14} /> Workspace settings
                      </Link>
                      <Link
                        href={scopedHref("team")}
                        role="menuitem"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <Users size={14} /> Team and access
                      </Link>
                    </>
                  )}
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

      <nav
        className={`mobile-bottom-nav ${contextProject ? "" : "portfolio-only"}`}
        aria-label="Mobile navigation"
      >
        {contextProject ? (
          <>
            <Link
              className={active === "myWork" ? "active" : ""}
              href={scopedHref("my-work")}
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
            <Link
              className={active === "inbox" ? "active" : ""}
              href={scopedHref("inbox")}
            >
              <Inbox size={19} />
              <span>{messages.nav.inbox}</span>
            </Link>
            <Link
              className={active === "messages" ? "active" : ""}
              href={scopedHref("messages")}
            >
              <MessageCircleMore size={19} />
              <span>Messages</span>
            </Link>
          </>
        ) : (
          <>
            <Link className="active" href="/app/portfolio">
              <Grid2X2 size={19} />
              <span>Portfolio</span>
            </Link>
            <button onClick={() => setWorkspaceMenuOpen(true)}>
              <FolderKanban size={19} />
              <span>Workspace</span>
            </button>
            <Link href="/app/mail">
              <Mail size={19} />
              <span>Email</span>
            </Link>
          </>
        )}
        <button onClick={() => setOpen(true)}>
          <MoreHorizontal size={19} />
          <span>{messages.common.more}</span>
        </button>
      </nav>

      {contextProject && latestCapture && (
        <div className="global-capture-toast" role="status">
          <CheckCircle2 size={16} />
          <div>
            <strong>{latestCapture.title}</strong>
            <span>
              {latestCapture.type} created
              {latestCapture.sendToInbox ? " and added to Inbox" : ""}.
            </span>
          </div>
          <Link
            href={scopedHref(workspaceViewForCapturedType(latestCapture.type))}
          >
            Open
          </Link>
          <button
            aria-label="Dismiss capture confirmation"
            onClick={() => setLatestCapture(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {contextProject && captureOpen && (
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
      {portfolioCreateOpen && (
        <PortfolioCreateDialog
          onClose={() => setPortfolioCreateOpen(false)}
          onCreated={(record) => {
            setPortfolioCreateOpen(false);
            setPortfolioId(record.portfolio.id);
            setOpen(false);
            router.push("/app/portfolio");
          }}
        />
      )}
      {workspaceCreateOpen && contextPortfolio && (
        <CreateWorkspaceDialog
          portfolios={accessiblePortfolios}
          initialPortfolioId={contextPortfolio.id}
          onClose={() => setWorkspaceCreateOpen(false)}
          onCreated={(workspace) => {
            setWorkspaceCreateOpen(false);
            selectProject(workspace.id, workspace.portfolioId);
            setOpen(false);
            router.push(workspaceHref(workspace.slug));
          }}
        />
      )}
    </div>
  );
}

function PortfolioCreateDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (record: CustomPortfolioRecord) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mark, setMark] = useState("");
  const [markEdited, setMarkEdited] = useState(false);
  const [accent, setAccent] = useState<string>(portfolioAccentOptions[0]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    onCreated(
      createCustomPortfolio({
        name,
        description,
        mark: mark || name.trim().slice(0, 1),
        accent,
      }),
    );
  };

  return (
    <div className="dialog-layer" role="presentation" onMouseDown={onClose}>
      <form
        className="capture-dialog create-portfolio-dialog"
        aria-labelledby="create-portfolio-title"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
        role="dialog"
      >
        <header>
          <span
            className="portfolio-logo-preview"
            style={{ background: `${accent}18`, color: accent }}
            aria-hidden="true"
          >
            {mark || name.trim().slice(0, 1).toUpperCase() || "P"}
          </span>
          <div>
            <h2 id="create-portfolio-title">Create a portfolio</h2>
            <p>
              Group related Workspaces under one recognizable identity and
              overview.
            </p>
          </div>
          <button
            aria-label="Close portfolio creation"
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        </header>

        <div className="create-portfolio-fields">
          <label>
            Portfolio name
            <input
              autoFocus
              onChange={(event) => {
                const nextName = event.currentTarget.value;
                setName(nextName);
                if (!markEdited)
                  setMark(nextName.trim().slice(0, 1).toUpperCase());
              }}
              placeholder="For example, European Ventures"
              required
              value={name}
            />
          </label>
          <div className="portfolio-identity-fields">
            <label>
              Logo mark
              <input
                aria-describedby="portfolio-mark-help"
                maxLength={2}
                onChange={(event) => {
                  setMarkEdited(true);
                  setMark(event.currentTarget.value.toUpperCase());
                }}
                placeholder="EV"
                value={mark}
              />
              <small id="portfolio-mark-help">One or two characters</small>
            </label>
            <fieldset>
              <legend>Brand colour</legend>
              <div className="portfolio-accent-options">
                {portfolioAccentOptions.map((option) => (
                  <button
                    type="button"
                    aria-label={`Use portfolio colour ${option}`}
                    aria-pressed={accent === option}
                    className={accent === option ? "selected" : ""}
                    key={option}
                    onClick={() => setAccent(option)}
                    style={{ "--portfolio-accent": option } as CSSProperties}
                  >
                    {accent === option && <CheckCircle2 size={13} />}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
          <label>
            Purpose
            <textarea
              onChange={(event) => setDescription(event.currentTarget.value)}
              placeholder="What related Workspaces and outcomes belong here?"
              rows={3}
              value={description}
            />
          </label>
        </div>

        <footer>
          <span>You can add the first workspace immediately afterwards.</span>
          <div>
            <button onClick={onClose} type="button">
              Cancel
            </button>
            <button
              className="primary-button"
              disabled={!name.trim()}
              type="submit"
            >
              <Plus size={14} /> Create portfolio
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
