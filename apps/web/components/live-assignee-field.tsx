"use client";

import { useQuery } from "@tanstack/react-query";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords } from "@/lib/live-app-data";
import styles from "./live-operating-loop.module.css";

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
  const people = directory.data?.availableMembers ?? [session.user];
  return (
    <label className={styles.field}>
      <span>Assignee</span>
      <select
        aria-label="Choose assignee"
        disabled={disabled}
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
      {directory.isPending ? <small>Loading team members…</small> : null}
      {directory.error ? (
        <small role="status">
          Team members could not be loaded. Your selection is retained.{" "}
          <button type="button" onClick={() => void directory.refetch()}>
            Retry team members
          </button>
        </small>
      ) : null}
    </label>
  );
}
