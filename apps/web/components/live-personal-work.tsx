"use client";
import { AppLink as Link } from "@/components/navigation-link";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords } from "@/lib/live-app-data";
import { WorkspaceFrame } from "./workspace-frame";
import { LiveMyWork } from "./live-work-my-work";
import { LiveCreateTask } from "./live-create-task";
import { LiveStateNotice } from "./live-state";
import styles from "./live-operating-loop.module.css";

export function LivePersonalWork() {
  const session = useAppSession();
  const data = useLiveAppRecords();
  return (
    <WorkspaceFrame active="myWork">
      <main className={styles.main} data-testid="live-personal-work">
        <header className={styles.hero}>
          <div>
            <p>{session.organization.name} · All workspaces</p>
            <h1>My Work</h1>
            <span>
              Know what needs you today. Follow every task through to
              completion.
            </span>
          </div>
          <LiveCreateTask workspaces={data.workspaces} />
        </header>
        {data.stale ? (
          <LiveStateNotice
            kind="stale"
            synced
            title="Reconnecting"
            description="Your last saved tasks remain visible."
            actions={
              <button type="button" onClick={() => void data.refresh()}>
                Refresh
              </button>
            }
          />
        ) : null}
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
      </main>
    </WorkspaceFrame>
  );
}
