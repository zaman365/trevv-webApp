"use client";

import { AppLink as Link } from "@/components/navigation-link";
import { useReportRouteReady } from "@/lib/navigation-performance";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords as useLiveAppData } from "@/lib/live-app-data";
import { workspaceHref, type WorkspaceView } from "@/lib/workspace-routes";
import { LiveStateNotice, LiveSyncedAt } from "./live-state";
import { WorkspaceFrame } from "./workspace-frame";
import styles from "./live-operating-loop.module.css";
import dynamic from "next/dynamic";
import { RouteLoadingState } from "./live-state";

const loading = () => <RouteLoadingState label="Loading workspace view" />;
const LiveMyWork = dynamic(
  () => import("./live-work-my-work").then((module) => module.LiveMyWork),
  { loading },
);
const LiveAttention = dynamic(
  () => import("./live-work-attention").then((module) => module.LiveAttention),
  { loading },
);
const LiveWaiting = dynamic(
  () => import("./live-work-waiting").then((module) => module.LiveWaiting),
  { loading },
);
const LiveTransitions = dynamic(
  () =>
    import("./live-work-transitions").then((module) => module.LiveTransitions),
  { loading },
);
const LiveWeeklyReview = dynamic(
  () => import("./live-work-reviews").then((module) => module.LiveWeeklyReview),
  { loading },
);
const LiveSearch = dynamic(
  () => import("./live-work-search").then((module) => module.LiveSearch),
  { loading },
);
const LiveInboxFeature = dynamic(
  () => import("./live-work-inbox").then((module) => module.LiveInboxFeature),
  { loading },
);
const LiveSettingsFeature = dynamic(
  () =>
    import("./live-work-settings").then((module) => module.LiveSettingsFeature),
  { loading },
);

export type LiveWorkViewKind = Extract<
  WorkspaceView,
  | "attention"
  | "my-work"
  | "inbox"
  | "decisions"
  | "approvals"
  | "reviews"
  | "waiting"
  | "search"
  | "messages"
  | "teams"
  | "ideas"
  | "blueprints"
  | "notifications"
  | "settings"
>;

const viewCopy: Record<
  LiveWorkViewKind,
  {
    title: string;
    subtitle: string;
    active: Parameters<typeof WorkspaceFrame>[0]["active"];
  }
> = {
  attention: {
    title: "Attention",
    subtitle: "Deterministic signals with source evidence and reason codes.",
    active: "attention",
  },
  "my-work": {
    title: "My Work",
    subtitle: "Canonical WorkItems assigned to your application identity.",
    active: "myWork",
  },
  inbox: {
    title: "Inbox",
    subtitle:
      "Email preview, actionable requests, and durable capture in one workspace Inbox.",
    active: "inbox",
  },
  decisions: {
    title: "Decisions",
    subtitle: "Record the decision, rationale, and evidence together.",
    active: "decisions",
  },
  approvals: {
    title: "Approvals",
    subtitle: "Durable review outcomes with accountable rationale.",
    active: "approvals",
  },
  reviews: {
    title: "Weekly Review",
    subtitle: "Publish durable progress and a comparable workspace snapshot.",
    active: "reviews",
  },
  waiting: {
    title: "Waiting",
    subtitle: "Follow-ups tied to the same canonical work identity.",
    active: "waiting",
  },
  search: {
    title: "Search",
    subtitle: "Tenant-scoped search across durable workspaces and WorkItems.",
    active: "search",
  },
  messages: {
    title: "Messages",
    subtitle: "Messaging is outside the Phase 3 founder operating loop.",
    active: "messages",
  },
  teams: {
    title: "Teams",
    subtitle: "Team management is outside the Phase 3 founder operating loop.",
    active: "teams",
  },
  ideas: {
    title: "Ideas",
    subtitle: "Use an Idea WorkItem until a dedicated live surface is ready.",
    active: "ideas",
  },
  blueprints: {
    title: "Blueprints",
    subtitle:
      "Blueprint execution is outside the Phase 3 founder operating loop.",
    active: "templates",
  },
  notifications: {
    title: "Notifications",
    subtitle: "External notification delivery is not enabled in this phase.",
    active: "notifications",
  },
  settings: {
    title: "Workspace Settings",
    subtitle:
      "Manage the canonical Workspace identity and operating configuration.",
    active: "settings",
  },
};

const supportedViews = new Set<LiveWorkViewKind>([
  "attention",
  "my-work",
  "inbox",
  "decisions",
  "approvals",
  "reviews",
  "waiting",
  "search",
]);

export function LiveWorkView({
  workspaceSlug,
  view,
}: {
  workspaceSlug: string;
  view: LiveWorkViewKind;
}) {
  const session = useAppSession();
  const liveData = useLiveAppData();
  const workspace = liveData.workspaces.find(
    (record) => record.slug === workspaceSlug,
  );
  const copy = viewCopy[view];
  const isInbox = view === "inbox";
  useReportRouteReady(
    liveData.recordsReady && !supportedViews.has(view) && view !== "settings",
  );

  if (!workspace) {
    return (
      <WorkspaceFrame active={copy.active}>
        <main className={styles.main}>
          <LiveStateNotice
            actions={<Link href="/app/portfolio">Return to Portfolio</Link>}
            description="The workspace may have been removed or your membership may have changed."
            kind="permission-loss"
            title="Workspace not available"
          />
        </main>
      </WorkspaceFrame>
    );
  }

  const items = liveData.items.filter(
    (item) => item.workspaceId === workspace.id,
  );
  return (
    <WorkspaceFrame active={copy.active} workspaceSlug={workspaceSlug}>
      <main
        className={`${styles.main} ${isInbox ? styles.inboxMain : ""}`}
        data-testid={`live-${view.replaceAll("-", "-")}`}
      >
        {isInbox ? (
          <h1 className="sr-only">{copy.title}</h1>
        ) : (
          <header className={styles.hero}>
            <div>
              <p>Workspace · {workspace.name}</p>
              <h1>{copy.title}</h1>
              <span>{copy.subtitle}</span>
            </div>
            <small>
              Last synced{" "}
              <LiveSyncedAt timezone={session.organization.timezone ?? "UTC"} />
            </small>
          </header>
        )}
        {liveData.stale ? (
          <LiveStateNotice
            actions={
              <button onClick={() => void liveData.refresh()} type="button">
                Refresh
              </button>
            }
            description="Last-known data remains visible with its sync timestamp."
            kind="stale"
            synced
            title="This view may be stale"
          />
        ) : null}
        {view === "settings" ? (
          <LiveSettingsFeature workspace={workspace} />
        ) : !supportedViews.has(view) ? (
          <UnavailableLiveSurface
            title={copy.title}
            workspaceSlug={workspaceSlug}
          />
        ) : view === "inbox" ? (
          <LiveInboxFeature
            workspaceId={workspace.id}
            workspaceSlug={workspaceSlug}
          />
        ) : view === "my-work" ? (
          <LiveMyWork items={items} workspaceSlug={workspaceSlug} />
        ) : view === "attention" ? (
          <LiveAttention
            signals={liveData.attention.filter(
              (signal) => signal.workspaceId === workspace.id,
            )}
          />
        ) : view === "waiting" ? (
          <LiveWaiting
            records={liveData.waiting.filter(
              (record) => record.workspaceId === workspace.id,
            )}
          />
        ) : view === "decisions" ? (
          <LiveTransitions
            items={items.filter((item) => item.type === "decision")}
            kind="decision"
            workspaceId={workspace.id}
          />
        ) : view === "approvals" ? (
          <LiveTransitions
            items={items.filter((item) => item.type === "approval")}
            kind="approval"
            workspaceId={workspace.id}
          />
        ) : view === "reviews" ? (
          <LiveWeeklyReview workspaceId={workspace.id} />
        ) : view === "search" ? (
          <LiveSearch
            workspaceId={workspace.id}
            workspaceSlug={workspaceSlug}
          />
        ) : null}
      </main>
    </WorkspaceFrame>
  );
}

function UnavailableLiveSurface({
  title,
  workspaceSlug,
}: {
  title: string;
  workspaceSlug: string;
}) {
  return (
    <LiveStateNotice
      actions={
        <Link href={workspaceHref(workspaceSlug, "my-work")}>Open My Work</Link>
      }
      description={`${title} is intentionally unavailable in live mode until its repository, authorization, and recovery behavior are complete. No local demo substitute is shown.`}
      kind="empty"
      title="Not available in this private-alpha foundation"
    />
  );
}
