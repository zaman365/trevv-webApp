"use client";

import { ArrowUpRight, Mail, MessageCircleMore, X } from "lucide-react";
import { AppLink as Link } from "@/components/navigation-link";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords } from "@/lib/live-app-data";
import { useLiveTeamDirectory } from "@/lib/live-collaboration";
import { useFloatingChat } from "@/lib/floating-chat-context";
import { isLiveAccessLoss, presentLiveError } from "@/lib/live-errors";
import { personHref } from "@/lib/people-routes";
import { personEmailHref } from "@/lib/people-workspace";
import { initials } from "@/lib/team-workspace";
import { teamHref } from "@/lib/workspace-routes";
import { LiveStateNotice } from "./live-state";
import styles from "./people-workspace.module.css";

export function PersonCard({
  userId,
  workspaceSlug,
  onClose,
}: {
  userId: string;
  workspaceSlug: string;
  onClose(): void;
}) {
  const data = useLiveAppRecords();
  const session = useAppSession();
  const chat = useFloatingChat();
  const workspace = data.workspaces.find(
    (entry) => entry.slug === workspaceSlug,
  );
  const directory = useLiveTeamDirectory(workspace?.id);
  const person =
    !isLiveAccessLoss(directory.error) && !data.accessLost
      ? directory.data?.availableMembers.find((entry) => entry.id === userId)
      : undefined;
  const teams = person
    ? (directory.data?.teams.filter((team) =>
        team.members.some((member) => member.user.id === person.id),
      ) ?? [])
    : [];
  return (
    <>
      <button
        className={styles.closeCard}
        type="button"
        aria-label="Close person card"
        onClick={onClose}
      >
        <X size={16} />
      </button>
      {directory.isLoading ? (
        <p role="status">Loading person…</p>
      ) : directory.error ? (
        <LiveStateNotice
          compact
          {...presentLiveError(directory.error)}
          actions={
            <button type="button" onClick={() => void directory.refetch()}>
              Retry
            </button>
          }
        />
      ) : null}
      {person ? (
        <>
          <header className={styles.cardHeader}>
            <span className={styles.avatar}>{initials(person.name)}</span>
            <div>
              <strong>{person.name}</strong>
              <small>
                {person.organizationRole.replaceAll("_", " ")}
                {person.id === session.user.id ? " · You" : ""}
              </small>
            </div>
          </header>
          <a className={styles.contact} href={personEmailHref(person.email)}>
            <Mail size={14} />
            {person.email}
          </a>
          <div className={styles.pills}>
            {teams.length ? (
              teams.slice(0, 4).map((team) => (
                <Link
                  key={team.id}
                  href={teamHref(workspaceSlug, team.id)}
                  onClick={onClose}
                >
                  {team.name}
                  {team.members.find((member) => member.user.id === person.id)
                    ?.role === "lead"
                    ? " · Lead"
                    : ""}
                </Link>
              ))
            ) : (
              <span>No team assigned</span>
            )}
          </div>
          <div className={styles.actions}>
            {chat && person.id !== session.user.id ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  chat.openChat({ workspaceSlug, personId: person.id });
                }}
              >
                <MessageCircleMore size={16} />
                Start chat
              </button>
            ) : null}
            <a href={personEmailHref(person.email)}>
              <Mail size={16} />
              Write email
            </a>
            <Link href={personHref(workspaceSlug, person.id)} onClick={onClose}>
              Full profile
              <ArrowUpRight size={16} />
            </Link>
          </div>
        </>
      ) : !directory.isLoading && !directory.error ? (
        <p>This person is not available in this workspace directory.</p>
      ) : null}
    </>
  );
}
