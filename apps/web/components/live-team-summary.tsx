"use client";

import { useMemo, type RefObject } from "react";
import type { TeamDto, TeamMemberDto } from "@founderhq/api-contract";
import { ChevronRight, X } from "lucide-react";
import { AppLink as Link } from "@/components/navigation-link";
import { useAccessibleDialog } from "@/lib/live-collaboration";
import { teamHref, workspaceHref } from "@/lib/workspace-routes";
import styles from "./live-collaboration.module.css";

export type TeamSummaryView = "teams" | "people" | "rooms";

const titles: Record<TeamSummaryView, string> = {
  teams: "Teams",
  people: "Assigned people",
  rooms: "Synchronized rooms",
};

const descriptions: Record<TeamSummaryView, string> = {
  teams: "Explore each team's purpose, members, and work.",
  people:
    "Everyone assigned to a team in this workspace, with their team roles.",
  rooms: "Each team has a shared room. Room access follows team membership.",
};

const emptyMessages: Record<TeamSummaryView, string> = {
  teams: "No teams yet. Create a team from the directory to get started.",
  people: "No assigned people yet. Open a team's details to add members.",
  rooms: "No team rooms yet. Creating a team also creates its shared room.",
};

export function TeamSummaryDialog({
  view,
  teams,
  workspaceSlug,
  returnFocusRef,
  onClose,
  onOpenTeam,
}: {
  view: TeamSummaryView;
  teams: readonly TeamDto[];
  workspaceSlug: string;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onOpenTeam: (teamId: string) => void;
}) {
  const dialogRef = useAccessibleDialog(onClose, returnFocusRef);
  const people = useMemo(() => {
    const byId = new Map<
      string,
      {
        user: TeamMemberDto["user"];
        assignments: Array<{ team: TeamDto; role: TeamMemberDto["role"] }>;
      }
    >();
    for (const team of teams) {
      for (const member of team.members) {
        const person = byId.get(member.user.id) ?? {
          user: member.user,
          assignments: [],
        };
        person.assignments.push({ team, role: member.role });
        byId.set(member.user.id, person);
      }
    }
    return [...byId.values()].sort((a, b) =>
      a.user.name.localeCompare(b.user.name),
    );
  }, [teams]);
  const empty = view === "people" ? people.length === 0 : teams.length === 0;

  return (
    <div
      className={styles.modalBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-summary-title"
        aria-describedby="team-summary-description"
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <div>
            <p>Team directory</p>
            <h2 id="team-summary-title">{titles[view]}</h2>
          </div>
          <button
            type="button"
            aria-label="Close team summary"
            onClick={onClose}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>
        <div className={`${styles.dialogBody} ${styles.summaryDetails}`}>
          <p id="team-summary-description">{descriptions[view]}</p>
          {empty ? (
            <p className={styles.emptyState}>{emptyMessages[view]}</p>
          ) : null}
          {view === "people" && !empty ? (
            <ul className={styles.summaryList}>
              {people.map(({ user, assignments }) => (
                <li key={user.id}>
                  <h3>{user.name}</h3>
                  <p>{user.email}</p>
                  <div className={styles.summaryAssignments}>
                    {assignments.map(({ team, role }) => (
                      <button
                        type="button"
                        key={team.id}
                        aria-label={`${team.name} · ${role === "lead" ? "Lead" : "Member"}: View team members for ${user.name}`}
                        onClick={() => onOpenTeam(team.id)}
                      >
                        {team.name} · {role === "lead" ? "Lead" : "Member"}
                        <ChevronRight size={14} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          {view !== "people" && !empty ? (
            <ul className={styles.summaryList}>
              {teams.map((team) => {
                const lead = team.members.find(
                  (member) => member.role === "lead",
                );
                return (
                  <li key={team.id}>
                    <h3>
                      {view === "rooms"
                        ? (team.room?.title ?? team.name)
                        : team.name}
                    </h3>
                    {view === "teams" ? (
                      <>
                        {team.purpose ? <p>{team.purpose}</p> : null}
                        <p>
                          {team.members.length}{" "}
                          {team.members.length === 1 ? "member" : "members"}
                          {" · "}Lead: {lead?.user.name ?? "Not assigned"}
                        </p>
                        <button
                          type="button"
                          onClick={() => onOpenTeam(team.id)}
                        >
                          View {team.name} details{" "}
                          <ChevronRight size={14} aria-hidden="true" />
                        </button>
                        <Link href={teamHref(workspaceSlug, team.id)}>
                          Open {team.name} page{" "}
                          <ChevronRight size={14} aria-hidden="true" />
                        </Link>
                      </>
                    ) : (
                      <>
                        <p>
                          {team.name} · {team.members.length}{" "}
                          {team.members.length === 1 ? "member" : "members"}
                        </p>
                        <p>
                          {team.room
                            ? team.room.unreadCount > 0
                              ? `${team.room.unreadCount} unread ${team.room.unreadCount === 1 ? "message" : "messages"}`
                              : "Up to date"
                            : "Private to team members. Join this team to read and reply."}
                        </p>
                        {team.room ? (
                          <Link
                            href={`${workspaceHref(workspaceSlug, "messages")}#${encodeURIComponent(team.room.conversationId)}`}
                          >
                            Open {team.room.title} room{" "}
                            <ChevronRight size={14} aria-hidden="true" />
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onOpenTeam(team.id)}
                          >
                            View {team.name} members{" "}
                            <ChevronRight size={14} aria-hidden="true" />
                          </button>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
