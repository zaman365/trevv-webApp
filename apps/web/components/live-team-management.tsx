"use client";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  teamFeatureCapabilitiesForPreset,
  type TeamDto,
  type TeamMemberDto,
  type TeamPreset,
  type TeamFeatureCapability,
  type UpdateTeamInput,
} from "@founderhq/api-contract";
import { MessageCircleMore, Plus, UserMinus } from "lucide-react";
import {
  featureLabels,
  presetLabels,
  featureOptions,
  presetOptions,
  initials,
} from "@/lib/team-workspace";
import { presentLiveError } from "@/lib/live-errors";
import { LiveStateNotice } from "./live-state";
import { LiveInvitePerson } from "./live-invite-person";
import { ProjectPlanningContent } from "./live-project-planning";
import { LiveTeamTopics } from "./live-team-topics";
import styles from "./live-collaboration.module.css";

export interface TeamManagementProps {
  workspaceSlug: string;
  availableMembers: Array<{ id: string; name: string; email: string }>;
  canManage: boolean;
  error: unknown;
  pending: boolean;
  team: TeamDto;
  onRemoveMember: (userId: string) => Promise<boolean>;
  onRefresh: () => void;
  onSetMember: (userId: string, role: "lead" | "member") => Promise<boolean>;
  onUpdate: (
    input: UpdateTeamInput,
    expectedVersion: number,
  ) => Promise<boolean>;
  section?: "people" | "settings";
  memberExtras?: (member: TeamMemberDto) => ReactNode;
}

export function TeamManagementContent({
  workspaceSlug,
  availableMembers,
  canManage,
  error,
  pending,
  team,
  onRemoveMember,
  onRefresh,
  onSetMember,
  onUpdate,
  section,
  memberExtras,
}: TeamManagementProps) {
  const [baseline, setBaseline] = useState(team);
  const [name, setName] = useState(team.name);
  const [purpose, setPurpose] = useState(team.purpose);
  const [preset, setPreset] = useState(team.preset);
  const [features, setFeatures] = useState(team.featureCapabilities);
  const [featuresCustomized, setFeaturesCustomized] = useState(false);
  const [newMemberId, setNewMemberId] = useState("");
  const [localTab, setTab] = useState<
    "people" | "work" | "topics" | "settings"
  >("people");
  const tab = section ?? localTab;
  const [memberSearch, setMemberSearch] = useState("");
  const existingIds = useMemo(
    () => new Set(team.members.map((member) => member.user.id)),
    [team.members],
  );
  const addableMembers = availableMembers.filter(
    (member) => !existingIds.has(member.id),
  );
  const presetChanged = preset !== baseline.preset;
  const featureOverrideChanged =
    featuresCustomized &&
    (presetChanged ||
      !sameFeatures(features, baseline.featureCapabilities) ||
      baseline.featurePolicySource !== "override");
  const profileChanged =
    name.trim() !== baseline.name ||
    purpose.trim() !== baseline.purpose ||
    presetChanged ||
    featureOverrideChanged;

  if (team.version !== baseline.version && !profileChanged) {
    setBaseline(team);
    setName(team.name);
    setPurpose(team.purpose);
    setPreset(team.preset);
    setFeatures(team.featureCapabilities);
    setFeaturesCustomized(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || pending || !name.trim() || !profileChanged) return;
    const input: UpdateTeamInput = {
      ...(name.trim() !== baseline.name ? { name } : {}),
      ...(purpose.trim() !== baseline.purpose ? { purpose } : {}),
      ...(presetChanged ? { preset } : {}),
      ...(featureOverrideChanged ? { featureCapabilities: features } : {}),
    };
    if (await onUpdate(input, baseline.version)) {
      setFeaturesCustomized(false);
      setBaseline({
        ...team,
        name: name.trim(),
        purpose: purpose.trim(),
        preset,
        featureCapabilities: features,
      });
    }
  }

  const presented = error ? presentLiveError(error) : null;

  return (
    <div
      className={section ? styles.inlineTeamManagement : styles.drawerScroll}
    >
      {presented ? (
        <LiveStateNotice
          {...presented}
          actions={
            <button onClick={onRefresh} type="button">
              Load latest
            </button>
          }
          compact
        />
      ) : null}
      {!section ? (
        <nav className={styles.teamTabs} aria-label="Team sections">
          <button
            type="button"
            aria-pressed={tab === "people"}
            onClick={() => setTab("people")}
          >
            People ({team.members.length})
          </button>
          <button
            type="button"
            aria-pressed={tab === "work"}
            onClick={() => setTab("work")}
          >
            Projects and work
          </button>
          <button
            type="button"
            aria-pressed={tab === "topics"}
            onClick={() => setTab("topics")}
          >
            Topics and discussions
          </button>
          <button
            type="button"
            aria-pressed={tab === "settings"}
            onClick={() => setTab("settings")}
          >
            Settings
          </button>
        </nav>
      ) : null}
      {!section ? (
        <section className={styles.roomCallout}>
          <MessageCircleMore size={18} aria-hidden="true" />
          <div>
            <strong>{team.room?.title ?? "Private Team room"}</strong>
            <span>
              {team.room
                ? "Team members can read and reply in this shared room."
                : "Join this team to take part in its conversations."}
            </span>
          </div>
        </section>
      ) : null}

      {tab === "people" ? (
        <>
          <section className={styles.drawerSection}>
            <header>
              <div>
                <h3>Members</h3>
                <p>
                  Add people to work and talk together. A lead can manage this
                  team.
                </p>
              </div>
              <span>{team.members.length}</span>
            </header>
            {section === "people" ? (
              <label>
                Find a team member
                <input
                  type="search"
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                  placeholder="Search names or email addresses"
                />
              </label>
            ) : null}
            <div className={styles.memberList}>
              {team.members
                .filter((member) =>
                  `${member.user.name} ${member.user.email}`
                    .toLocaleLowerCase()
                    .includes(memberSearch.toLocaleLowerCase()),
                )
                .map((member) => (
                  <article key={member.user.id}>
                    <span className={styles.avatar} aria-hidden="true">
                      {initials(member.user.name)}
                    </span>
                    <div>
                      <strong>{member.user.name}</strong>
                      <small>
                        {member.user.organizationRole.replaceAll("_", " ")} ·{" "}
                        {member.user.email}
                      </small>
                    </div>
                    {canManage ? (
                      <select
                        aria-label={`${member.user.name} Team role`}
                        disabled={pending}
                        onChange={(event) =>
                          void onSetMember(
                            member.user.id,
                            event.target.value as "lead" | "member",
                          )
                        }
                        value={member.role}
                      >
                        <option value="member">Member</option>
                        <option value="lead">Lead</option>
                      </select>
                    ) : (
                      <span>{member.role}</span>
                    )}
                    {canManage ? (
                      <button
                        aria-label={`Remove ${member.user.name} from ${team.name}`}
                        disabled={pending}
                        onClick={() => void onRemoveMember(member.user.id)}
                        type="button"
                      >
                        <UserMinus size={15} />
                      </button>
                    ) : null}
                    {memberExtras ? (
                      <div className={styles.memberExtras}>
                        {memberExtras(member)}
                      </div>
                    ) : null}
                  </article>
                ))}
              {team.members.length === 0 ? (
                <p className={styles.inlineEmpty}>No people assigned yet.</p>
              ) : null}
            </div>
            {canManage ? (
              <div className={styles.addMemberRow}>
                <label>
                  Add an existing person
                  <select
                    onChange={(event) => setNewMemberId(event.target.value)}
                    value={newMemberId}
                    disabled={addableMembers.length === 0 || pending}
                  >
                    <option value="">Choose person</option>
                    {addableMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} · {member.email}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={!newMemberId || pending}
                  onClick={async () => {
                    if (await onSetMember(newMemberId, "member")) {
                      setNewMemberId("");
                    }
                  }}
                  type="button"
                >
                  <Plus size={15} /> Add member
                </button>
              </div>
            ) : null}
            {canManage && addableMembers.length === 0 ? (
              <p>
                Everyone with workspace access is already on this team. Invite
                another person below.
              </p>
            ) : null}
            <LiveInvitePerson
              workspaceId={team.workspaceId}
              teamId={team.id}
              teamName={team.name}
              onRefresh={onRefresh}
            />
          </section>
        </>
      ) : null}
      {tab === "settings" ? (
        <>
          <form className={styles.drawerSection} onSubmit={save}>
            <header>
              <div>
                <h3>Team profile</h3>
                <p>Purpose and feature preset</p>
              </div>
            </header>
            {profileChanged && baseline.version !== team.version ? (
              <LiveStateNotice
                kind="version-conflict"
                title="This team changed while you were editing"
                description="Your changes are kept. Review the updated team before applying your draft."
                actions={
                  <button type="button" onClick={() => setBaseline(team)}>
                    Apply my draft to the latest team
                  </button>
                }
              />
            ) : null}
            <label>
              Name
              <input
                disabled={!canManage}
                maxLength={160}
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </label>
            <label>
              Purpose
              <textarea
                disabled={!canManage}
                maxLength={1_000}
                onChange={(event) => setPurpose(event.target.value)}
                rows={3}
                value={purpose}
              />
            </label>
            <label>
              Preset
              <select
                disabled={!canManage}
                onChange={(event) => {
                  const nextPreset = event.target.value as TeamPreset;
                  setPreset(nextPreset);
                  if (nextPreset === "custom") {
                    setFeaturesCustomized(true);
                  } else {
                    setFeatures(teamFeatureCapabilitiesForPreset(nextPreset));
                    setFeaturesCustomized(false);
                  }
                }}
                value={preset}
              >
                {presetOptions.map((option) => (
                  <option key={option} value={option}>
                    {presetLabels[option]}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className={styles.choiceList} disabled={!canManage}>
              <legend>Available to {team.members.length} Team members</legend>
              <p>
                Choose which tools your team uses. Access to private work stays
                controlled by each person’s role and membership.
              </p>
              {featureOptions.map((feature) => (
                <label key={feature}>
                  <input
                    checked={features.includes(feature)}
                    onChange={(event) => {
                      setFeaturesCustomized(true);
                      setFeatures((current) =>
                        event.target.checked
                          ? [...current, feature]
                          : current.filter((value) => value !== feature),
                      );
                    }}
                    type="checkbox"
                  />
                  <span>{featureLabels[feature]}</span>
                </label>
              ))}
            </fieldset>
            {canManage ? (
              <button
                className="primary-button"
                disabled={
                  pending ||
                  !name.trim() ||
                  !profileChanged ||
                  baseline.version !== team.version
                }
                type="submit"
              >
                {pending ? "Saving…" : "Save Team profile"}
              </button>
            ) : null}
          </form>
        </>
      ) : null}
      {tab === "work" ? (
        <ProjectPlanningContent
          workspaceId={team.workspaceId}
          workspaceSlug={workspaceSlug}
          teamId={team.id}
        />
      ) : null}
      {!section ? (
        <div hidden={tab !== "topics"}>
          <LiveTeamTopics
            team={team}
            workspaceSlug={workspaceSlug}
            active={tab === "topics"}
          />
        </div>
      ) : null}
    </div>
  );
}

function sameFeatures(
  left: readonly TeamFeatureCapability[],
  right: readonly TeamFeatureCapability[],
) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((feature) => rightSet.has(feature));
}
