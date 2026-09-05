"use client";

import {
  ArrowRight,
  ArrowRightLeft,
  Blocks,
  CalendarClock,
  CheckCircle2,
  Filter,
  Layers3,
  Mail,
  MapPin,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  calculateResourcePressure,
  demoWorkspaces,
  demoItems,
  type ResourcePressure,
} from "@founderhq/core";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useWorkspaceState as useWorkspace } from "@/lib/workspace-context";
import { workspaceHref } from "@/lib/workspace-routes";
import {
  capabilitiesForMember,
  createInitialWorkspaceTeams,
  readWorkspaceTeamsSnapshot,
  setTeamMembership,
  teamCapabilityCatalog,
  teamsForMember,
  writeWorkspaceTeamsSnapshot,
  type TeamCapabilityId,
  type WorkspaceTeam,
} from "@/lib/teams";
import { Hint } from "./learning-center";
import { CapabilityNotice } from "./capability-status";

type MemberStatus = "active" | "away" | "draft";
type MemberRole = "Owner" | "Admin" | "Member" | "Guest";

interface TeamMember extends ResourcePressure {
  email: string;
  role: MemberRole;
  status: MemberStatus;
  location: string;
  weeklyCapacity: number;
  focusNote: string;
}

const currentWorkspaces = demoWorkspaces.filter(
  (workspace) => !workspace.id.startsWith("original-"),
);
const currentItems = demoItems.filter(
  (item) => !item.id.startsWith("original-"),
);
const roleCycle: MemberRole[] = ["Owner", "Admin", "Member", "Member"];

const initialMembers: TeamMember[] = calculateResourcePressure(
  currentWorkspaces,
  currentItems,
  new Date("2026-08-24T12:00:00.000Z"),
).map((person, index) => ({
  ...person,
  email: `${person.userName.toLocaleLowerCase().replaceAll(" ", ".")}@trevv.example`,
  role: roleCycle[index % roleCycle.length]!,
  status: index === 4 ? "away" : "active",
  location: index % 2 ? "Berlin · CET" : "Remote · CET",
  weeklyCapacity: index % 3 === 0 ? 32 : 40,
  focusNote:
    index === 0
      ? "Protecting launch readiness and owner decisions this week."
      : "Balancing delivery work with review commitments.",
}));

const initialTeams = createInitialWorkspaceTeams(
  currentWorkspaces,
  initialMembers,
);

const capabilityLabel = new Map(
  teamCapabilityCatalog.map((capability) => [capability.id, capability.label]),
);

const normalizeMemberStatus = (status: string): MemberStatus => {
  if (status === "away" || status === "draft") return status;
  if (status === "invited") return "draft";
  return "active";
};

export function TeamWorkflow() {
  const { scope } = useWorkspace();
  const [members, setMembers] = useState(initialMembers);
  const [teams, setTeams] = useState(initialTeams);
  const [query, setQuery] = useState("");
  const [pressureFilter, setPressureFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rebalanceId, setRebalanceId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    const stored = readWorkspaceTeamsSnapshot<TeamMember>();
    const frame = window.requestAnimationFrame(() => {
      if (stored) {
        setMembers(
          stored.members.map((member) => {
            const storedStatus = String(member.status);
            return {
              ...member,
              status: normalizeMemberStatus(storedStatus),
              focusNote:
                storedStatus === "invited"
                  ? "Invitation draft only. No email or access was created."
                  : member.focusNote,
            };
          }),
        );
        setTeams(stored.teams);
      }
      setStorageReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      writeWorkspaceTeamsSnapshot({ members, teams });
    } catch {
      // In-memory state keeps the workflow usable if storage is unavailable.
    }
  }, [members, storageReady, teams]);

  const scopedWorkspaceIds = new Set(
    scope.workspaces.map((project) => project.id),
  );
  const scopedTeams = teams.filter((team) =>
    scopedWorkspaceIds.has(team.workspaceId),
  );
  const scopedMembers = members.filter((member) =>
    member.workspaceIds.some((workspaceId) =>
      scopedWorkspaceIds.has(workspaceId),
    ),
  );
  const selected = scopedMembers.find((member) => member.userId === selectedId);
  const selectedTeam = scopedTeams.find((team) => team.id === selectedTeamId);
  const rebalanceMember = scopedMembers.find(
    (member) => member.userId === rebalanceId,
  );
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return scopedMembers.filter((member) => {
      if (pressureFilter !== "all" && member.pressure !== pressureFilter)
        return false;
      if (statusFilter !== "all" && member.status !== statusFilter)
        return false;
      const memberTeams = teamsForMember(scopedTeams, member.userId);
      if (
        teamFilter !== "all" &&
        !memberTeams.some((team) => team.id === teamFilter)
      )
        return false;
      return (
        !normalized ||
        `${member.userName} ${member.email} ${member.role} ${memberTeams
          .map((team) => team.name)
          .join(" ")}`
          .toLocaleLowerCase()
          .includes(normalized)
      );
    });
  }, [
    pressureFilter,
    query,
    scopedMembers,
    scopedTeams,
    statusFilter,
    teamFilter,
  ]);

  const updateMember = (id: string, update: Partial<TeamMember>) => {
    setMembers((current) =>
      current.map((member) =>
        member.userId === id ? { ...member, ...update } : member,
      ),
    );
  };

  const active = scopedMembers.filter(
    (member) => member.status === "active",
  ).length;
  const elevated = scopedMembers.filter(
    (member) => member.pressure !== "normal",
  ).length;
  const updateTeam = (id: string, update: Partial<WorkspaceTeam>) => {
    setTeams((current) =>
      current.map((team) => (team.id === id ? { ...team, ...update } : team)),
    );
  };

  return (
    <>
      <header className="trevv-page-header">
        <div>
          <p>Workspace</p>
          <h1 className="page-title-with-hint">
            Workspace teams <Hint resourceId="team-pressure" />
          </h1>
          <span>
            Preview fictional teams and feature presets. Nothing here grants
            real access or changes another person&apos;s account.
          </span>
        </div>
        <div className="team-header-actions">
          <button
            className="secondary-button"
            onClick={() => setInviteOpen(true)}
          >
            <UserPlus size={16} /> Prepare sample invite
          </button>
          <button
            className="primary-button"
            onClick={() => setCreateTeamOpen(true)}
          >
            <Plus size={16} /> Add sample team
          </button>
        </div>
      </header>
      <CapabilityNotice capability="teams" />

      {notice && (
        <div className="workflow-toast" role="status">
          <CheckCircle2 size={16} />
          <span>{notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <section className="team-summary-grid" aria-label="Team summary">
        <article>
          <span>
            <Layers3 size={17} />
          </span>
          <div>
            <b>{scopedTeams.length}</b>
            <small>Teams</small>
          </div>
        </article>
        <article>
          <span>
            <Users size={17} />
          </span>
          <div>
            <b>{scopedMembers.length}</b>
            <small>People</small>
          </div>
        </article>
        <article>
          <span>
            <CheckCircle2 size={17} />
          </span>
          <div>
            <b>{active}</b>
            <small>Available</small>
          </div>
        </article>
        <article className={elevated ? "warning" : ""}>
          <span>
            <Sparkles size={17} />
          </span>
          <div>
            <b>{elevated}</b>
            <small>Pressure signals</small>
          </div>
        </article>
      </section>

      <section
        className="workspace-teams-section"
        aria-labelledby="teams-heading"
      >
        <header>
          <div>
            <p>Sample structure and planned feature inheritance</p>
            <h2 id="teams-heading">Fictional teams in this Workspace</h2>
          </div>
          <span>{scopedTeams.length} configured</span>
        </header>
        <div className="workspace-team-grid">
          {scopedTeams.map((team) => {
            const teamMembers = scopedMembers.filter((member) =>
              team.memberIds.includes(member.userId),
            );
            const lead = teamMembers.find(
              (member) => member.userId === team.leadMemberId,
            );
            return (
              <article
                className={`workspace-team-card ${team.accent}`}
                key={team.id}
              >
                <header>
                  <span className="workspace-team-icon">
                    <Blocks size={17} />
                  </span>
                  <div>
                    <h3>{team.name}</h3>
                    <small>
                      {teamMembers.length}{" "}
                      {teamMembers.length === 1 ? "member" : "members"}
                    </small>
                  </div>
                  <button
                    className="table-row-menu"
                    aria-label={`Manage ${team.name}`}
                    onClick={() => setSelectedTeamId(team.id)}
                  >
                    <Settings2 size={16} />
                  </button>
                </header>
                <p>{team.description}</p>
                <div
                  className="team-capability-chips"
                  aria-label={`${team.name} features`}
                  role="group"
                >
                  {team.capabilities.slice(0, 3).map((capability) => (
                    <span key={capability}>
                      {capabilityLabel.get(capability)}
                    </span>
                  ))}
                  {team.capabilities.length > 3 && (
                    <span>+{team.capabilities.length - 3}</span>
                  )}
                </div>
                <footer>
                  <div
                    className="team-avatar-stack"
                    aria-label={`${team.name} members`}
                    role="group"
                  >
                    {teamMembers.slice(0, 4).map((member) => (
                      <span
                        className="avatar"
                        title={member.userName}
                        key={member.userId}
                      >
                        {initialsFor(member.userName)}
                      </span>
                    ))}
                    {teamMembers.length > 4 && (
                      <span className="avatar">+{teamMembers.length - 4}</span>
                    )}
                  </div>
                  <span>
                    {lead ? `Led by ${lead.userName}` : "No lead assigned"}
                  </span>
                  <button onClick={() => setSelectedTeamId(team.id)}>
                    Manage <ArrowRight size={13} />
                  </button>
                </footer>
              </article>
            );
          })}
          {!scopedTeams.length && (
            <button
              className="workspace-team-empty"
              onClick={() => setCreateTeamOpen(true)}
            >
              <Plus size={20} />
              <strong>Add the first sample team</strong>
              <span>
                Group fictional people and preview feature inheritance.
              </span>
            </button>
          )}
        </div>
      </section>

      {elevated > 0 && (
        <section className="pressure-note team-pressure-note">
          <Sparkles size={18} />
          <div>
            <strong>Coordination signal</strong>
            <span>
              {elevated} {elevated === 1 ? "person has" : "people have"}{" "}
              elevated or critical pressure based on urgent work, blockers,
              dates, and critical Workspace responsibility.
            </span>
          </div>
          <button
            onClick={() =>
              setRebalanceId(
                scopedMembers.find((member) => member.pressure !== "normal")
                  ?.userId ?? null,
              )
            }
          >
            Rebalance work <ArrowRight size={13} />
          </button>
        </section>
      )}

      <div className="workflow-command-bar team-command-bar">
        <label className="workflow-search">
          <Search size={15} />
          <span className="sr-only">Search team</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people, email, or role…"
          />
        </label>
        <label className="workflow-filter-select">
          <Layers3 size={14} />
          <span className="sr-only">Filter by team</span>
          <select
            value={teamFilter}
            onChange={(event) => setTeamFilter(event.target.value)}
          >
            <option value="all">All teams</option>
            {scopedTeams.map((team) => (
              <option value={team.id} key={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label className="workflow-filter-select">
          <Filter size={14} />
          <span className="sr-only">Filter by pressure</span>
          <select
            value={pressureFilter}
            onChange={(event) => setPressureFilter(event.target.value)}
          >
            <option value="all">All pressure</option>
            <option value="critical">Critical</option>
            <option value="elevated">Elevated</option>
            <option value="normal">Normal</option>
          </select>
        </label>
        <label className="workflow-filter-select">
          <span className="sr-only">Filter by status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All status</option>
            <option value="active">Available</option>
            <option value="away">Away</option>
            <option value="draft">Invite drafts</option>
          </select>
        </label>
      </div>

      <section className="trevv-panel team-directory-table">
        <header>
          <span>Person</span>
          <span>Workspace role</span>
          <span>Teams</span>
          <span>Inherited features</span>
          <span>Urgent / high</span>
          <span>Blocked</span>
          <span>Pressure</span>
          <span>
            <span className="sr-only">Actions</span>
          </span>
        </header>
        {visible.map((member) => {
          const memberTeams = teamsForMember(scopedTeams, member.userId);
          const inheritedCapabilities = capabilitiesForMember(
            scopedTeams,
            member.userId,
          );
          return (
            <article key={member.userId}>
              <button
                className="team-person-cell"
                onClick={() => setSelectedId(member.userId)}
              >
                <span className="avatar">{initialsFor(member.userName)}</span>
                <span>
                  <strong>{member.userName}</strong>
                  <small>
                    {member.status === "active"
                      ? member.location
                      : member.status === "draft"
                        ? "Invite draft · no email sent"
                        : member.status}
                  </small>
                </span>
              </button>
              <span
                className={`role-badge role-${member.role.toLocaleLowerCase()}`}
              >
                {member.role}
              </span>
              <button
                className="member-team-summary"
                onClick={() => setSelectedId(member.userId)}
                aria-label={`Manage teams for ${member.userName}`}
              >
                {memberTeams.length ? (
                  <>
                    <b>{memberTeams.length}</b>
                    <span>
                      {memberTeams.map((team) => team.name).join(", ")}
                    </span>
                  </>
                ) : (
                  <span>Unassigned</span>
                )}
              </button>
              <span className="inherited-feature-count">
                <ShieldCheck size={13} /> {inheritedCapabilities.length}
              </span>
              <b>{member.urgentHighActive}</b>
              <b>{member.blockedResponsibilities}</b>
              <span className={`pressure-badge ${member.pressure}`}>
                {member.pressure}
              </span>
              <button
                className="table-row-menu"
                aria-label={`Open actions for ${member.userName}`}
                onClick={() => setSelectedId(member.userId)}
              >
                <MoreHorizontal size={16} />
              </button>
            </article>
          );
        })}
        {!visible.length && (
          <div className="table-empty">
            <Users size={22} />
            <strong>No members match these filters</strong>
            <span>Clear a filter or invite someone new.</span>
          </div>
        )}
      </section>

      {inviteOpen && (
        <InviteMemberDialog
          projects={scope.workspaces}
          teams={scopedTeams}
          onClose={() => setInviteOpen(false)}
          onInvite={(member, teamIds) => {
            setMembers((current) => [...current, member]);
            setTeams((current) =>
              teamIds.reduce(
                (next, teamId) =>
                  setTeamMembership(next, teamId, member.userId, true),
                current,
              ),
            );
            setInviteOpen(false);
            setNotice(
              `Invitation prepared for ${member.email}. No external email is sent in this demo.`,
            );
          }}
        />
      )}
      {selected && (
        <MemberDetailDialog
          member={selected}
          projects={scope.workspaces}
          teams={scopedTeams}
          {...(scope.workspaces[0]
            ? { workspaceSlug: scope.workspaces[0].slug }
            : {})}
          onClose={() => setSelectedId(null)}
          onUpdate={(update, message) => {
            updateMember(selected.userId, update);
            setNotice(message);
          }}
          onTeamMembershipChange={(teamId, assigned) => {
            setTeams((current) =>
              setTeamMembership(current, teamId, selected.userId, assigned),
            );
            setNotice(
              `${selected.userName} ${assigned ? "joined" : "left"} ${
                scopedTeams.find((team) => team.id === teamId)?.name ??
                "the team"
              }.`,
            );
          }}
          onRebalance={() => {
            setSelectedId(null);
            setRebalanceId(selected.userId);
          }}
        />
      )}
      {createTeamOpen && scope.workspaces[0] && (
        <CreateTeamDialog
          workspaceId={scope.workspaces[0].id}
          members={scopedMembers}
          onClose={() => setCreateTeamOpen(false)}
          onCreate={(team) => {
            setTeams((current) => [...current, team]);
            setCreateTeamOpen(false);
            setNotice(`${team.name} was added to this browser-only preview.`);
          }}
        />
      )}
      {selectedTeam && (
        <TeamDetailDialog
          team={selectedTeam}
          members={scopedMembers}
          onClose={() => setSelectedTeamId(null)}
          onUpdate={(update, message) => {
            updateTeam(selectedTeam.id, update);
            if (message) setNotice(message);
          }}
          onMembershipChange={(memberId, assigned) => {
            setTeams((current) =>
              setTeamMembership(current, selectedTeam.id, memberId, assigned),
            );
          }}
        />
      )}
      {rebalanceMember && (
        <RebalanceDialog
          member={rebalanceMember}
          items={scope.items}
          members={scopedMembers.filter(
            (member) =>
              member.userId !== rebalanceMember.userId &&
              member.status === "active",
          )}
          onClose={() => setRebalanceId(null)}
          onMove={(targetName) => {
            updateMember(rebalanceMember.userId, {
              urgentHighActive: Math.max(
                0,
                rebalanceMember.urgentHighActive - 1,
              ),
              dueThisWeek: Math.max(0, rebalanceMember.dueThisWeek - 1),
              pressure:
                rebalanceMember.pressure === "critical" ? "elevated" : "normal",
            });
            const target = members.find(
              (member) => member.userName === targetName,
            );
            if (target)
              updateMember(target.userId, {
                urgentHighActive: target.urgentHighActive + 1,
              });
            setRebalanceId(null);
            setNotice(
              `Work reassigned from ${rebalanceMember.userName} to ${targetName}.`,
            );
          }}
        />
      )}
    </>
  );
}

function MemberDetailDialog({
  member,
  projects,
  teams,
  workspaceSlug,
  onClose,
  onUpdate,
  onTeamMembershipChange,
  onRebalance,
}: {
  member: TeamMember;
  projects: typeof demoWorkspaces;
  teams: WorkspaceTeam[];
  workspaceSlug?: string;
  onClose: () => void;
  onUpdate: (update: Partial<TeamMember>, message: string) => void;
  onTeamMembershipChange: (teamId: string, assigned: boolean) => void;
  onRebalance: () => void;
}) {
  const inheritedCapabilities = capabilitiesForMember(teams, member.userId);
  return (
    <div
      className="workflow-dialog-layer"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="workflow-dialog member-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className="avatar member-dialog-avatar">
            {initialsFor(member.userName)}
          </span>
          <div>
            <p>
              {member.role} ·{" "}
              {member.status === "draft" ? "invite draft only" : member.status}
            </p>
            <h2 id="member-detail-title">{member.userName}</h2>
          </div>
          <Hint resourceId="team-pressure" />
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close member details"
          >
            <X size={18} />
          </button>
        </header>
        <div className="workflow-dialog-body member-detail-grid">
          <section>
            <h3>Sample profile & access preview</h3>
            <dl className="member-profile-list">
              <div>
                <dt>
                  <Mail size={14} /> Email
                </dt>
                <dd>{member.email}</dd>
              </div>
              <div>
                <dt>
                  <MapPin size={14} /> Location
                </dt>
                <dd>{member.location}</dd>
              </div>
              <div>
                <dt>
                  <CalendarClock size={14} /> Capacity
                </dt>
                <dd>{member.weeklyCapacity} hours / week</dd>
              </div>
            </dl>
            <label className="stacked-field">
              <span>Workspace role</span>
              <select
                value={member.role}
                onChange={(event) =>
                  onUpdate(
                    { role: event.target.value as MemberRole },
                    `Role updated to ${event.target.value}.`,
                  )
                }
              >
                <option>Owner</option>
                <option>Admin</option>
                <option>Member</option>
                <option>Guest</option>
              </select>
            </label>
            <div className="member-access-list">
              <b>Workspace access preview</b>
              {projects.slice(0, 5).map((workspace) => (
                <label key={workspace.id}>
                  <input
                    type="checkbox"
                    defaultChecked={member.workspaceIds.includes(workspace.id)}
                  />
                  <span>
                    {workspace.icon} {workspace.name}
                  </span>
                </label>
              ))}
            </div>
            <fieldset className="member-team-access">
              <legend>Team membership</legend>
              {teams.map((team) => (
                <label key={team.id}>
                  <input
                    type="checkbox"
                    checked={team.memberIds.includes(member.userId)}
                    onChange={(event) =>
                      onTeamMembershipChange(team.id, event.target.checked)
                    }
                  />
                  <span>
                    <b>{team.name}</b>
                    <small>{team.capabilities.length} preview features</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <Link
              className="linked-work-callout"
              href={
                workspaceSlug
                  ? workspaceHref(workspaceSlug, "settings")
                  : "/app/portfolio"
              }
            >
              <ShieldCheck size={14} /> Preview organization permissions{" "}
              <ArrowRight size={13} />
            </Link>
          </section>
          <aside>
            <h3>Feature inheritance preview</h3>
            <div className="inherited-capability-list">
              {inheritedCapabilities.map((capabilityId) => {
                const capability = teamCapabilityCatalog.find(
                  (candidate) => candidate.id === capabilityId,
                )!;
                return (
                  <span key={capability.id}>
                    <ShieldCheck size={13} /> {capability.label}
                  </span>
                );
              })}
              {!inheritedCapabilities.length && (
                <p>
                  Assign this fictional person to preview team feature
                  inheritance.
                </p>
              )}
            </div>
            <h3>Current pressure</h3>
            <div className="member-pressure-summary">
              <span className={`pressure-badge ${member.pressure}`}>
                {member.pressure}
              </span>
              <p>{member.focusNote}</p>
            </div>
            <div className="member-signal-grid">
              <span>
                <b>{member.urgentHighActive}</b>
                <small>Urgent / high</small>
              </span>
              <span>
                <b>{member.dueThisWeek}</b>
                <small>Due this week</small>
              </span>
              <span>
                <b>{member.blockedResponsibilities}</b>
                <small>Blocked</small>
              </span>
              <span>
                <b>{member.criticalWorkspaceResponsibilities}</b>
                <small>Critical projects</small>
              </span>
            </div>
            <button className="primary-button full-width" onClick={onRebalance}>
              <ArrowRightLeft size={14} /> Rebalance one item
            </button>
            <label className="stacked-field">
              <span>Preview status</span>
              <select
                value={member.status}
                onChange={(event) =>
                  onUpdate(
                    { status: event.target.value as MemberStatus },
                    `Availability changed to ${event.target.value}.`,
                  )
                }
              >
                <option value="active">Available</option>
                <option value="away">Away</option>
                <option value="draft">Invite draft · no access</option>
              </select>
            </label>
          </aside>
        </div>
        <footer className="workflow-dialog-actions">
          <span>
            Pressure is a coordination aid, never an individual performance
            score.
          </span>
          <div>
            <button className="secondary-button" onClick={onClose}>
              Done
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function InviteMemberDialog({
  onClose,
  onInvite,
  projects,
  teams,
}: {
  onClose: () => void;
  onInvite: (member: TeamMember, teamIds: string[]) => void;
  projects: typeof demoWorkspaces;
  teams: WorkspaceTeam[];
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<MemberRole>("Member");
  const [workspaceIds, setWorkspaceIds] = useState<string[]>(
    projects[0] ? [projects[0].id] : [],
  );
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !name.trim()) return;
    onInvite(
      {
        userId: `user-${Date.now()}`,
        userName: name.trim(),
        email: email.trim(),
        role,
        status: "draft",
        location: "Not provided",
        weeklyCapacity: 40,
        focusNote: "Invitation draft only. No email or access was created.",
        urgentHighActive: 0,
        dueThisWeek: 0,
        blockedResponsibilities: 0,
        criticalWorkspaceResponsibilities: 0,
        milestonesOwned: 0,
        workspaceIds,
        pressure: "normal",
      },
      teamIds,
    );
  };
  const toggleWorkspace = (id: string) =>
    setWorkspaceIds((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : [...current, id],
    );
  const toggleTeam = (id: string) =>
    setTeamIds((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : [...current, id],
    );
  return (
    <div
      className="workflow-dialog-layer"
      role="presentation"
      onMouseDown={onClose}
    >
      <form
        className="workflow-dialog compact-workflow-dialog"
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-member-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className="dialog-title-icon">
            <UserPlus size={18} />
          </span>
          <div>
            <p>Workspace teams</p>
            <h2 id="invite-member-title">Prepare a sample invitation</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close invitation"
          >
            <X size={18} />
          </button>
        </header>
        <div className="workflow-dialog-body form-stack">
          <CapabilityNotice capability="invitations" />
          <div className="form-grid-two">
            <label className="stacked-field">
              <span>Name</span>
              <input
                autoFocus
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Full name"
              />
            </label>
            <label className="stacked-field">
              <span>Fictional email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@company.com"
              />
            </label>
          </div>
          <label className="stacked-field">
            <span>Workspace role</span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as MemberRole)}
            >
              <option>Admin</option>
              <option>Member</option>
              <option>Guest</option>
            </select>
            <small className="field-help">
              This previews a future role. No permission or account is created.
            </small>
          </label>
          <fieldset className="invite-workspace-access">
            <legend>Initial Workspace access preview</legend>
            {projects.slice(0, 6).map((workspace) => (
              <label key={workspace.id}>
                <input
                  type="checkbox"
                  checked={workspaceIds.includes(workspace.id)}
                  onChange={() => toggleWorkspace(workspace.id)}
                />
                <span>
                  {workspace.icon} {workspace.name}
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset className="invite-workspace-access">
            <legend>Assign to teams</legend>
            {teams.map((team) => (
              <label key={team.id}>
                <input
                  type="checkbox"
                  checked={teamIds.includes(team.id)}
                  onChange={() => toggleTeam(team.id)}
                />
                <span>{team.name}</span>
              </label>
            ))}
          </fieldset>
        </div>
        <footer className="workflow-dialog-actions">
          <span>No email is sent and no access is granted.</span>
          <div>
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={!name.trim() || !email.trim()}
            >
              <UserPlus size={14} /> Prepare invitation draft
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function CreateTeamDialog({
  workspaceId,
  members,
  onClose,
  onCreate,
}: {
  workspaceId: string;
  members: TeamMember[];
  onClose: () => void;
  onCreate: (team: WorkspaceTeam) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [leadMemberId, setLeadMemberId] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [capabilities, setCapabilities] = useState<TeamCapabilityId[]>([
    "work",
    "messages",
  ]);

  const toggleMember = (memberId: string) => {
    setMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((candidate) => candidate !== memberId)
        : [...current, memberId],
    );
  };
  const toggleCapability = (capability: TeamCapabilityId) => {
    setCapabilities((current) =>
      current.includes(capability)
        ? current.filter((candidate) => candidate !== capability)
        : [...current, capability],
    );
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const assignedMemberIds = leadMemberId
      ? [...new Set([...memberIds, leadMemberId])]
      : memberIds;
    onCreate({
      id: `${workspaceId}-${name
        .trim()
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
      workspaceId,
      name: name.trim(),
      description:
        description.trim() ||
        "A focused team working together in this workspace.",
      leadMemberId: leadMemberId || null,
      memberIds: assignedMemberIds,
      capabilities,
      accent: "green",
    });
  };

  return (
    <div
      className="workflow-dialog-layer"
      role="presentation"
      onMouseDown={onClose}
    >
      <form
        className="workflow-dialog team-editor-dialog"
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-team-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className="dialog-title-icon">
            <Layers3 size={18} />
          </span>
          <div>
            <p>Workspace structure</p>
            <h2 id="create-team-title">Add a team</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close team creator"
          >
            <X size={18} />
          </button>
        </header>
        <div className="workflow-dialog-body team-editor-body">
          <section className="form-stack">
            <label className="stacked-field">
              <span>Team name</span>
              <input
                autoFocus
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Operations"
              />
            </label>
            <label className="stacked-field">
              <span>Purpose</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What this team owns and coordinates"
              />
            </label>
            <label className="stacked-field">
              <span>Team lead</span>
              <select
                value={leadMemberId}
                onChange={(event) => setLeadMemberId(event.target.value)}
              >
                <option value="">No lead yet</option>
                {members.map((member) => (
                  <option value={member.userId} key={member.userId}>
                    {member.userName}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="team-member-picker">
              <legend>Assign people</legend>
              {members.map((member) => (
                <label key={member.userId}>
                  <input
                    type="checkbox"
                    checked={
                      memberIds.includes(member.userId) ||
                      leadMemberId === member.userId
                    }
                    disabled={leadMemberId === member.userId}
                    onChange={() => toggleMember(member.userId)}
                  />
                  <span className="avatar">{initialsFor(member.userName)}</span>
                  <span>
                    <b>{member.userName}</b>
                    <small>{member.role}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          </section>
          <fieldset className="team-capability-options">
            <legend>Feature inheritance preview</legend>
            <p>
              This browser-local demo associates selected features with
              fictional people; it grants no real permission.
            </p>
            {teamCapabilityCatalog.map((capability) => (
              <label key={capability.id}>
                <input
                  type="checkbox"
                  checked={capabilities.includes(capability.id)}
                  onChange={() => toggleCapability(capability.id)}
                />
                <span>
                  <b>{capability.label}</b>
                  <small>{capability.description}</small>
                </span>
              </label>
            ))}
          </fieldset>
        </div>
        <footer className="workflow-dialog-actions">
          <span>
            {memberIds.length +
              (leadMemberId && !memberIds.includes(leadMemberId) ? 1 : 0)}{" "}
            people · {capabilities.length} features
          </span>
          <div>
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={!name.trim()}
            >
              <Plus size={14} /> Add sample team
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function TeamDetailDialog({
  team,
  members,
  onClose,
  onUpdate,
  onMembershipChange,
}: {
  team: WorkspaceTeam;
  members: TeamMember[];
  onClose: () => void;
  onUpdate: (update: Partial<WorkspaceTeam>, message: string) => void;
  onMembershipChange: (memberId: string, assigned: boolean) => void;
}) {
  const assignedMembers = members.filter((member) =>
    team.memberIds.includes(member.userId),
  );
  const toggleCapability = (capability: TeamCapabilityId) => {
    const capabilities = team.capabilities.includes(capability)
      ? team.capabilities.filter((candidate) => candidate !== capability)
      : [...team.capabilities, capability];
    onUpdate({ capabilities }, `${team.name} features were updated.`);
  };

  return (
    <div
      className="workflow-dialog-layer"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="workflow-dialog team-editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className="dialog-title-icon">
            <Blocks size={18} />
          </span>
          <div>
            <p>
              {assignedMembers.length}{" "}
              {assignedMembers.length === 1 ? "member" : "members"} ·{" "}
              {team.capabilities.length} features
            </p>
            <h2 id="team-detail-title">Manage {team.name}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close team settings"
          >
            <X size={18} />
          </button>
        </header>
        <div className="workflow-dialog-body team-editor-body">
          <section className="form-stack">
            <label className="stacked-field">
              <span>Team name</span>
              <input
                value={team.name}
                onChange={(event) => onUpdate({ name: event.target.value }, "")}
              />
            </label>
            <label className="stacked-field">
              <span>Purpose</span>
              <textarea
                value={team.description}
                onChange={(event) =>
                  onUpdate({ description: event.target.value }, "")
                }
              />
            </label>
            <label className="stacked-field">
              <span>Team lead</span>
              <select
                value={team.leadMemberId ?? ""}
                onChange={(event) =>
                  onUpdate(
                    { leadMemberId: event.target.value || null },
                    `${team.name} lead was updated.`,
                  )
                }
              >
                <option value="">No lead assigned</option>
                {assignedMembers.map((member) => (
                  <option value={member.userId} key={member.userId}>
                    {member.userName}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="team-member-picker">
              <legend>People in this team</legend>
              {members.map((member) => (
                <label key={member.userId}>
                  <input
                    type="checkbox"
                    checked={team.memberIds.includes(member.userId)}
                    onChange={(event) =>
                      onMembershipChange(member.userId, event.target.checked)
                    }
                  />
                  <span className="avatar">{initialsFor(member.userName)}</span>
                  <span>
                    <b>{member.userName}</b>
                    <small>{member.role}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          </section>
          <fieldset className="team-capability-options">
            <legend>Feature inheritance preview</legend>
            <p>
              The preview associates these features with fictional people in{" "}
              {team.name}; it does not grant real access.
            </p>
            {teamCapabilityCatalog.map((capability) => (
              <label key={capability.id}>
                <input
                  type="checkbox"
                  checked={team.capabilities.includes(capability.id)}
                  onChange={() => toggleCapability(capability.id)}
                />
                <span>
                  <b>{capability.label}</b>
                  <small>{capability.description}</small>
                </span>
              </label>
            ))}
          </fieldset>
        </div>
        <footer className="workflow-dialog-actions">
          <span>
            Membership changes update this browser-local preview only.
          </span>
          <div>
            <button className="primary-button" onClick={onClose}>
              Done
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function RebalanceDialog({
  member,
  members,
  items,
  onClose,
  onMove,
}: {
  member: TeamMember;
  members: TeamMember[];
  items: typeof demoItems;
  onClose: () => void;
  onMove: (targetName: string) => void;
}) {
  const owned = items.filter(
    (item) => item.assignee === member.userName && item.status !== "done",
  );
  const [itemId, setItemId] = useState(owned[0]?.id ?? "");
  const [targetName, setTargetName] = useState(
    members.find((candidate) => candidate.pressure === "normal")?.userName ??
      members[0]?.userName ??
      "",
  );
  return (
    <div
      className="workflow-dialog-layer"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="workflow-dialog compact-workflow-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rebalance-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className="dialog-title-icon">
            <ArrowRightLeft size={18} />
          </span>
          <div>
            <p>Workload coordination</p>
            <h2 id="rebalance-title">Rebalance work</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close rebalancing"
          >
            <X size={18} />
          </button>
        </header>
        <div className="workflow-dialog-body form-stack">
          <p className="dialog-intro">
            Move one responsibility from <b>{member.userName}</b>. Confirm
            availability with both people after recording the change.
          </p>
          <label className="stacked-field">
            <span>Work item</span>
            <select
              value={itemId}
              onChange={(event) => setItemId(event.target.value)}
            >
              {owned.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label className="stacked-field">
            <span>New owner</span>
            <select
              value={targetName}
              onChange={(event) => setTargetName(event.target.value)}
            >
              {members.map((candidate) => (
                <option key={candidate.userId} value={candidate.userName}>
                  {candidate.userName} · {candidate.pressure}
                </option>
              ))}
            </select>
          </label>
          <div className="rebalance-preview">
            <span className="avatar">{initialsFor(member.userName)}</span>
            <ArrowRight size={16} />
            <span className="avatar">{initialsFor(targetName)}</span>
            <div>
              <strong>
                {owned.find((item) => item.id === itemId)?.title ??
                  "No owned work available"}
              </strong>
              <small>
                Ownership changes; history and comments stay attached.
              </small>
            </div>
          </div>
        </div>
        <footer className="workflow-dialog-actions">
          <span>This demo records the reassignment locally.</span>
          <div>
            <button className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="primary-button"
              disabled={!itemId || !targetName}
              onClick={() => onMove(targetName)}
            >
              <ArrowRightLeft size={14} /> Reassign item
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function initialsFor(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
