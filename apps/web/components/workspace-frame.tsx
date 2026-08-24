"use client";

import {
  Bell,
  ClipboardCheck,
  Command,
  FileQuestion,
  Grid2X2,
  Inbox,
  LayoutTemplate,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { demoHubs } from "@founderhq/core";
import { useState, type ReactNode } from "react";
import { productCopy } from "@/lib/product-copy";

type ActivePage =
  | "portfolio"
  | "myWork"
  | "inbox"
  | "decisions"
  | "approvals"
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
  const nav = [
    ["portfolio", copy.nav.portfolio, "/app/portfolio", Grid2X2],
    ["myWork", copy.nav.myWork, "/app/my-work", ClipboardCheck],
    ["inbox", copy.nav.inbox, "/app/inbox", Inbox],
    ["decisions", copy.nav.decisions, "/app/decisions", FileQuestion],
    ["approvals", copy.nav.approvals, "/app/approvals", ClipboardCheck],
  ] as const;
  return (
    <div className="product-shell workspace-product">
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <span className="brand-mark">
            <span>F</span>
          </span>
          <div>
            <strong>{process.env.NEXT_PUBLIC_APP_NAME ?? "FounderHQ"}</strong>
            <span>FounderHQ Demo</span>
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
            <a
              key={key}
              className={`nav-item ${active === key ? "active" : ""}`}
              href={href}
            >
              <Icon size={17} />
              <span>{label}</span>
              {key === "inbox" && <span className="nav-dot" />}
            </a>
          ))}
          <p className="nav-label spaced">{copy.nav.hubs}</p>
          {demoHubs.slice(0, 7).map((hub) => (
            <a
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
            </a>
          ))}
          <button className="nav-item nav-button">
            <Plus size={16} />
            <span>New Hub</span>
          </button>
        </nav>
        <div className="sidebar-foot">
          <a
            className={`nav-item ${active === "templates" ? "active" : ""}`}
            href="/app/templates"
          >
            <LayoutTemplate size={17} />
            <span>{copy.nav.templates}</span>
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
            <button
              className="icon-button notification-button"
              aria-label={copy.shell.notifications}
            >
              <Bell size={18} />
              <span />
            </button>
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
