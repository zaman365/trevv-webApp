"use client";
import { PortfolioPageSections } from "./portfolio-page-sections";
import { SharedPlanningHub } from "./shared-planning-hub";

import { LiveRefreshStatus } from "./live-refresh-status";
import { AppLink as Link } from "@/components/navigation-link";
import { useLiveAppRecords } from "@/lib/live-app-data";
import { WorkspaceFrame } from "./workspace-frame";
import { LiveMyWork } from "./live-work-my-work";
import { LiveCreateTask } from "./live-create-task";
import { LiveStateNotice } from "./live-state";
import styles from "./live-operating-loop.module.css";

export function LivePersonalWork() {
  const data = useLiveAppRecords();
  return (
    <WorkspaceFrame active="myWork">
      <main className={styles.main} data-testid="live-personal-work">
        <header className={`${styles.hero} compact-page-header`}>
          <div>
            <h1>My Work</h1>
          </div>
          <LiveCreateTask workspaces={data.workspaces} />
        </header>
        <PortfolioPageSections portfolioId="" personal>
          <LiveRefreshStatus />
          {!data.workspaces.length ? (
            <LiveStateNotice
              kind="empty"
              title="Start with a workspace"
              description="Keep each startup, client, or business in its own workspace, then organize its projects on boards."
              actions={<Link href="/app/portfolio">Open Portfolio</Link>}
            />
          ) : (
            <LiveMyWork items={data.items} />
          )}
          {data.workspaces.map((workspace) => (
            <SharedPlanningHub
              key={workspace.id}
              workspaceId={workspace.id}
              workspaceSlug={workspace.slug}
              personal
              compact
            />
          ))}
        </PortfolioPageSections>
      </main>
    </WorkspaceFrame>
  );
}
