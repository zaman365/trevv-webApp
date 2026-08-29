"use client";

import {
  Bell,
  BookOpenText,
  Building2,
  ChartColumn,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  FileQuestion,
  FolderKanban,
  Grid2X2,
  Hourglass,
  Inbox,
  Languages,
  LayoutTemplate,
  Lightbulb,
  LogOut,
  Mail,
  Menu,
  MessageCircleMore,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  X,
} from "lucide-react";
import { demoWorkspaces, demoItems, demoPortfolios } from "@founderhq/core";
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
import { useWorkspace } from "@/lib/workspace-context";
import { useLearningCenter } from "./learning-center";
import type { CapturedWorkItem } from "@/lib/captured-work";
import { UniversalCreateDialog } from "./universal-create";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import { TechnicalPreviewBadge } from "./capability-status";
import {
  createCustomWorkspace,
  useCustomWorkspaces,
} from "@/lib/custom-workspaces";
import { useAppSession } from "@/lib/app-session-context";
import { useOptionalLiveAppData } from "@/lib/live-app-data";
import {
  LiveCollaborationEventBridge,
  LiveUnreadBadge,
} from "@/lib/live-collaboration";
import { presentLiveError } from "@/lib/live-errors";
import { clearLiveDraftStorage } from "@/lib/live-workflow-ui";
import { LiveStateNotice } from "./live-state";
import {
  LiveQuickCaptureDialog,
  type LiveCaptureSuccess,
} from "./live-quick-capture";
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
  | "teams"
  | "reviews"
  | "notifications"
  | "search"
  | "templates"
  | "settings"
  | "workspace";

const workspaceHealthLabels = {
  on_track: "On track",
  watch: "Needs attention",
  critical: "Critical",
  parked: "Parked",
} as const;

function workspaceWorkCounts(projectId: string, items = demoItems) {
  const openItems = items.filter(
    (item) => item.workspaceId === projectId && item.status !== "done",
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

function initialsForUser(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
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
  workspaceSlug,
}: {
  children: ReactNode;
  active: ActivePage;
  workspaceSlug?: string | undefined;
}) {
  // Providers live in app/app/layout.tsx so they survive navigation.
  return (
    <WorkspaceChrome active={active} workspaceSlug={workspaceSlug}>
      {children}
    </WorkspaceChrome>
  );
}

function WorkspaceChrome({
  children,
  active,
  workspaceSlug,
}: {
  children: ReactNode;
  active: ActivePage;
  workspaceSlug?: string | undefined;
}) {
  const appSession = useAppSession();
  const liveData = useOptionalLiveAppData();
  const userInitials = initialsForUser(appSession.user.name) || "U";
  const [open, setOpen] = useState(false);
  const [latestCapture, setLatestCapture] = useState<CapturedWorkItem | null>(
    null,
  );
  const [latestLiveCapture, setLatestLiveCapture] =
    useState<LiveCaptureSuccess | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [accountMessage, setAccountMessage] = useState("");
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
    dataMode,
    allPortfolios,
    allWorkspaces,
    allItems,
    lastRefreshedAt,
  } = useWorkspace();
  const customWorkspaceRecords = useCustomWorkspaces();
  const customPortfolioRecords = useCustomPortfolios();
  const allowedPortfolioIds = new Set(dashboardAccess.portfolioIds);
  const allowedProjectIds = new Set(dashboardAccess.projectIds);
  const customProjectIds = new Set(
    customWorkspaceRecords.map((record) => record.workspace.id),
  );
  const customPortfolioIds = new Set(
    customPortfolioRecords.map((record) => record.portfolio.id),
  );
  const workspaceSource =
    dataMode === "live"
      ? allWorkspaces
      : [
          ...customWorkspaceRecords.map((record) => record.workspace),
          ...demoWorkspaces,
        ];
  const portfolioSource =
    dataMode === "live"
      ? allPortfolios
      : [
          ...demoPortfolios,
          ...customPortfolioRecords.map((record) => record.portfolio),
        ];
  const accessibleProjects = workspaceSource.filter(
    (project) =>
      allowedProjectIds.has(project.id) ||
      allowedPortfolioIds.has(project.portfolioId) ||
      customProjectIds.has(project.id),
  );
  const visiblePortfolioIds = new Set([
    ...allowedPortfolioIds,
    ...accessibleProjects.map((project) => project.portfolioId),
  ]);
  const accessiblePortfolios = portfolioSource.filter(
    (portfolio) =>
      visiblePortfolioIds.has(portfolio.id) ||
      customPortfolioIds.has(portfolio.id),
  );
  const activeProject = workspaceSlug
    ? accessibleProjects.find((project) => project.slug === workspaceSlug)
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
    ? workspaceWorkCounts(
        contextProject.id,
        dataMode === "live" ? [...allItems] : demoItems,
      )
    : undefined;
  const contextPortfolioVisual = contextPortfolio
    ? portfolioVisualFor(contextPortfolio, customPortfolioRecords)
    : undefined;
  const copy = productCopy.en;
  const { openLearningCenter } = useLearningCenter();

  async function signOut() {
    setAccountMessage("");
    setUserMenuOpen(false);
    if (!appSession.demo) {
      const response = await fetch("/api/web/sign-out", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) {
        setAccountMessage("Sign-out failed. Your session is still active.");
        setUserMenuOpen(true);
        return;
      }
    }
    clearLiveDraftStorage(window.localStorage);
    window.location.replace("/sign-in?signedOut=1");
  }

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
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isTyping
      ) {
        event.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>(
          "[data-trevv-search-input]",
        );

        if (searchInput) {
          searchInput.focus();
        } else {
          router.push(workspaceHref(contextProject.slug, "search"));
        }
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
  }, [captureOpen, contextProject, router, setCaptureOpen]);

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
      ? [
          [
            "workspace",
            "Overview",
            scopedHref(),
            FolderKanban,
            undefined,
          ] as const,
        ]
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
      appSession.demo ? 4 : undefined,
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
                          href={workspaceHref(contextProject.slug, "teams")}
                          onClick={() => {
                            setWorkspaceMenuOpen(false);
                            setOpen(false);
                          }}
                        >
                          <Users size={15} /> Teams
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
                      const counts = workspaceWorkCounts(
                        project.id,
                        dataMode === "live" ? [...allItems] : demoItems,
                      );
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
                            if (
                              active !== "workspace" ||
                              project.slug !== workspaceSlug
                            ) {
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

                  {appSession.demo ||
                  canManageOrganization(appSession.organization.role) ? (
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
                        <strong>
                          {appSession.demo
                            ? "New fictional workspace"
                            : "New workspace"}
                        </strong>
                      </span>
                    </button>
                  ) : null}
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
            className={`nav-item ${active === "portfolio" ? "active" : ""}`}
            href="/app/portfolio"
            aria-current={active === "portfolio" ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            <Grid2X2 size={17} />
            <span>Portfolio</span>
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
                    {key === "messages" &&
                    !appSession.demo &&
                    contextProject ? (
                      <LiveUnreadBadge workspaceId={contextProject.id} />
                    ) : null}
                  </Link>
                );
              })}
              <Link
                className={`nav-item ${active === "teams" ? "active" : ""}`}
                href={scopedHref("teams")}
              >
                <Users size={17} />
                <span>{copy.nav.teams}</span>
              </Link>
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
              {appSession.demo ? (
                <Link
                  className={`nav-item ${active === "ideas" ? "active" : ""}`}
                  href={scopedHref("ideas")}
                >
                  <Lightbulb size={17} />
                  <span>{copy.nav.ideas}</span>
                </Link>
              ) : null}
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
              {appSession.demo ? (
                <Link
                  className={`nav-item ${active === "templates" ? "active" : ""}`}
                  href={scopedHref("blueprints")}
                >
                  <LayoutTemplate size={17} />
                  <span>Blueprints</span>
                </Link>
              ) : null}
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

                  {appSession.demo ? (
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
                  ) : null}
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
            <Link
              href={scopedHref("search")}
              className="search-trigger"
              aria-keyshortcuts="/"
            >
              <Search size={17} />
              <span>{copy.shell.search}</span>
              <kbd title="Press slash to search">/</kbd>
            </Link>
          )}
          <TechnicalPreviewBadge mode={appSession.demo ? "demo" : "live"} />
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
            {appSession.demo ? (
              <Link
                className={`topbar-tool topbar-tool-mail ${active === "mail" ? "active" : ""}`}
                aria-label="Email"
                aria-current={active === "mail" ? "page" : undefined}
                href="/app/mail"
                title="Email"
              >
                <Mail size={18} />
              </Link>
            ) : null}
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
                {appSession.demo ? (
                  <Link
                    className={`topbar-tool notification-button ${active === "notifications" ? "active" : ""}`}
                    aria-label={copy.shell.notifications}
                    aria-current={
                      active === "notifications" ? "page" : undefined
                    }
                    href={scopedHref("notifications")}
                    title={copy.shell.notifications}
                  >
                    <Bell size={18} />
                    <span
                      className="topbar-tool-dot notification-dot"
                      aria-hidden="true"
                    />
                  </Link>
                ) : null}
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
                {userInitials}
              </button>
              {userMenuOpen && (
                <div className="user-menu" role="menu">
                  <header>
                    <span className="avatar avatar-mz">{userInitials}</span>
                    <div>
                      <strong>{appSession.user.name}</strong>
                      <small>
                        {appSession.demo
                          ? "Fictional demo"
                          : appSession.user.role}{" "}
                        · {appSession.organization.name}
                      </small>
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
                        href={scopedHref("teams")}
                        role="menuitem"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <Users size={14} /> Teams and access
                      </Link>
                    </>
                  )}
                  <Link
                    href="/app/account/sessions"
                    role="menuitem"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <ShieldCheck size={14} /> Sessions and sign-in
                  </Link>
                  {appSession.availableOrganizations.length > 1 ? (
                    <Link
                      href="/select-organization"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <Building2 size={14} /> Switch organization
                    </Link>
                  ) : null}
                  {canManageOrganization(appSession.organization.role) ? (
                    <Link
                      href="/app/account/invitations"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <Users size={14} /> Organization invitations
                    </Link>
                  ) : null}
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
                  <button role="menuitem" onClick={() => void signOut()}>
                    <LogOut size={14} /> Sign out
                  </button>
                  {accountMessage ? (
                    <p className="user-menu-message" role="alert">
                      {accountMessage}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </nav>
        </header>
        {!appSession.demo && liveData?.stale ? (
          <div className="live-data-banner">
            <LiveStateNotice
              compact
              {...(liveData.error
                ? presentLiveError(liveData.error)
                : {
                    kind: "stale" as const,
                    title: "Showing last-known data",
                    description:
                      "TREVV has not completed a recent refresh. New writes remain unavailable until acknowledged.",
                  })}
              {...(lastRefreshedAt !== undefined
                ? { lastSyncedAt: lastRefreshedAt }
                : {})}
              actions={
                <button type="button" onClick={() => void liveData.refresh()}>
                  Retry now
                </button>
              }
            />
          </div>
        ) : null}
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
            {appSession.demo ? (
              <Link href="/app/mail">
                <Mail size={19} />
                <span>Email</span>
              </Link>
            ) : null}
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
              Sample {latestCapture.type} added in this browser
              {latestCapture.sendToInbox
                ? " and shown in the sample Inbox"
                : ""}
              .
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
      {contextProject && latestLiveCapture && (
        <div className="global-capture-toast" role="status">
          <CheckCircle2 size={16} />
          <div>
            <strong>{latestLiveCapture.title}</strong>
            <span>
              {latestLiveCapture.replayed
                ? "The original server-confirmed result was recovered safely."
                : latestLiveCapture.destination === "inbox"
                  ? "Saved to the canonical Inbox."
                  : "Saved as a canonical board item."}
            </span>
          </div>
          <Link
            href={workspaceHref(
              latestLiveCapture.workspaceSlug,
              latestLiveCapture.routeView,
            )}
          >
            Open
          </Link>
          <button
            aria-label="Dismiss capture confirmation"
            onClick={() => setLatestLiveCapture(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {contextProject &&
        captureOpen &&
        (appSession.demo ? (
          <UniversalCreateDialog
            availableWorkspaceIds={scope.workspaces.map(
              (workspace) => workspace.id,
            )}
            {...(workspaceLevel === "project" && projectId
              ? { defaultWorkspaceId: projectId }
              : {})}
            onClose={() => setCaptureOpen(false)}
            onCreated={(item) => {
              setLatestCapture(item);
              setCaptureOpen(false);
            }}
          />
        ) : liveData ? (
          <LiveQuickCaptureDialog
            workspaceId={contextProject.id}
            workspaceSlug={contextProject.slug}
            onClose={() => setCaptureOpen(false)}
            onConfirmed={(result) => {
              setLatestLiveCapture(result);
              setCaptureOpen(false);
            }}
          />
        ) : null)}
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
          mode={appSession.demo ? "demo" : "live"}
          onClose={() => setWorkspaceCreateOpen(false)}
          onCreated={async (values) => {
            if (appSession.demo) {
              const record = createCustomWorkspace(values);
              const response = await fetch("/api/web/demo-workspaces", {
                body: JSON.stringify({ slug: record.workspace.slug }),
                credentials: "same-origin",
                headers: { "content-type": "application/json" },
                method: "POST",
              });
              if (!response.ok) return false;
              setWorkspaceCreateOpen(false);
              selectProject(record.workspace.id, record.workspace.portfolioId);
              setOpen(false);
              router.push(workspaceHref(record.workspace.slug));
              return true;
            }
            if (!liveData) return false;
            const slug = availableSlug(
              values.name,
              liveData.workspaces.map((workspace) => workspace.slug),
            );
            const result = await liveData.client.createWorkspace(
              {
                portfolioId: values.portfolioId,
                name: values.name,
                slug,
                description: "",
                type: values.type,
                accent: "#5b56db",
                icon: values.name.trim().slice(0, 1).toUpperCase(),
                stage: "idea",
                health: "on_track",
                healthNote: "",
                priority: values.priority,
                initialBoardName: `${values.name.trim()} Board`,
              },
              crypto.randomUUID(),
            );
            await liveData.refresh();
            setWorkspaceCreateOpen(false);
            selectProject(
              result.data.workspace.id,
              result.data.workspace.portfolioId,
            );
            setOpen(false);
            router.push(workspaceHref(result.data.workspace.slug));
            return true;
          }}
        />
      )}
      {!appSession.demo && contextProject ? (
        <LiveCollaborationEventBridge workspaceId={contextProject.id} />
      ) : null}
    </div>
  );
}

function canManageOrganization(role: string): boolean {
  return role === "owner" || role === "admin";
}

function availableSlug(name: string, existingSlugs: readonly string[]) {
  const base =
    name
      .trim()
      .toLocaleLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "workspace";
  const existing = new Set(existingSlugs);
  let candidate = base;
  let suffix = 2;
  while (existing.has(candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
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
