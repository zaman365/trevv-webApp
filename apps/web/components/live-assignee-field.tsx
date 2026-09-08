"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { TrevvApiError } from "@founderhq/api-client";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords } from "@/lib/live-app-data";
import styles from "./live-operating-loop.module.css";
import { LiveInvitePerson } from "./live-invite-person";

export function LiveAssigneeField({
  workspaceId,
  value,
  onChange,
  disabled = false,
  allowUnassigned = true,
}: {
  workspaceId: string;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  allowUnassigned?: boolean;
}) {
  const session = useAppSession();
  const { client } = useLiveAppRecords();
  const [teamId, setTeamId] = useState("");
  const directory = useQuery({
    queryKey: [
      "workspace-resources",
      session.organization.id,
      workspaceId,
      "assignees",
    ],
    queryFn: ({ signal }) =>
      client.withSignal(signal).teamDirectory(workspaceId),
    staleTime: 30_000,
  });
  const accessLost =
    directory.error instanceof TrevvApiError &&
    [401, 403, 404].includes(directory.error.status);
  const data = accessLost ? undefined : directory.data;
  const team = data?.teams.find((entry) => entry.id === teamId);
  const people = (data?.availableMembers ?? []).filter(
    (person) =>
      !team ||
      person.id === value ||
      team.members.some((member) => member.user.id === person.id),
  );
  return (
    <div className={styles.field}>
      {data?.teams.length ? (
        <label>
          Filter people by team
          <select
            value={teamId}
            disabled={disabled || accessLost}
            onChange={(event) => setTeamId(event.target.value)}
          >
            <option value="">Everyone with workspace access</option>
            {data.teams.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        <span>Assignee</span>
        <select
          aria-label="Choose assignee"
          disabled={disabled || accessLost || directory.isPending}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        >
          {allowUnassigned ? <option value="">Unassigned</option> : null}
          {value && !people.some((person) => person.id === value) ? (
            <option value={value}>Selected person</option>
          ) : null}
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
              {person.id === session.user.id ? " (you)" : ""}
            </option>
          ))}
        </select>
      </label>
      {directory.isPending ? <small>Loading team members…</small> : null}
      {directory.error ? (
        <small role="status">
          Team members could not be loaded. Your selection is retained.{" "}
          <button type="button" onClick={() => void directory.refetch()}>
            Retry team members
          </button>
        </small>
      ) : null}
      {!directory.isPending && !accessLost ? (
        <details>
          <summary>
            {people.length <= 1
              ? "Add people to assign work"
              : "Missing someone? Add a teammate"}
          </summary>
          <LiveInvitePerson
            workspaceId={workspaceId}
            {...(team ? { teamId: team.id, teamName: team.name } : {})}
            onRefresh={() => void directory.refetch()}
          />
        </details>
      ) : null}
    </div>
  );
}
