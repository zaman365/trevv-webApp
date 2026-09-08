"use client";

import { AppLink as Link } from "@/components/navigation-link";
import { workspaceHref, type WorkspaceView } from "@/lib/workspace-routes";
import { WorkspaceFrame } from "./workspace-frame";
import { teamPlaybooks } from "@/lib/team-playbooks";
import styles from "./live-operating-loop.module.css";

export const trevvGuideSteps: {
  title: string;
  view?: WorkspaceView;
  action: string;
  steps: string[];
}[] = [
  {
    title: "Organize your startups and projects",
    action: "Open Portfolio",
    steps: [
      "Use a workspace for each startup, business or client. Portfolio brings those workspaces together within your organization.",
      "Create a workspace from Portfolio. Give it a recognizable name, purpose and lead. Keep each project inside it as a project plan; use separate workspaces when access should differ.",
      "Open Projects & sprints to create a project with a clear goal and target date. Existing boards remain available as project plans.",
    ],
  },
  {
    title: "Create teams and add people",
    view: "teams",
    action: "Open Teams",
    steps: [
      "Choose Create Team, name it, and pick Marketing, Technology, Sales, Operations, Leadership or Custom. Select existing people and a lead, then create the team.",
      "Open Manage. People is the first tab. Use Add an existing person for someone who already has workspace access, or enter their email under Invite someone to this team.",
      "An organization owner or admin sends the invitation. The recipient follows the email, signs in or creates their account, and accepts. Acceptance adds them to the selected workspace, team and its conversation.",
      "Refresh people after acceptance. Pending invitations are not assignable people. Check invitation delivery status and resend failed email from View invitations.",
    ],
  },
  {
    title: "Give a project its team and context",
    view: "planning",
    action: "Open Projects & sprints",
    steps: [
      "Choose New project / plan, select its team, and optionally start from a department template.",
      "For Marketing, record the campaign audience, channels and success metric. For IT, record the product or sprint goal, acceptance criteria, risks and definition of done.",
      "Save the plan and open it. Its tasks, delivery cycles and milestones belong together; the team’s Projects and work tab links back to those plans.",
    ],
  },
  {
    title: "Create and assign a task",
    view: "planning",
    action: "Open a project",
    steps: [
      "Open the project and choose New task / work item. Enter an actionable title, expected outcome, priority and due date. Task creation goes directly to the project; Inbox is optional.",
      "Choose an assignee. Filter people by team if useful. If someone is missing, use Add people to assign work, send an invitation, and refresh after they accept.",
      "Use planning fields for the responsible team, work category, topic, sprint, milestone and relevant department details. Keep one accountable owner clear even when several people contribute.",
      "Save, then open the task to edit its owner, dates, status and context. The assignee finds it in All my work across their workspaces and My Work within this workspace.",
    ],
  },
  {
    title: "Plan sprints and project milestones",
    view: "planning",
    action: "Plan delivery",
    steps: [
      "Open a project and choose Plan a sprint / cycle. Set its goal, start date and target date, then save it as Planned. Use a campaign or operations cycle when that fits the team better.",
      "Assign project tasks to the cycle using each task’s planning fields. Start the cycle by editing its state to Active. Its board shows the selected work and completion progress.",
      "Create a work item of type Milestone for each important deliverable, with an owner and date. Link contributing tasks through their Milestone field.",
      "At the end, review completed and unfinished work. Mark the cycle Completed and move unfinished tasks to the next cycle through their planning fields. Tasks and their history remain in the parent project.",
    ],
  },
  {
    title: "Keep communication with its topic",
    view: "teams",
    action: "Open team topics",
    steps: [
      "Open Manage → Topics and discussions. Create a named topic such as September campaign, Checkout redesign or Customer onboarding, and add the context or question.",
      "Select a topic and reply in its discussion. These messages also appear in the team room, with the topic title. Team membership controls who can read and participate.",
      "Use Messages for team rooms, private rooms and direct conversations. Create a separate room when a topic needs a different set of participants.",
      "Post task-specific progress in the task’s Updates and evidence area. In Messages, use a request or decision with a response owner and due date when a reply must be followed up.",
    ],
  },
  {
    title: "Run a daily follow-up",
    view: "my-work",
    action: "Open My Work",
    steps: [
      "Start with Today and Overdue in My Work. Update Working, Review or Done as the work changes. Use the board view to see work by status.",
      "If blocked, record the reason on the task. If waiting on someone, create a Waiting follow-up with a person and follow-up date; reschedule or resolve it as the situation changes.",
      "A team lead checks Teams → member workload for open, overdue and blocked work. Reassign ownership or change the deadline explicitly when priorities change.",
      "Check Attention for work that needs movement and Messages for requests needing a response. Record the next concrete action on the task or discussion.",
    ],
  },
  {
    title: "Review progress every week",
    view: "reviews",
    action: "Open Weekly Review",
    steps: [
      "Review project milestones, cycle completion, overdue tasks and blockers with the team. Record decisions and approval outcomes in their dedicated views.",
      "Publish a Weekly Review with wins, current priority, blockers, the next milestone and help needed. Use that record to prepare the next cycle.",
      "Use Calendar for task deadlines and scheduled events, including recurring meetings. Recurring calendar events do not automatically create recurring tasks.",
      "Return to Portfolio to compare the startups and workspaces you can access. Repeat the daily and weekly routines within each business context.",
    ],
  },
];

export function TrevvGuide({ workspaceSlug }: { workspaceSlug?: string }) {
  return (
    <WorkspaceFrame
      active="guide"
      {...(workspaceSlug ? { workspaceSlug } : {})}
    >
      <main className={styles.main}>
        <header className={styles.hero}>
          <div>
            <p>Your operating guide</p>
            <h1>Run your work with TREVV</h1>
            <span>
              From the first teammate to a repeatable daily and weekly routine.
            </span>
          </div>
        </header>
        <nav aria-label="Guide steps" className={styles.guideNav}>
          <ol>
            {trevvGuideSteps.map((step, index) => (
              <li key={step.title}>
                <a href={`#guide-step-${index + 1}`}>{step.title}</a>
              </li>
            ))}
          </ol>
        </nav>
        <div className={styles.guideSteps}>
          {trevvGuideSteps.map((step, index) => (
            <article key={step.title} id={`guide-step-${index + 1}`}>
              <h2>
                {index + 1}. {step.title}
              </h2>
              <ol>
                {step.steps.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ol>
              <Link
                href={
                  step.view && workspaceSlug
                    ? workspaceHref(workspaceSlug, step.view)
                    : "/app/portfolio"
                }
              >
                {step.view && !workspaceSlug
                  ? "Choose a workspace in Portfolio"
                  : step.action}
              </Link>
            </article>
          ))}
        </div>
        <section className={styles.panel}>
          <h2>Different teams, different context</h2>
          <div className={styles.planGrid}>
            {Object.values(teamPlaybooks).map((playbook) => (
              <article className={styles.planCard} key={playbook.label}>
                <h3>{playbook.label}</h3>
                <p>{playbook.outcome}</p>
                <p>Useful topics: {playbook.topics.join(", ")}.</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </WorkspaceFrame>
  );
}
