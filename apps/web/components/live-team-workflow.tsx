"use client";

import {
  teamFeatureCapabilitiesForPreset,
  type CreateTeamInput,
  type TeamDto,
  type TeamFeatureCapability,
  type TeamPreset,
  type UpdateTeamInput,
} from "@founderhq/api-contract";
import { TrevvApiError } from "@founderhq/api-client";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  MessageCircleMore,
  Plus,
  Settings2,
  ShieldCheck,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useAppSession } from "@/lib/app-session-context";
import {
  collaborationKeys,
  useAccessibleDialog,
  useLiveTeamDirectory,
} from "@/lib/live-collaboration";
import { useLiveAppData } from "@/lib/live-app-data";
import { presentLiveError } from "@/lib/live-errors";
import { workspaceHref } from "@/lib/workspace-routes";
import { LiveStateNotice } from "./live-state";
import { WorkspaceFrame } from "./workspace-frame";
import styles from "./live-collaboration.module.css";

const featureLabels: Record<TeamFeatureCapability, string> = {
  work: "Work coordination",
  messages: "Team messages",
  decisions: "Decisions",
  approvals: "Approvals",
  resources: "Resources",
  reporting: "Reporting",
};

const presetLabels: Record<TeamPreset, string> = {
  leadership: "Leadership",
  marketing: "Marketing",
  technology: "Technology",
  operations: "Operations",
  sales: "Sales",
  custom: "Custom",
};

const featureOptions = Object.keys(featureLabels) as TeamFeatureCapability[];
const presetOptions = Object.keys(presetLabels) as TeamPreset[];

export function LiveTeamWorkflow({ workspaceSlug }: { workspaceSlug: string }) {
  const session = useAppSession();
  const liveData = useLiveAppData();
  const queryClient = useQueryClient();
  const workspace = liveData.workspaces.find(
    (record) => record.slug === workspaceSlug,
  );
  const directory = useLiveTeamDirectory(workspace?.id);
  const directoryAccessLost =
    directory.error instanceof TrevvApiError &&
    [401, 403, 404].includes(directory.error.status);
  const visibleDirectory = directoryAccessLost ? undefined : directory.data;
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [savedMessage, setSavedMessage] = useState("");
  const canCreate = workspace
    ? canManageTeams(session.managedWorkspaceIds, workspace.id)
    : false;
  const selectedTeam = visibleDirectory?.teams.find(
    (team) => team.id === selectedTeamId,
  );

  async function refreshCollaboration() {
    if (!workspace) return;
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.teams(workspace.id),
      }),
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.conversations(workspace.id),
      }),
    ]);
  }

  async function runTeamMutation(
    operation: () => Promise<{ data: TeamDto }>,
    confirmation: string,
  ) {
    setPending(true);
    setError(null);
    setSavedMessage("");
    try {
      const result = await operation();
      queryClient.setQueryData(
        collaborationKeys.teams(result.data.workspaceId),
        (current: typeof directory.data) =>
          current
            ? {
                ...current,
                teams: current.teams.some((team) => team.id === result.data.id)
                  ? current.teams.map((team) =>
                      team.id === result.data.id ? result.data : team,
                    )
                  : [...current.teams, result.data],
              }
            : current,
      );
      setSavedMessage(confirmation);
      await refreshCollaboration();
      return result.data;
    } catch (reason) {
      setError(reason);
      return null;
    } finally {
      setPending(false);
    }
  }

  async function createTeam(input: CreateTeamInput) {
    const created = await runTeamMutation(
      () => liveData.client.createTeam(input, crypto.randomUUID()),
      `Team “${input.name}” and its room were saved.`,
    );
    if (!created) return false;
    setCreateOpen(false);
    setSelectedTeamId(created.id);
    return true;
  }

  if (!workspace) {
    return (
      <WorkspaceFrame active="teams" workspaceSlug={workspaceSlug}>
        <main className={styles.routeMain}>
          <LiveStateNotice
            kind="permission-loss"
            title="Workspace not available"
            description="This workspace is outside your current access or no longer exists."
          />
        </main>
      </WorkspaceFrame>
    );
  }

  const presentedError = error
    ? presentLiveError(error)
    : directory.error
      ? presentLiveError(directory.error)
      : null;

  return (
    <WorkspaceFrame active="teams" workspaceSlug={workspaceSlug}>
      <main className={styles.routeMain} data-testid="live-teams">
        <header className={styles.pageHeader}>
          <div>
            <p>{workspace.name} / Collaboration</p>
            <h1>Teams</h1>
            <span>
              Durable membership, clear feature presets, and one synchronized
              Team room per Team.
            </span>
          </div>
          {canCreate ? (
            <button
              className="primary-button"
              disabled={directoryAccessLost || directory.isLoading}
              onClick={() => {
                setError(null);
                setSavedMessage("");
                setCreateOpen(true);
              }}
              type="button"
            >
              <Plus size={16} /> Create Team
            </button>
          ) : null}
        </header>

        {directory.isLoading ? (
          <LiveStateNotice kind="loading" title="Loading Teams" />
        ) : null}
        {directory.isFetching && !directory.isLoading ? (
          <LiveStateNotice
            compact
            kind="retrying"
            title="Checking for Team changes"
          />
        ) : null}
        {presentedError ? (
          <LiveStateNotice
            {...presentedError}
            {...(directory.dataUpdatedAt > 0
              ? { lastSyncedAt: new Date(directory.dataUpdatedAt) }
              : {})}
            actions={
              <button onClick={() => void directory.refetch()} type="button">
                Retry
              </button>
            }
          />
        ) : null}
        {savedMessage ? (
          <LiveStateNotice kind="saved" title={savedMessage} />
        ) : null}

        <section className={styles.summaryGrid} aria-label="Team summary">
          <article>
            <Users size={18} aria-hidden="true" />
            <strong>{visibleDirectory?.teams.length ?? 0}</strong>
            <span>Teams</span>
          </article>
          <article>
            <ShieldCheck size={18} aria-hidden="true" />
            <strong>{uniqueMemberCount(visibleDirectory?.teams ?? [])}</strong>
            <span>Assigned people</span>
          </article>
          <article>
            <MessageCircleMore size={18} aria-hidden="true" />
            <strong>{visibleDirectory?.teams.length ?? 0}</strong>
            <span>Synchronized rooms</span>
          </article>
        </section>

        <section className={styles.surface} aria-labelledby="team-list-title">
          <header className={styles.surfaceHeader}>
            <div>
              <p>Workspace structure</p>
              <h2 id="team-list-title">Teams and inherited features</h2>
            </div>
            <Link href={workspaceHref(workspaceSlug, "messages")}>
              Open Messages <ChevronRight size={15} />
            </Link>
          </header>

          {!directory.isLoading && visibleDirectory?.teams.length === 0 ? (
            <div className={styles.emptyState}>
              <Users size={25} aria-hidden="true" />
              <h3>No Teams yet</h3>
              <p>
                Create the first Team to assign people and establish its Team
                room. Feature presets shape the interface; server permissions
                still control data access.
              </p>
              {canCreate ? (
                <button
                  onClick={() => {
                    setError(null);
                    setSavedMessage("");
                    setCreateOpen(true);
                  }}
                  type="button"
                >
                  <Plus size={15} /> Create Team
                </button>
              ) : null}
            </div>
          ) : (
            <div className={styles.teamGrid}>
              {(visibleDirectory?.teams ?? []).map((team) => {
                const lead = team.members.find(
                  (member) => member.role === "lead",
                );
                const canManage = canManageTeam(
                  team,
                  session.user.id,
                  session.managedWorkspaceIds,
                );
                return (
                  <article
                    className={styles.teamCard}
                    data-testid={`team-card-${team.id}`}
                    key={team.id}
                  >
                    <div className={styles.teamMark} aria-hidden="true">
                      {team.name.slice(0, 1).toLocaleUpperCase()}
                    </div>
                    <div className={styles.teamCardBody}>
                      <div className={styles.teamTitleRow}>
                        <div>
                          <span>{presetLabels[team.preset]} preset</span>
                          <h3>{team.name}</h3>
                        </div>
                        <span className={styles.memberCount}>
                          <Users size={13} /> {team.members.length}
                        </span>
                      </div>
                      <p>{team.purpose || "No Team purpose added yet."}</p>
                      <dl className={styles.teamFacts}>
                        <div>
                          <dt>Lead</dt>
                          <dd>{lead?.user.name ?? "Not assigned"}</dd>
                        </div>
                        <div>
                          <dt>Room</dt>
                          <dd>
                            {team.room
                              ? team.room.unreadCount > 0
                                ? `${team.room.unreadCount} unread`
                                : "Up to date"
                              : "Private to members"}
                          </dd>
                        </div>
                      </dl>
                      <div
                        className={styles.featureChips}
                        aria-label={`${team.name} interface options`}
                      >
                        {team.featureCapabilities.slice(0, 3).map((feature) => (
                          <span key={feature}>{featureLabels[feature]}</span>
                        ))}
                        {team.featureCapabilities.length > 3 ? (
                          <span>+{team.featureCapabilities.length - 3}</span>
                        ) : null}
                        {team.featureCapabilities.length === 0 ? (
                          <span>No feature preset</span>
                        ) : null}
                      </div>
                    </div>
                    <footer className={styles.teamCardFooter}>
                      <small>{teamFeatureAvailability(team)}</small>
                      {canManage ? (
                        <button
                          aria-label={`Manage ${team.name}`}
                          onClick={() => setSelectedTeamId(team.id)}
                          type="button"
                        >
                          <Settings2 size={14} /> Manage
                        </button>
                      ) : (
                        <button
                          onClick={() => setSelectedTeamId(team.id)}
                          type="button"
                        >
                          View details
                        </button>
                      )}
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {createOpen && visibleDirectory ? (
        <CreateTeamDialog
          error={error}
          members={visibleDirectory.availableMembers}
          pending={pending}
          workspaceId={workspace.id}
          onClose={() => setCreateOpen(false)}
          onSubmit={createTeam}
        />
      ) : null}
      {selectedTeam ? (
        <TeamDetailDrawer
          key={`${selectedTeam.id}:${selectedTeam.version}`}
          canManage={canManageTeam(
            selectedTeam,
            session.user.id,
            session.managedWorkspaceIds,
          )}
          error={error}
          pending={pending}
          team={selectedTeam}
          availableMembers={visibleDirectory?.availableMembers ?? []}
          onClose={() => setSelectedTeamId(null)}
          onRefresh={() => {
            setError(null);
            void directory.refetch();
          }}
          onRemoveMember={(userId) =>
            runTeamMutation(
              () =>
                liveData.client.removeTeamMember(
                  selectedTeam.id,
                  userId,
                  selectedTeam.version,
                  crypto.randomUUID(),
                ),
              "Team membership and room access were updated.",
            ).then(Boolean)
          }
          onSetMember={(userId, role) =>
            runTeamMutation(
              () =>
                liveData.client.setTeamMember(
                  selectedTeam.id,
                  userId,
                  { role },
                  selectedTeam.version,
                  crypto.randomUUID(),
                ),
              "Team membership and room access were updated.",
            ).then(Boolean)
          }
          onUpdate={(input) =>
            runTeamMutation(
              () =>
                liveData.client.updateTeam(
                  selectedTeam.id,
                  input,
                  selectedTeam.version,
                  crypto.randomUUID(),
                ),
              "Team settings were saved.",
            ).then(Boolean)
          }
        />
      ) : null}
    </WorkspaceFrame>
  );
}

function teamFeatureAvailability(team: TeamDto) {
  const optionCount = team.featureCapabilities.length;
  const source =
    team.featurePolicySource === "preset"
      ? "preset"
      : team.featurePolicySource === "override"
        ? "custom"
        : "configured";
  return `${optionCount} ${source} ${optionCount === 1 ? "option" : "options"} available to ${team.members.length} ${team.members.length === 1 ? "member" : "members"}`;
}

function sameFeatures(
  left: readonly TeamFeatureCapability[],
  right: readonly TeamFeatureCapability[],
) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((feature) => rightSet.has(feature));
}

function CreateTeamDialog({
  error,
  members,
  pending,
  workspaceId,
  onClose,
  onSubmit,
}: {
  error: unknown;
  members: Array<{ id: string; name: string; email: string }>;
  pending: boolean;
  workspaceId: string;
  onClose: () => void;
  onSubmit: (input: CreateTeamInput) => Promise<boolean>;
}) {
  const dialogRef = useAccessibleDialog(onClose);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [preset, setPreset] = useState<TeamPreset>("custom");
  const [features, setFeatures] = useState<TeamFeatureCapability[]>([
    "work",
    "messages",
  ]);
  const [featuresCustomized, setFeaturesCustomized] = useState(true);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [leadUserId, setLeadUserId] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || pending) return;
    await onSubmit({
      workspaceId,
      name,
      purpose,
      preset,
      ...(featuresCustomized ? { featureCapabilities: features } : {}),
      memberIds,
      ...(leadUserId ? { leadUserId } : {}),
    });
  }

  function toggleMember(userId: string, checked: boolean) {
    setMemberIds((current) =>
      checked
        ? [...new Set([...current, userId])]
        : current.filter((id) => id !== userId),
    );
    if (!checked && leadUserId === userId) setLeadUserId("");
  }

  return (
    <div
      className={styles.modalBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-labelledby="create-live-team-title"
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <div>
            <p>Workspace collaboration</p>
            <h2 id="create-live-team-title">Create Team</h2>
          </div>
          <button
            aria-label="Close Team creator"
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        </header>
        <form className={styles.dialogBody} onSubmit={submit}>
          {error ? (
            <LiveStateNotice {...presentLiveError(error)} compact />
          ) : null}
          <label>
            Team name
            <input
              autoComplete="off"
              autoFocus
              maxLength={160}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </label>
          <label>
            Purpose
            <textarea
              maxLength={1_000}
              onChange={(event) => setPurpose(event.target.value)}
              rows={3}
              value={purpose}
            />
          </label>
          <label>
            Feature preset
            <select
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
          <fieldset className={styles.choiceList}>
            <legend>Interface options available to Team members</legend>
            <p>
              {featuresCustomized
                ? "These are explicit Team options. They shape the interface but never override server data permissions."
                : `${presetLabels[preset]} defaults are inherited by Team members. Changing a checkbox creates an explicit Team override; data authorization remains server-controlled.`}
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
          <fieldset className={styles.choiceList}>
            <legend>People</legend>
            {members.length === 0 ? (
              <p>Invite organization members before assigning this Team.</p>
            ) : (
              members.map((member) => (
                <label key={member.id}>
                  <input
                    checked={memberIds.includes(member.id)}
                    onChange={(event) =>
                      toggleMember(member.id, event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>
                    <strong>{member.name}</strong>
                    <small>{member.email}</small>
                  </span>
                </label>
              ))
            )}
          </fieldset>
          <label>
            Team lead
            <select
              disabled={memberIds.length === 0}
              onChange={(event) => setLeadUserId(event.target.value)}
              value={leadUserId}
            >
              <option value="">No lead yet</option>
              {members
                .filter((member) => memberIds.includes(member.id))
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
            </select>
          </label>
          <footer className={styles.dialogActions}>
            <button onClick={onClose} type="button">
              Cancel
            </button>
            <button
              className="primary-button"
              disabled={!name.trim() || pending}
              type="submit"
            >
              {pending ? "Creating…" : "Create Team and room"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function TeamDetailDrawer({
  availableMembers,
  canManage,
  error,
  pending,
  team,
  onClose,
  onRemoveMember,
  onRefresh,
  onSetMember,
  onUpdate,
}: {
  availableMembers: Array<{ id: string; name: string; email: string }>;
  canManage: boolean;
  error: unknown;
  pending: boolean;
  team: TeamDto;
  onClose: () => void;
  onRemoveMember: (userId: string) => Promise<boolean>;
  onRefresh: () => void;
  onSetMember: (userId: string, role: "lead" | "member") => Promise<boolean>;
  onUpdate: (input: UpdateTeamInput) => Promise<boolean>;
}) {
  const dialogRef = useAccessibleDialog(onClose);
  const [name, setName] = useState(team.name);
  const [purpose, setPurpose] = useState(team.purpose);
  const [preset, setPreset] = useState(team.preset);
  const [features, setFeatures] = useState(team.featureCapabilities);
  const [featuresCustomized, setFeaturesCustomized] = useState(false);
  const [newMemberId, setNewMemberId] = useState("");
  const existingIds = useMemo(
    () => new Set(team.members.map((member) => member.user.id)),
    [team.members],
  );
  const addableMembers = availableMembers.filter(
    (member) => !existingIds.has(member.id),
  );
  const presetChanged = preset !== team.preset;
  const featureOverrideChanged =
    featuresCustomized &&
    (presetChanged ||
      !sameFeatures(features, team.featureCapabilities) ||
      team.featurePolicySource !== "override");
  const profileChanged =
    name.trim() !== team.name ||
    purpose.trim() !== team.purpose ||
    presetChanged ||
    featureOverrideChanged;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || pending || !name.trim() || !profileChanged) return;
    const input: UpdateTeamInput = {
      ...(name.trim() !== team.name ? { name } : {}),
      ...(purpose.trim() !== team.purpose ? { purpose } : {}),
      ...(presetChanged ? { preset } : {}),
      ...(featureOverrideChanged ? { featureCapabilities: features } : {}),
    };
    await onUpdate(input);
  }

  const presented = error ? presentLiveError(error) : null;

  return (
    <div className={styles.drawerBackdrop}>
      <aside
        aria-labelledby="live-team-detail-title"
        aria-modal="true"
        className={styles.drawer}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <div>
            <p>
              {team.featurePolicySource === "preset"
                ? `${presetLabels[team.preset]} preset defaults`
                : team.featurePolicySource === "override"
                  ? "Explicit Team options"
                  : "No Team options configured"}
            </p>
            <h2 id="live-team-detail-title">{team.name}</h2>
          </div>
          <button
            aria-label="Close Team details"
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        </header>
        <div className={styles.drawerScroll}>
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
          <section className={styles.roomCallout}>
            <MessageCircleMore size={18} aria-hidden="true" />
            <div>
              <strong>{team.room?.title ?? "Private Team room"}</strong>
              <span>
                {team.room
                  ? "Membership is synchronized atomically with this Team room."
                  : "Room identity and activity are visible only to active Team members."}
              </span>
            </div>
          </section>

          <form className={styles.drawerSection} onSubmit={save}>
            <header>
              <div>
                <h3>Team profile</h3>
                <p>Purpose and feature preset</p>
              </div>
            </header>
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
                These are interface options, not data authorization. Server
                membership and roles continue to control access. Saving a
                changed checkbox records an explicit override; untouched preset
                defaults retain preset provenance.
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
                disabled={pending || !name.trim() || !profileChanged}
                type="submit"
              >
                {pending ? "Saving…" : "Save Team profile"}
              </button>
            ) : null}
          </form>

          <section className={styles.drawerSection}>
            <header>
              <div>
                <h3>People and data access</h3>
                <p>
                  Server authorization remains authoritative for every person.
                </p>
              </div>
              <span>{team.members.length}</span>
            </header>
            <div className={styles.memberList}>
              {team.members.map((member) => (
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
                </article>
              ))}
              {team.members.length === 0 ? (
                <p className={styles.inlineEmpty}>No people assigned yet.</p>
              ) : null}
            </div>
            {canManage && addableMembers.length > 0 ? (
              <div className={styles.addMemberRow}>
                <label>
                  Add organization member
                  <select
                    onChange={(event) => setNewMemberId(event.target.value)}
                    value={newMemberId}
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
                  <Plus size={15} /> Add
                </button>
              </div>
            ) : null}
          </section>
        </div>
      </aside>
    </div>
  );
}

function uniqueMemberCount(teams: readonly TeamDto[]) {
  return new Set(
    teams.flatMap((team) => team.members.map((member) => member.user.id)),
  ).size;
}

function canManageTeams(
  managedWorkspaceIds: readonly string[],
  workspaceId: string,
) {
  return managedWorkspaceIds.includes(workspaceId);
}

function canManageTeam(
  team: TeamDto,
  userId: string,
  managedWorkspaceIds: readonly string[],
) {
  return (
    canManageTeams(managedWorkspaceIds, team.workspaceId) ||
    team.members.some(
      (member) => member.user.id === userId && member.role === "lead",
    )
  );
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toLocaleUpperCase();
}
