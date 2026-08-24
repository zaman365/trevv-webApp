"use client";

import {
  Bell,
  ClipboardCheck,
  Command,
  FileQuestion,
  Grid2X2,
  House,
  Hourglass,
  Inbox,
  LayoutTemplate,
  Lightbulb,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  demoDependencies,
  demoHubs,
  demoItems,
  demoWaitingStates,
  generateAttentionSignals,
} from "@founderhq/core";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { productCopy } from "@/lib/product-copy";
import { trevvBrand } from "@/lib/branding";

type ActivePage =
  | "home"
  | "portfolio"
  | "attention"
  | "myWork"
  | "inbox"
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

export function WorkspaceFrame({
  children,
  active,
  hubSlug,
}: {
  children: ReactNode;
  active: ActivePage;
  hubSlug?: string;
}) {
  const [open, setOpen] = useState(false);
  const copy = productCopy.en;
  const attentionCount = generateAttentionSignals(
    "org-demo",
    demoHubs,
    demoItems,
    demoWaitingStates,
    new Date("2026-08-24T12:00:00.000Z"),
    demoDependencies,
  ).length;
  const nav = [
    ["home", copy.nav.home, "/app/home", House],
    ["portfolio", copy.nav.portfolio, "/app/portfolio", Grid2X2],
    ["attention", copy.nav.attention, "/app/attention", Sparkles],
    ["myWork", copy.nav.myWork, "/app/my-work", ClipboardCheck],
    ["inbox", copy.nav.inbox, "/app/inbox", Inbox],
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
          {nav.map(([key, label, href, Icon]) => (
            <Link
              key={key}
              className={`nav-item ${active === key ? "active" : ""}`}
              href={href}
            >
              <Icon size={17} />
              <span>{label}</span>
              {key === "inbox" && <span className="nav-dot" />}
              {key === "attention" && (
                <span className="nav-badge">{attentionCount}</span>
              )}
            </Link>
          ))}
          <p className="nav-label spaced">{copy.nav.hubs} · Favorites</p>
          {demoHubs.slice(0, 4).map((hub) => (
            <Link
              className={`nav-item hub-nav ${active === "hub" && hubSlug === hub.slug ? "active" : ""}`}
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
          <a
            className={`nav-item ${active === "decisions" ? "active" : ""}`}
            href="/app/decisions"
          >
            <FileQuestion size={17} />
            <span>{copy.nav.decisions}</span>
          </a>
          <a
            className={`nav-item ${active === "ideas" ? "active" : ""}`}
            href="/app/ideas"
          >
            <Lightbulb size={17} />
            <span>{copy.nav.ideas}</span>
          </a>
          <a
            className={`nav-item ${active === "team" ? "active" : ""}`}
            href="/app/team"
          >
            <Users size={17} />
            <span>{copy.nav.team}</span>
          </a>
          <button className="nav-item nav-button">
            <Plus size={16} />
            <span>Create</span>
          </button>
        </nav>
        <div className="sidebar-foot">
          <a
            className={`nav-item ${active === "templates" ? "active" : ""}`}
            href="/app/blueprints"
          >
            <LayoutTemplate size={17} />
            <span>Blueprints</span>
          </a>
          <a
            className={`nav-item ${active === "waiting" ? "active" : ""}`}
            href="/app/waiting"
          >
            <Hourglass size={17} />
            <span>{copy.nav.waiting}</span>
          </a>
          <a
            className={`nav-item ${active === "settings" ? "active" : ""}`}
            href="/app/settings/integrations"
          >
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
          <a href="/app/search" className="search-trigger">
            <Search size={17} />
            <span>{copy.shell.search}</span>
            <kbd>
              <Command size={11} />K
            </kbd>
          </a>
          <div className="topbar-actions">
            <a className="quiet-button capture-button" href="/app/inbox">
              <Plus size={16} />
              {copy.shell.capture}
              <kbd>Q</kbd>
            </a>
            <a
              className="icon-button notification-button"
              aria-label={copy.shell.notifications}
              href="/app/notifications"
            >
              <Bell size={18} />
              <span />
            </a>
            <button
              className="avatar avatar-mz avatar-button"
              aria-label={copy.shell.userMenu}
            >
              MZ
            </button>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
