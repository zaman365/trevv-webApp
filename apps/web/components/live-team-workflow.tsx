"use client";
import { WorkspacePageSections } from "./workspace-page-sections";
import { personHref } from "@/lib/people-routes";

import {
  teamFeatureCapabilitiesForPreset,
  type CreateTeamInput,
  type TeamDto,
  type TeamFeatureCapability,
  type TeamPreset,
} from "@founderhq/api-contract";
import { TrevvApiError } from "@founderhq/api-client";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  MessageCircleMore,
  Plus,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { AppLink as Link } from "@/components/navigation-link";
import {
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useLiveTeamActions } from "@/lib/use-live-team-actions";
import { useAppSession } from "@/lib/app-session-context";
import {
  useAccessibleDialog,
  useLiveTeamDirectory,
} from "@/lib/live-collaboration";
import { useLiveAppRecords as useLiveAppData } from "@/lib/live-app-data";
import { presentLiveError } from "@/lib/live-errors";
import { teamHref, workspaceHref } from "@/lib/workspace-routes";
import { LiveStateNotice } from "./live-state";
import { WorkspaceFrame } from "./workspace-frame";
import styles from "./live-collaboration.module.css";
import { teamPlaybooks } from "@/lib/team-playbooks";
import dynamic from "next/dynamic";
import type { TeamSummaryView } from "./live-team-summary";
const TeamSummaryDialog = dynamic(
  () =>
    import("./live-team-summary").then((module) => module.TeamSummaryDialog),
  { loading: () => <p role="status">Opening team summary…</p> },
);
import {
  featureLabels,
  presetLabels,
  featureOptions,
  presetOptions,
  canManageTeam,
  canManageTeams,
} from "@/lib/team-workspace";
import type { TeamManagementProps } from "./live-team-management";
const TeamManagementContent = dynamic(
  () =>
    import("./live-team-management").then(
      (module) => module.TeamManagementContent,
    ),
  { loading: () => <p role="status">Opening team management…</p> },
);
const LiveMyWork = dynamic(
  () => import("./live-work-my-work").then((module) => module.LiveMyWork),
  { loading: () => <p role="status">Loading team workload…</p> },
);
import { retainedKey } from "@/lib/live-work-view-helpers";
import { workspaceResourceKeys } from "@/lib/workspace-resource-keys";
import { taskToday, taskBelongsToTeam } from "@/lib/task-views";

export function LiveTeamWorkflow({ workspaceSlug }: { workspaceSlug: string }) {
  return (
    <WorkspaceFrame active="teams" workspaceSlug={workspaceSlug}>
      <LiveTeamWorkflowContent workspaceSlug={workspaceSlug} />
    </WorkspaceFrame>
  );
}

function TeamDirectorySections({
  embedded,
  workspaceSlug,
  children,
}: {
  embedded: boolean;
  workspaceSlug: string;
  children: ReactNode;
}) {
  return embedded ? (
    children
  ) : (
    <WorkspacePageSections page="teams" workspaceSlug={workspaceSlug}>
      {children}
    </WorkspacePageSections>
  );
}

export function LiveTeamWorkflowContent({
  workspaceSlug,
  embedded = false,
  heading = "Teams",
}: {
  workspaceSlug: string;
  embedded?: boolean;
  heading?: string;
}) {
  const Content = embedded ? "div" : "main";
  const Heading = embedded ? "h3" : "h1";
  const session = useAppSession();
  const liveData = useLiveAppData();
  const workspace = liveData.workspaces.find(
    (record) => record.slug === workspaceSlug,
  );
  const directory = useLiveTeamDirectory(workspace?.id);
  const boardsQuery = useQuery({
    queryKey: workspaceResourceKeys.boards(
      session.organization.id,
      workspace?.id ?? "",
    ),
    queryFn: ({ signal }) =>
      liveData.client.withSignal(signal).boards(workspace!.id),
    enabled: Boolean(workspace),
    staleTime: 30_000,
  });
  const directoryAccessLost =
    directory.error instanceof TrevvApiError &&
    [401, 403, 404].includes(directory.error.status);
  const visibleDirectory = directoryAccessLost ? undefined : directory.data;
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [summaryView, setSummaryView] = useState<TeamSummaryView | null>(null);
  const summaryTriggerRef = useRef<HTMLButtonElement | null>(null);
  const teamTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [workTeamId, setWorkTeamId] = useState("");
  const createKeys = useRef(new Map<string, string>());
  const {
    pending,
    error,
    savedMessage,
    setError,
    setSavedMessage,
    runTeamMutation,
  } = useLiveTeamActions(workspace?.id);
  const canCreate = workspace
    ? canManageTeams(session.managedWorkspaceIds, workspace.id)
    : false;
  const selectedTeam = visibleDirectory?.teams.find(
    (team) => team.id === selectedTeamId,
  );

  async function createTeam(input: CreateTeamInput) {
    const fingerprint = JSON.stringify(input);
    const created = await runTeamMutation(
      () =>
        liveData.client.createTeam(
          input,
          retainedKey(createKeys.current, fingerprint),
        ),
      `Team “${input.name}” and its room were saved.`,
    );
    if (!created) return false;
    createKeys.current.delete(fingerprint);
    setCreateOpen(false);
    setSelectedTeamId(created.id);
    return true;
  }

  if (!workspace) {
    return (
      <>
        <Content
          className={embedded ? styles.embeddedContent : styles.routeMain}
        >
          <LiveStateNotice
            kind="permission-loss"
            title="Workspace not available"
            description="This workspace is outside your current access or no longer exists."
          />
        </Content>
      </>
    );
  }

  const presentedError = error
    ? presentLiveError(error)
    : directory.error
      ? presentLiveError(directory.error)
      : null;

  return (
    <>
      <Content
        className={`${styles.routeMain} ${embedded ? styles.embeddedContent : ""}`}
        data-testid="live-teams"
      >
        <header
          className={`${styles.pageHeader} ${styles.teamDirectoryHeader} compact-page-header`}
        >
          <div>
            <Heading>{heading}</Heading>
          </div>
          <div
            className={`${styles.headerActions} ${styles.teamHeaderActions}`}
          >
            <Link href={personHref(workspaceSlug)}>
              <Users size={16} />
              People directory
            </Link>
            {canCreate ? (
              <button
                className="primary-button"
                data-testid="create-team-open"
                disabled={directoryAccessLost || directory.isLoading}
                onClick={(event) => {
                  teamTriggerRef.current = event.currentTarget;
                  setError(null);
                  setSavedMessage("");
                  setCreateOpen(true);
                }}
                type="button"
              >
                <Plus size={16} /> Create Team
              </button>
            ) : null}
            {["owner", "admin"].includes(session.organization.role) ? (
              <Link
                href={`/app/account/invitations?workspaceId=${encodeURIComponent(workspace.id)}`}
                aria-label={`Invite people to ${workspace.name}`}
              >
                Invite people
              </Link>
            ) : null}
          </div>
        </header>

        <TeamDirectorySections
          embedded={embedded}
          workspaceSlug={workspaceSlug}
        >
          {directory.isLoading ? (
            <LiveStateNotice kind="loading" title="Loading Teams" />
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
            <button
              type="button"
              aria-haspopup="dialog"
              disabled={!visibleDirectory}
              onClick={(event) => {
                summaryTriggerRef.current = event.currentTarget;
                setSummaryView("teams");
              }}
            >
              <Users size={18} aria-hidden="true" />
              <strong>{visibleDirectory?.teams.length ?? 0}</strong>
              <span>Teams</span>
              <small>
                View teams <ChevronRight size={14} aria-hidden="true" />
              </small>
            </button>
            <button
              type="button"
              aria-haspopup="dialog"
              disabled={!visibleDirectory}
              onClick={(event) => {
                summaryTriggerRef.current = event.currentTarget;
                setSummaryView("people");
              }}
            >
              <ShieldCheck size={18} aria-hidden="true" />
              <strong>
                {uniqueMemberCount(visibleDirectory?.teams ?? [])}
              </strong>
              <span>Assigned people</span>
              <small>
                View people <ChevronRight size={14} aria-hidden="true" />
              </small>
            </button>
            <button
              type="button"
              aria-haspopup="dialog"
              disabled={!visibleDirectory}
              onClick={(event) => {
                summaryTriggerRef.current = event.currentTarget;
                setSummaryView("rooms");
              }}
            >
              <MessageCircleMore size={18} aria-hidden="true" />
              <strong>{visibleDirectory?.teams.length ?? 0}</strong>
              <span>Synchronized rooms</span>
              <small>
                View rooms <ChevronRight size={14} aria-hidden="true" />
              </small>
            </button>
          </section>

          <section className={styles.surface} aria-labelledby="team-list-title">
            <header className={styles.surfaceHeader}>
              <div>
                <p>Workspace structure</p>
                <h2 id="team-list-title">Your teams</h2>
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
                  Create a team, add people, and start a conversation. Each team
                  has its own shared room and work view.
                </p>
                {canCreate ? (
                  <button
                    onClick={(event) => {
                      teamTriggerRef.current = event.currentTarget;
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
                  const tasks = liveData.items.filter(
                    (item) =>
                      taskBelongsToTeam(item, team, boardsQuery.data ?? []) &&
                      item.status !== "done",
                  );
                  const today = taskToday(
                    session.organization.timezone ?? "UTC",
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
                            <h3>
                              <Link href={teamHref(workspaceSlug, team.id)}>
                                {team.name}
                              </Link>
                            </h3>
                          </div>
                          <span className={styles.memberCount}>
                            <Users size={13} /> {team.members.length}
                          </span>
                        </div>
                        <p>
                          {team.purpose || teamPlaybooks[team.preset].outcome}
                        </p>
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
                        <p className={styles.teamTaskSummary}>
                          {tasks.length} open tasks ·{" "}
                          {
                            tasks.filter(
                              (item) => item.dueDate && item.dueDate < today,
                            ).length
                          }{" "}
                          overdue ·{" "}
                          {
                            tasks.filter((item) => item.status === "blocked")
                              .length
                          }{" "}
                          blocked{liveData.recordsComplete ? "" : " · Loading…"}
                        </p>
                      </div>
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
                      <div className={styles.teamWorkActions}>
                        <Link href={teamHref(workspaceSlug, team.id)}>
                          Open team{" "}
                          <ChevronRight size={14} aria-hidden="true" />
                        </Link>
                        <button
                          type="button"
                          aria-label="View member workload"
                          onClick={() => setWorkTeamId(team.id)}
                        >
                          Workload
                        </button>
                        {team.room ? (
                          <Link
                            aria-label="Open team room"
                            href={`${workspaceHref(workspaceSlug, "messages")}#${encodeURIComponent(team.room.conversationId)}`}
                          >
                            Team room
                          </Link>
                        ) : null}
                      </div>
                      <footer className={styles.teamCardFooter}>
                        <small>{teamFeatureAvailability(team)}</small>
                        {canManage ? (
                          <button
                            aria-label={`Manage ${team.name}`}
                            onClick={(event) => {
                              teamTriggerRef.current = event.currentTarget;
                              setSelectedTeamId(team.id);
                            }}
                            type="button"
                          >
                            <Settings2 size={14} /> Manage
                          </button>
                        ) : (
                          <button
                            onClick={(event) => {
                              teamTriggerRef.current = event.currentTarget;
                              setSelectedTeamId(team.id);
                            }}
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
          <section className={styles.surface} aria-label="Team workload">
            <label>
              Show workload for{" "}
              <select
                value={workTeamId}
                onChange={(event) => setWorkTeamId(event.target.value)}
              >
                <option value="">Everyone in this workspace</option>
                {(visibleDirectory?.teams ?? []).map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            <LiveMyWork
              key={workTeamId}
              workspaceSlug={workspaceSlug}
              assignedToMe={false}
              title="Member workload"
              items={liveData.items.filter(
                (item) =>
                  item.workspaceId === workspace.id &&
                  (!workTeamId ||
                    visibleDirectory?.teams.some(
                      (team) =>
                        team.id === workTeamId &&
                        taskBelongsToTeam(item, team, boardsQuery.data ?? []),
                    )),
              )}
            />
          </section>
        </TeamDirectorySections>
      </Content>

      {summaryView && visibleDirectory ? (
        <TeamSummaryDialog
          view={summaryView}
          teams={visibleDirectory.teams}
          workspaceSlug={workspaceSlug}
          returnFocusRef={summaryTriggerRef}
          onClose={() => setSummaryView(null)}
          onOpenTeam={(teamId) => {
            teamTriggerRef.current = summaryTriggerRef.current;
            setSummaryView(null);
            setSelectedTeamId(teamId);
          }}
        />
      ) : null}
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
          key={selectedTeam.id}
          workspaceSlug={workspaceSlug}
          canManage={canManageTeam(
            selectedTeam,
            session.user.id,
            session.managedWorkspaceIds,
          )}
          error={error}
          pending={pending}
          team={selectedTeam}
          returnFocusRef={teamTriggerRef}
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
          onUpdate={(input, expectedVersion) =>
            runTeamMutation(
              () =>
                liveData.client.updateTeam(
                  selectedTeam.id,
                  input,
                  expectedVersion,
                  crypto.randomUUID(),
                ),
              "Team settings were saved.",
            ).then(Boolean)
          }
        />
      ) : null}
    </>
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
  const session = useAppSession();
  const creatorId = members.some((person) => person.id === session.user.id)
    ? session.user.id
    : "";
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [preset, setPreset] = useState<TeamPreset>("custom");
  const [features, setFeatures] = useState<TeamFeatureCapability[]>([
    "work",
    "messages",
  ]);
  const [featuresCustomized, setFeaturesCustomized] = useState(true);
  const [memberIds, setMemberIds] = useState<string[]>(
    creatorId ? [creatorId] : [],
  );
  const [leadUserId, setLeadUserId] = useState(creatorId);

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
          <details>
            <summary>Customize team tools</summary>
            <fieldset className={styles.choiceList}>
              <legend>Interface options available to Team members</legend>
              <p>
                {featuresCustomized
                  ? "Choose the tools this team uses."
                  : `${presetLabels[preset]} tools are selected for you. You can customize them.`}
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
          </details>
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
  returnFocusRef,
  onClose,
  ...props
}: TeamManagementProps & {
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const dialogRef = useAccessibleDialog(onClose, returnFocusRef);
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
            <p>{presetLabels[props.team.preset]} team</p>
            <h2 id="live-team-detail-title">{props.team.name}</h2>
            <Link href={teamHref(props.workspaceSlug, props.team.id)}>
              Open full team page <ChevronRight size={14} />
            </Link>
          </div>
          <button
            aria-label="Close Team details"
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        </header>
        <TeamManagementContent {...props} />
      </aside>
    </div>
  );
}

function uniqueMemberCount(teams: readonly TeamDto[]) {
  return new Set(
    teams.flatMap((team) => team.members.map((member) => member.user.id)),
  ).size;
}
