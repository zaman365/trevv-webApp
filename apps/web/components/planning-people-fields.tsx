"use client";

import { Users } from "lucide-react";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveTeamDirectory } from "@/lib/live-collaboration";
import { isLiveAccessLoss, presentLiveError } from "@/lib/live-errors";
import type { PeopleChoice } from "@/lib/planning-sharing";
import { LiveStateNotice } from "./live-state";
import styles from "./planning-people-fields.module.css";

export function PlanningPeopleFields({
  workspaceId,
  teamId,
  onTeamChange,
  value,
  onChange,
  disabled = false,
  showTeam = true,
}: {
  workspaceId: string;
  teamId: string;
  onTeamChange: (id: string) => void;
  value: PeopleChoice;
  onChange: (choice: PeopleChoice) => void;
  disabled?: boolean;
  showTeam?: boolean;
}) {
  const session = useAppSession();
  const directory = useLiveTeamDirectory(workspaceId);
  const team = directory.data?.teams.find((entry) => entry.id === teamId);
  const people = isLiveAccessLoss(directory.error)
    ? []
    : (teamId
        ? (team?.members.map((entry) => entry.user) ?? [])
        : (directory.data?.availableMembers ?? [])
      ).filter(
        (person) =>
          person.id !== session.user.id && person.organizationRole !== "guest",
      );
  return (
    <fieldset className={styles.peopleFields} disabled={disabled}>
      <legend>
        <Users size={18} aria-hidden="true" /> Team and collaborators
      </legend>
      {showTeam ? (
        <label>
          Related team · Optional
          <select
            value={teamId}
            onChange={(event) => {
              onTeamChange(event.target.value);
            }}
          >
            <option value="">No team / workspace people</option>
            {directory.data?.teams.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(event) =>
            onChange({ ...value, enabled: event.target.checked })
          }
        />{" "}
        Include people in a shared discussion
      </label>
      <p>
        Optional. Selected people receive an unread announcement in Messages and
        can follow the linked plan or idea. This does not change the item’s
        existing workspace access.
      </p>
      {value.enabled ? (
        <>
          {directory.error ? (
            <LiveStateNotice
              {...presentLiveError(directory.error)}
              actions={
                <button type="button" onClick={() => void directory.refetch()}>
                  Refresh people
                </button>
              }
            />
          ) : null}
          {directory.isPending ? (
            <p>Loading people…</p>
          ) : (
            <>
              <div className={styles.actions}>
                <button
                  type="button"
                  disabled={!people.length}
                  onClick={() =>
                    onChange({
                      ...value,
                      participantIds: people
                        .slice(0, 249)
                        .map((person) => person.id),
                    })
                  }
                >
                  {people.length > 249
                    ? "Select first 249 people"
                    : team
                      ? "Select everyone on this team"
                      : "Select all available people"}
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...value, participantIds: [] })}
                >
                  Clear selection
                </button>
                <span>
                  {value.participantIds.length} selected · you are included
                </span>
              </div>
              <div className={styles.peopleList}>
                {people.map((person) => (
                  <label key={person.id} className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={value.participantIds.includes(person.id)}
                      disabled={
                        !value.participantIds.includes(person.id) &&
                        value.participantIds.length >= 249
                      }
                      onChange={(event) =>
                        onChange({
                          ...value,
                          participantIds: event.target.checked
                            ? [...value.participantIds, person.id]
                            : value.participantIds.filter(
                                (id) => id !== person.id,
                              ),
                        })
                      }
                    />
                    <span>
                      <strong>{person.name}</strong>
                      <small>
                        {person.email}
                        {person.organizationRole === "viewer"
                          ? " · read only"
                          : ""}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
              {!people.length ? (
                <p>
                  No other people are available
                  {team ? " on this team" : " in this workspace"}. You can add
                  people from Teams and share this later.
                </p>
              ) : null}
              {!value.participantIds.length ? (
                <p>Select at least one person, or leave sharing off for now.</p>
              ) : null}
            </>
          )}
          <label>
            Invitation note · Optional
            <textarea
              maxLength={2000}
              value={value.note}
              onChange={(event) =>
                onChange({ ...value, note: event.target.value })
              }
              placeholder="What would you like their input on?"
            />
          </label>
          <small>
            Only the selected people are added. Later team membership changes do
            not automatically add people to this discussion.
          </small>
        </>
      ) : null}
    </fieldset>
  );
}
