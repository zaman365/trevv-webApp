"use client";

import {
  AlertTriangle,
  Archive,
  Bell,
  Blocks,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  ClipboardCheck,
  Command,
  FileQuestion,
  Grid2X2,
  House,
  Inbox,
  Languages,
  LayoutTemplate,
  Lightbulb,
  Menu,
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
import { createApiClient } from "@founderhq/api-client";
import {
  demoHubs,
  demoItems,
  demoPortfolios,
  portfolioSignals,
  rollupHub,
  type HubHealth,
} from "@founderhq/core";
import { getMessages, type Locale } from "@founderhq/i18n";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { trevvBrand } from "@/lib/branding";

const api = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787/api/v1",
});
const subscribeToHydration = () => () => undefined;
const getClientHydration = () => true;
const getServerHydration = () => false;

const healthIcon: Record<HubHealth, typeof CheckCircle2> = {
  on_track: CheckCircle2,
  watch: CircleDashed,
  critical: AlertTriangle,
  parked: Archive,
};

export function PortfolioExperience() {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydration,
    getServerHydration,
  );
  const [locale, setLocale] = useState<Locale>("en");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mobileNav, setMobileNav] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [health, setHealth] = useState<HubHealth | "all">("all");
  const [portfolioId, setPortfolioId] = useState("portfolio-demo");
  const [remotePortfolio, setRemotePortfolio] = useState<Awaited<
    ReturnType<typeof api.portfolio>
  > | null>(null);
  const copy = getMessages(locale);
  const now = useMemo(() => new Date("2026-08-24T12:00:00+02:00"), []);
  useEffect(() => {
    let active = true;
    void api
      .portfolio()
      .then((portfolio) => {
        if (active) setRemotePortfolio(portfolio);
      })
      .catch(() => {
        // The seeded local view keeps the demo useful while the API is offline.
      });
    return () => {
      active = false;
    };
  }, []);
  const localPortfolioHubs = demoHubs.filter(
    (hub) => hub.portfolioId === portfolioId,
  );
  const remotePortfolioHubs =
    remotePortfolio?.hubs
      .map(({ hub }) => hub)
      .filter((hub) => hub.portfolioId === portfolioId) ?? [];
  const availableHubs =
    portfolioId === "portfolio-original" || remotePortfolioHubs.length === 0
      ? localPortfolioHubs
      : remotePortfolioHubs;
  const availableHubIds = useMemo(
    () => new Set(availableHubs.map((hub) => hub.id)),
    [availableHubs],
  );
  const portfolioItems = useMemo(
    () => demoItems.filter((item) => availableHubIds.has(item.hubId)),
    [availableHubIds],
  );
  const signals = useMemo(
    () => portfolioSignals(availableHubs, portfolioItems, now),
    [availableHubs, now, portfolioItems],
  );
  const sortedHubs = useMemo(
    () =>
      availableHubs
        .map((hub) => ({ hub, rollup: rollupHub(hub, portfolioItems, now) }))
        .filter(({ hub }) => health === "all" || hub.health === health)
        .sort((a, b) => b.rollup.score - a.rollup.score),
    [availableHubs, health, now, portfolioItems],
  );
  const totalSignals =
    signals.decisions +
    signals.approvals +
    signals.blocked +
    signals.overdueMilestones +
    signals.staleUpdates +
    signals.unassignedUrgent;

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
  };

  return (
    <div className="product-shell" data-hydrated={hydrated}>
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <span className="brand-mark" aria-hidden="true">
            <span>T</span>
          </span>
          <div>
            <strong>{trevvBrand.name}</strong>
            <span>{trevvBrand.organization}</span>
          </div>
          <button
            className="icon-button mobile-only"
            onClick={() => setMobileNav(false)}
            aria-label={copy.common.dismiss}
          >
            <X size={18} />
          </button>
        </div>
        <nav aria-label="Primary navigation">
          <p className="nav-label">Workspace</p>
          <a className="nav-item" href="/app/home">
            <House size={17} />
            <span>Home</span>
          </a>
          <a className="nav-item active" href="/app/portfolio">
            <Grid2X2 size={17} />
            <span>{copy.nav.portfolio}</span>
            <span className="nav-badge">{totalSignals}</span>
          </a>
          <a className="nav-item" href="/app/attention">
            <Sparkles size={17} />
            <span>Attention</span>
            <span className="nav-badge">{totalSignals}</span>
          </a>
          <a className="nav-item" href="/app/my-work">
            <ClipboardCheck size={17} />
            <span>{copy.nav.myWork}</span>
            <kbd>4</kbd>
          </a>
          <a className="nav-item" href="/app/inbox">
            <Inbox size={17} />
            <span>{copy.nav.inbox}</span>
            <span className="nav-dot" />
          </a>
          <p className="nav-label spaced">Hubs · Favorites</p>
          {availableHubs.slice(0, 4).map((hub) => (
            <Link
              className="nav-item hub-nav"
              href={`/app/hubs/${hub.slug}`}
              key={hub.id}
            >
              <span
                className="hub-nav-icon"
                style={{ background: `${hub.accent}18`, color: hub.accent }}
              >
                {hub.icon}
              </span>
              <span>{hub.name}</span>
              {hub.health === "critical" && (
                <span className="health-pip critical" />
              )}
            </Link>
          ))}
          <Link className="nav-item" href="/app/hubs">
            <Grid2X2 size={16} />
            <span>All Hubs</span>
          </Link>
          <p className="nav-label spaced">Workflows</p>
          <a className="nav-item" href="/app/decisions">
            <FileQuestion size={17} />
            <span>{copy.nav.decisions}</span>
            <span className="nav-badge subtle">{signals.decisions}</span>
          </a>
          <a className="nav-item" href="/app/ideas">
            <Lightbulb size={17} />
            <span>Ideas</span>
          </a>
          <a className="nav-item" href="/app/team">
            <Users size={17} />
            <span>Team</span>
          </a>
          <button className="nav-item nav-button">
            <Plus size={16} />
            <span>Create</span>
          </button>
        </nav>
        <div className="sidebar-foot">
          <a className="nav-item" href="/app/blueprints">
            <LayoutTemplate size={17} />
            <span>Blueprints</span>
          </a>
          <a className="nav-item" href="/app/settings/profile">
            <Settings2 size={17} />
            <span>{copy.nav.settings}</span>
          </a>
          <div className="user-card">
            <span className="avatar avatar-mz">MZ</span>
            <div>
              <strong>Mohammed</strong>
              <span>Owner</span>
            </div>
            <MoreHorizontal size={18} />
          </div>
        </div>
      </aside>

      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label={copy.common.dismiss}
          onClick={() => setMobileNav(false)}
        />
      )}

      <div className="app-column">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMobileNav(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <button className="search-trigger">
            <Search size={17} />
            <span>{copy.common.searchPlaceholder}</span>
            <kbd>
              <Command size={11} />K
            </kbd>
          </button>
          <div className="topbar-actions">
            <button
              className="quiet-button capture-button"
              onClick={() => setCaptureOpen(true)}
            >
              <Plus size={16} />
              {copy.common.quickCapture}
              <kbd>Q</kbd>
            </button>
            <button
              className="icon-button"
              onClick={() => setLocale(locale === "en" ? "de" : "en")}
              aria-label={copy.common.switchLanguage}
            >
              <Languages size={18} />
              <span className="language-code">{locale.toUpperCase()}</span>
            </button>
            <button
              className="icon-button"
              onClick={toggleTheme}
              aria-label={copy.common.theme}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <a
              className="icon-button notification-button"
              aria-label={copy.common.notifications}
              href="/app/notifications"
            >
              <Bell size={18} />
              <span />
            </a>
            <button
              className="avatar avatar-mz avatar-button"
              aria-label={copy.common.userMenu}
            >
              MZ
            </button>
          </div>
        </header>

        <main className="portfolio-main">
          <section className="page-heading">
            <div>
              <p className="eyebrow">{copy.portfolio.eyebrow}</p>
              <h1>{copy.portfolio.title}</h1>
              <p>{copy.portfolio.subtitle}</p>
            </div>
            <div className="portfolio-heading-actions">
              <label>
                <span>Selected Portfolio</span>
                <select
                  value={portfolioId}
                  onChange={(event) => setPortfolioId(event.target.value)}
                >
                  {demoPortfolios.map((portfolio) => (
                    <option key={portfolio.id} value={portfolio.id}>
                      {portfolio.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary-button">
                <Plus size={17} />
                {copy.common.newHub}
              </button>
            </div>
          </section>

          <section
            className="attention-panel"
            aria-labelledby="attention-title"
          >
            <div className="attention-heading">
              <div className="attention-icon">
                <Sparkles size={18} />
              </div>
              <div>
                <h2 id="attention-title">{copy.portfolio.attentionTitle}</h2>
                <p>{copy.portfolio.attentionSubtitle}</p>
              </div>
              <span className="signal-total">
                {totalSignals} {copy.common.signals}
              </span>
            </div>
            <div className="signal-grid">
              <SignalCard
                tone="violet"
                icon={FileQuestion}
                count={signals.decisions}
                label="Decisions due"
                note={copy.portfolio.needsDecision}
              />
              <SignalCard
                tone="blue"
                icon={ClipboardCheck}
                count={signals.approvals}
                label={copy.portfolio.approvalsDue}
                note={copy.portfolio.dueSoon}
              />
              <SignalCard
                tone="red"
                icon={Blocks}
                count={signals.blocked}
                label={copy.portfolio.blockedItems}
                note={copy.portfolio.aging}
              />
              <SignalCard
                tone="amber"
                icon={AlertTriangle}
                count={signals.overdueMilestones}
                label={copy.portfolio.overdueMilestones}
                note={copy.portfolio.behindPlan}
              />
              <SignalCard
                tone="gray"
                icon={CircleDashed}
                count={signals.staleUpdates}
                label={copy.portfolio.staleUpdates}
                note={copy.portfolio.updateNeeded}
              />
              <SignalCard
                tone="pink"
                icon={Users}
                count={signals.unassignedUrgent}
                label={copy.portfolio.unassignedUrgent}
                note={copy.portfolio.needsOwner}
              />
            </div>
            <div className="attention-foot">
              <span>
                <span className="live-dot" />
                {copy.portfolio.dataNote}
              </span>
              <a href="/app/attention">
                {copy.common.viewAll} <span aria-hidden="true">→</span>
              </a>
            </div>
          </section>

          <section className="hub-section" aria-labelledby="hubs-title">
            <div className="section-heading">
              <div>
                <h2 id="hubs-title">{copy.portfolio.venturesTitle}</h2>
                <p>{copy.portfolio.venturesSubtitle}</p>
              </div>
              <div className="filters">
                <button>
                  {copy.portfolio.allTypes}
                  <ChevronDown size={14} />
                </button>
                <select
                  aria-label={copy.portfolio.allHealth}
                  value={health}
                  onChange={(event) =>
                    setHealth(event.target.value as HubHealth | "all")
                  }
                >
                  <option value="all">{copy.portfolio.allHealth}</option>
                  <option value="critical">{copy.health.critical}</option>
                  <option value="watch">{copy.health.watch}</option>
                  <option value="on_track">{copy.health.on_track}</option>
                  <option value="parked">{copy.health.parked}</option>
                </select>
                <button>
                  {copy.portfolio.sortAttention}
                  <ChevronDown size={14} />
                </button>
              </div>
            </div>
            <div className="hub-grid">
              {sortedHubs.map(({ hub, rollup }) => (
                <HubCard key={hub.id} hub={hub} rollup={rollup} copy={copy} />
              ))}
            </div>
          </section>
        </main>
      </div>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <a className="active" href="/app/portfolio">
          <Grid2X2 size={19} />
          <span>{copy.nav.portfolio}</span>
        </a>
        <a href="/app/my-work">
          <ClipboardCheck size={19} />
          <span>{copy.nav.myWork}</span>
        </a>
        <button onClick={() => setCaptureOpen(true)}>
          <span className="mobile-capture">
            <Plus size={22} />
          </span>
          <span>{copy.common.quickCapture}</span>
        </button>
        <a href="/app/inbox">
          <Inbox size={19} />
          <span>{copy.nav.inbox}</span>
        </a>
        <button onClick={() => setMobileNav(true)}>
          <MoreHorizontal size={19} />
          <span>{copy.common.more}</span>
        </button>
      </nav>

      {captureOpen && (
        <div
          className="dialog-layer"
          role="presentation"
          onMouseDown={() => setCaptureOpen(false)}
        >
          <section
            className="capture-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={copy.common.quickCapture}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div>
              <span className="attention-icon">
                <Lightbulb size={18} />
              </span>
              <div>
                <h2>{copy.common.quickCapture}</h2>
                <p>Capture now. Organize when you are ready.</p>
              </div>
              <button
                className="icon-button"
                onClick={() => setCaptureOpen(false)}
                aria-label={copy.common.dismiss}
              >
                <X size={18} />
              </button>
            </div>
            <input autoFocus placeholder="What needs to move?" />
            <div className="capture-options">
              <button>
                Task <ChevronDown size={14} />
              </button>
              <button>
                Inbox <ChevronDown size={14} />
              </button>
              <button>
                Owner <ChevronDown size={14} />
              </button>
            </div>
            <footer>
              <span>Press ⌘ + Enter to save</span>
              <button
                className="primary-button"
                onClick={() => setCaptureOpen(false)}
              >
                Capture item
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function SignalCard({
  tone,
  icon: Icon,
  count,
  label,
  note,
}: {
  tone: string;
  icon: typeof FileQuestion;
  count: number;
  label: string;
  note: string;
}) {
  return (
    <button className={`signal-card signal-${tone}`}>
      <span className="signal-icon">
        <Icon size={17} />
      </span>
      <span>
        <strong>{count}</strong>
        <b>{label}</b>
        <small>{note}</small>
      </span>
      <span className="signal-arrow" aria-hidden="true">
        →
      </span>
    </button>
  );
}

function HubCard({
  hub,
  rollup,
  copy,
}: {
  hub: (typeof demoHubs)[number];
  rollup: ReturnType<typeof rollupHub>;
  copy: ReturnType<typeof getMessages>;
}) {
  const HealthIcon = healthIcon[hub.health];
  const staleDays = Math.floor(
    (new Date("2026-08-24").getTime() -
      new Date(hub.latestUpdate.date).getTime()) /
      86_400_000,
  );
  return (
    <a
      className={`hub-card health-${hub.health}`}
      href={`/app/hubs/${hub.slug}`}
      style={{ "--hub-accent": hub.accent } as React.CSSProperties}
    >
      <div className="hub-card-accent" />
      <div className="hub-card-head">
        <span className="hub-icon">{hub.icon}</span>
        <div className="hub-title">
          <h3>{hub.name}</h3>
          <span>{copy.stage[hub.stage]}</span>
        </div>
        <span className={`health-badge ${hub.health}`}>
          <HealthIcon size={13} />
          {copy.health[hub.health]}
        </span>
        <button
          className="card-more"
          aria-label="Hub actions"
          onClick={(event) => event.preventDefault()}
        >
          <MoreHorizontal size={18} />
        </button>
      </div>
      <p className="health-note">{hub.healthNote}</p>
      <div className="priority-block">
        <span>{copy.common.priority}</span>
        <strong>{hub.priority}</strong>
      </div>
      <div className="milestone-row">
        <div>
          <span>{copy.common.milestone}</span>
          <strong>{hub.nextMilestone.title}</strong>
        </div>
        <time dateTime={hub.nextMilestone.date}>
          {new Intl.DateTimeFormat("en", {
            month: "short",
            day: "numeric",
          }).format(new Date(hub.nextMilestone.date))}
        </time>
      </div>
      <div className="hub-stats">
        <span>
          <b>{rollup.open}</b>
          {copy.common.open}
        </span>
        <span className={rollup.overdue ? "stat-danger" : ""}>
          <b>{rollup.overdue}</b>
          {copy.common.overdue}
        </span>
        <span className={rollup.blocked ? "stat-danger" : ""}>
          <b>{rollup.blocked}</b>
          {copy.common.blocked}
        </span>
        <span>
          <b>{rollup.decisions + rollup.approvals}</b>
          {copy.common.attention}
        </span>
      </div>
      <div className="metric-row">
        {hub.metrics.map((metric) => (
          <div key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            {metric.trend && <small>{metric.trend}</small>}
          </div>
        ))}
      </div>
      <div className="update-row">
        <span className="avatar" style={{ background: hub.lead.color }}>
          {hub.lead.initials}
        </span>
        <div>
          <span>
            {copy.common.latestUpdate} ·{" "}
            {staleDays === 0
              ? copy.common.today
              : `${staleDays} ${copy.common.daysAgo}`}
          </span>
          <p>{hub.latestUpdate.text}</p>
        </div>
      </div>
      <span className="open-hub">
        {copy.common.openHub}
        <span aria-hidden="true">→</span>
      </span>
    </a>
  );
}
