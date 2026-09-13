"use client";
import { SharedPlanningHub } from "./shared-planning-hub";

import {
  Activity,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  ChartNoAxesCombined,
  ClipboardCheck,
  Clock3,
  FileQuestion,
  FolderKanban,
  Inbox,
  ListTodo,
  Lightbulb,
  MessageCircleMore,
  Sparkles,
  Users,
} from "lucide-react";
import { AppLink as Link } from "@/components/navigation-link";
import {
  dashboardSections,
  dashboardSectionFromSearch,
  dashboardSectionUrl,
  type DashboardSection,
} from "@/lib/dashboard-sections";
import { useLiveAppRecords } from "@/lib/live-app-data";
import { workspaceHref } from "@/lib/workspace-routes";
import { LiveStateNotice } from "./live-state";
import styles from "./workspace-dashboard.module.css";

const MyWork = lazy(() =>
  import("./live-work-my-work").then((m) => ({ default: m.LiveMyWork })),
);
const Projects = lazy(() =>
  import("./live-project-planning").then((m) => ({
    default: m.ProjectPlanningContent,
  })),
);
const Teams = lazy(() =>
  import("./live-team-workflow").then((m) => ({
    default: m.LiveTeamWorkflowContent,
  })),
);
const Messages = lazy(() =>
  import("./live-messaging-workspace").then((m) => ({
    default: m.LiveMessagingContent,
  })),
);
const CaptureInbox = lazy(() =>
  import("./live-work-inbox").then((m) => ({ default: m.LiveInboxFeature })),
);
const Attention = lazy(() =>
  import("./live-work-attention").then((m) => ({ default: m.LiveAttention })),
);
const Transitions = lazy(() =>
  import("./live-work-transitions").then((m) => ({
    default: m.LiveTransitions,
  })),
);
const Waiting = lazy(() =>
  import("./live-work-waiting").then((m) => ({ default: m.LiveWaiting })),
);
const icons = {
  summary: ChartNoAxesCombined,
  ideas: Lightbulb,
  "my-work": ListTodo,
  planning: FolderKanban,
  teams: Users,
  messages: MessageCircleMore,
  inbox: Inbox,
  attention: Sparkles,
  decisions: FileQuestion,
  approvals: ClipboardCheck,
  waiting: Clock3,
};

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
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  return (
    <div
      className={styles.sectionTabs}
      role="tablist"
      aria-label="Dashboard sections"
    >
      {dashboardSections.map(({ id, label }, index) => {
        const Icon = icons[id];
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={`dashboard-tab-${id}`}
            aria-controls={`dashboard-panel-${id}`}
            aria-selected={value === id}
            tabIndex={value === id ? 0 : -1}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            onClick={() => onChange(id)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % dashboardSections.length
                  : event.key === "ArrowLeft"
                    ? (index + dashboardSections.length - 1) %
                      dashboardSections.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? dashboardSections.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              tabs.current[next]?.focus();
              onChange(dashboardSections[next]!.id);
            }}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
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
  const meta = dashboardSections.find((entry) => entry.id === section)!;
  return (
    <Activity mode={active ? "visible" : "hidden"}>
      <section
        id={`dashboard-panel-${section}`}
        role="tabpanel"
        aria-labelledby={`dashboard-tab-${section}`}
        className={styles.sectionPanel}
      >
        <header className={styles.sectionHeading}>
          <div>
            <h2>{meta.title}</h2>
            <p>{meta.description}</p>
          </div>
          <Link
            href={workspaceHref(workspaceSlug, meta.view)}
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

export function DashboardSectionContent({
  section,
  workspaceId,
  workspaceSlug,
}: {
  section: Exclude<DashboardSection, "summary">;
  workspaceId: string;
  workspaceSlug: string;
}) {
  const data = useLiveAppRecords();
  const items = data.items.filter((item) => item.workspaceId === workspaceId);
  switch (section) {
    case "ideas":
      return (
        <SharedPlanningHub
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
        />
      );
    case "my-work":
      return (
        <>
          <SharedPlanningHub
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            personal
            compact
          />
          <MyWork items={items} workspaceSlug={workspaceSlug} />
        </>
      );
    case "planning":
      return (
        <Projects workspaceId={workspaceId} workspaceSlug={workspaceSlug} />
      );
    case "teams":
      return <Teams workspaceSlug={workspaceSlug} embedded />;
    case "messages":
      return <Messages workspaceSlug={workspaceSlug} embedded />;
    case "inbox":
      return (
        <CaptureInbox workspaceId={workspaceId} workspaceSlug={workspaceSlug} />
      );
    case "attention":
      return (
        <Attention
          signals={data.attention.filter(
            (signal) => signal.workspaceId === workspaceId,
          )}
        />
      );
    case "decisions":
      return (
        <Transitions
          items={items.filter((item) => item.type === "decision")}
          kind="decision"
          workspaceId={workspaceId}
        />
      );
    case "approvals":
      return (
        <Transitions
          items={items.filter((item) => item.type === "approval")}
          kind="approval"
          workspaceId={workspaceId}
        />
      );
    case "waiting":
      return (
        <Waiting
          records={data.waiting.filter(
            (record) => record.workspaceId === workspaceId,
          )}
        />
      );
  }
}
