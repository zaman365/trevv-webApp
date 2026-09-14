"use client";
import dynamic from "next/dynamic";
import { PageTabs } from "./page-tabs";

import { Activity, Suspense, useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import sectionStyles from "./workspace-dashboard.module.css";
import {
  ChartNoAxesCombined,
  ListTodo,
  FolderKanban,
  Lightbulb,
  Users,
  MessageCircleMore,
  Inbox,
  Sparkles,
  FileQuestion,
  ClipboardCheck,
  Clock3,
} from "lucide-react";
const icons = {
  summary: ChartNoAxesCombined,
  "my-work": ListTodo,
  planning: FolderKanban,
  "report-log": ClipboardCheck,
  ideas: Lightbulb,
  teams: Users,
  messages: MessageCircleMore,
  inbox: Inbox,
  attention: Sparkles,
  decisions: FileQuestion,
  approvals: ClipboardCheck,
  waiting: Clock3,
};
import { AppLink as Link } from "@/components/navigation-link";
import {
  dashboardNavigationSections,
  dashboardSectionFromSearch,
  dashboardSectionUrl,
  type DashboardSection,
} from "@/lib/dashboard-sections";
import { workspaceHref } from "@/lib/workspace-routes";
import { LiveStateNotice } from "./live-state";

export function useDashboardSections(workspaceSlug: string) {
  const [section, setSection] = useState<DashboardSection>("summary");
  const [visited, setVisited] = useState<DashboardSection[]>(["summary"]);
  useEffect(() => {
    const sync = () => {
      const next = dashboardSectionFromSearch(window.location.search);
      setSection(next);
      setVisited((current) =>
        current.includes(next) ? current : [...current, next],
      );
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [workspaceSlug]);
  function select(next: DashboardSection) {
    if (section === next) return;
    window.history.pushState(
      null,
      "",
      dashboardSectionUrl(window.location.href, next),
    );
    setSection(next);
    setVisited((current) =>
      current.includes(next) ? current : [...current, next],
    );
  }
  return { section, visited, select };
}

export function DashboardTabs({
  value,
  onChange,
}: {
  value: DashboardSection;
  onChange: (section: DashboardSection) => void;
}) {
  return (
    <PageTabs
      id="dashboard"
      label="Dashboard sections"
      value={value}
      onChange={(id) => onChange(id as DashboardSection)}
      sections={dashboardNavigationSections.map((section) => {
        const Icon = icons[section.id];
        return { ...section, icon: <Icon size={16} aria-hidden="true" /> };
      })}
    />
  );
}

export function DashboardPanel({
  section,
  active,
  workspaceSlug,
  children,
}: {
  section: DashboardSection;
  active: boolean;
  workspaceSlug: string;
  children: ReactNode;
}) {
  const meta = dashboardNavigationSections.find(
    (entry) => entry.id === section,
  )!;
  return (
    <Activity mode={active ? "visible" : "hidden"}>
      <section
        id={`dashboard-panel-${section}`}
        role="tabpanel"
        aria-labelledby={`dashboard-tab-${section}`}
        className={sectionStyles.sectionPanel}
      >
        <header className={sectionStyles.sectionHeading}>
          <div>
            <h2>{meta.title}</h2>
            <p>{meta.description}</p>
          </div>
          <Link
            href={`${workspaceHref(workspaceSlug, meta.view)}${section === "planning" ? "?mode=sprints" : ""}`}
            aria-label={`Open ${meta.title} full page`}
          >
            Open full page <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </header>
        <Suspense
          fallback={
            <LiveStateNotice kind="loading" title={`Loading ${meta.label}`} />
          }
        >
          {children}
        </Suspense>
      </section>
    </Activity>
  );
}

// Secondary sections load when selected while the summary stays immediately available.
export const DashboardSectionContent = dynamic(
  () =>
    import("./live-dashboard-section-content").then(
      (module) => module.DashboardSectionContent,
    ),
  {
    loading: () => (
      <LiveStateNotice kind="loading" title="Loading dashboard section" />
    ),
  },
);
