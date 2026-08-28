"use client";

import {
  ArrowRight,
  ArrowRightLeft,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Filter,
  Mail,
  MapPin,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  calculateResourcePressure,
  demoHubs,
  demoItems,
  type ResourcePressure,
} from "@founderhq/core";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { workspaceHref } from "@/lib/workspace-routes";
import { Hint } from "./learning-center";

type MemberStatus = "active" | "away" | "invited";
type MemberRole = "Owner" | "Admin" | "Member" | "Guest";

interface TeamMember extends ResourcePressure {
  email: string;
  role: MemberRole;
  status: MemberStatus;
  location: string;
  weeklyCapacity: number;
  focusNote: string;
}

const currentHubs = demoHubs.filter((hub) => !hub.id.startsWith("original-"));
const currentItems = demoItems.filter(
  (item) => !item.id.startsWith("original-"),
);
const roleCycle: MemberRole[] = ["Owner", "Admin", "Member", "Member"];

const initialMembers: TeamMember[] = calculateResourcePressure(
  currentHubs,
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

export function TeamWorkflow() {
  const { scope } = useWorkspace();
  const [members, setMembers] = useState(initialMembers);
  const [query, setQuery] = useState("");
  const [pressureFilter, setPressureFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rebalanceId, setRebalanceId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const scopedHubIds = new Set(scope.hubs.map((project) => project.id));
  const scopedMembers = members.filter((member) =>
    member.hubIds.some((hubId) => scopedHubIds.has(hubId)),
  );
  const selected = scopedMembers.find((member) => member.userId === selectedId);
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
      return (
        !normalized ||
        `${member.userName} ${member.email} ${member.role}`
          .toLocaleLowerCase()
          .includes(normalized)
      );
    });
  }, [pressureFilter, query, scopedMembers, statusFilter]);

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
  const unassigned = scope.items.filter(
    (item) => !item.assignee && item.status !== "done",
  ).length;

  return (
    <>
      <header className="trevv-page-header">
        <div>
          <p>Workspace team</p>
          <h1 className="page-title-with-hint">
            Team workspace <Hint resourceId="team-pressure" />
          </h1>
          <span>
            Coordinate access, availability, and workload signals without
            turning activity into a performance score.
          </span>
        </div>
        <button className="primary-button" onClick={() => setInviteOpen(true)}>
          <UserPlus size={16} /> Invite member
        </button>
      </header>

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
            <Users size={17} />
          </span>
          <div>
            <b>{scopedMembers.length}</b>
            <small>Total members</small>
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
        <article>
          <span>
            <BriefcaseBusiness size={17} />
          </span>
          <div>
            <b>{unassigned}</b>
            <small>Unassigned work</small>
          </div>
        </article>
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
            <option value="invited">Invited</option>
          </select>
        </label>
      </div>

      <section className="trevv-panel team-directory-table">
        <header>
          <span>Person</span>
          <span>Access</span>
          <span>Urgent / high</span>
          <span>Due this week</span>
          <span>Blocked</span>
          <span>Projects</span>
          <span>Pressure</span>
          <span>
            <span className="sr-only">Actions</span>
          </span>
        </header>
        {visible.map((member) => (
          <article key={member.userId}>
            <button
              className="team-person-cell"
              onClick={() => setSelectedId(member.userId)}
            >
              <span className="avatar">{initialsFor(member.userName)}</span>
              <span>
                <strong>{member.userName}</strong>
                <small>
                  {member.status === "active" ? member.location : member.status}
                </small>
              </span>
            </button>
            <span
              className={`role-badge role-${member.role.toLocaleLowerCase()}`}
            >
              {member.role}
            </span>
            <b>{member.urgentHighActive}</b>
            <b>{member.dueThisWeek}</b>
            <b>{member.blockedResponsibilities}</b>
            <b>{member.hubIds.length}</b>
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
        ))}
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
          projects={scope.hubs}
          onClose={() => setInviteOpen(false)}
          onInvite={(member) => {
            setMembers((current) => [...current, member]);
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
          projects={scope.hubs}
          {...(scope.hubs[0] ? { workspaceSlug: scope.hubs[0].slug } : {})}
          onClose={() => setSelectedId(null)}
          onUpdate={(update, message) => {
            updateMember(selected.userId, update);
            setNotice(message);
          }}
          onRebalance={() => {
            setSelectedId(null);
            setRebalanceId(selected.userId);
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
  workspaceSlug,
  onClose,
  onUpdate,
  onRebalance,
}: {
  member: TeamMember;
  projects: typeof demoHubs;
  workspaceSlug?: string;
  onClose: () => void;
  onUpdate: (update: Partial<TeamMember>, message: string) => void;
  onRebalance: () => void;
}) {
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
              {member.role} · {member.status}
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
            <h3>Profile & access</h3>
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
              <b>Workspace access</b>
              {projects.slice(0, 5).map((hub) => (
                <label key={hub.id}>
                  <input
                    type="checkbox"
                    defaultChecked={member.hubIds.includes(hub.id)}
                  />
                  <span>
                    {hub.icon} {hub.name}
                  </span>
                </label>
              ))}
            </div>
            <Link
              className="linked-work-callout"
              href={
                workspaceSlug
                  ? workspaceHref(workspaceSlug, "settings")
                  : "/app/portfolio"
              }
            >
              <ShieldCheck size={14} /> Manage organization permissions{" "}
              <ArrowRight size={13} />
            </Link>
          </section>
          <aside>
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
                <b>{member.criticalHubResponsibilities}</b>
                <small>Critical projects</small>
              </span>
            </div>
            <button className="primary-button full-width" onClick={onRebalance}>
              <ArrowRightLeft size={14} /> Rebalance one item
            </button>
            <label className="stacked-field">
              <span>Availability</span>
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
                <option value="invited">Invited</option>
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
}: {
  onClose: () => void;
  onInvite: (member: TeamMember) => void;
  projects: typeof demoHubs;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<MemberRole>("Member");
  const [hubIds, setHubIds] = useState<string[]>([]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !name.trim()) return;
    onInvite({
      userId: `user-${Date.now()}`,
      userName: name.trim(),
      email: email.trim(),
      role,
      status: "invited",
      location: "Not provided",
      weeklyCapacity: 40,
      focusNote: "Invitation pending.",
      urgentHighActive: 0,
      dueThisWeek: 0,
      blockedResponsibilities: 0,
      criticalHubResponsibilities: 0,
      milestonesOwned: 0,
      hubIds,
      pressure: "normal",
    });
  };
  const toggleHub = (id: string) =>
    setHubIds((current) =>
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
            <p>Team workspace</p>
            <h2 id="invite-member-title">Invite a member</h2>
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
              <span>Email</span>
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
              Members can create and update work in projects they can access.
            </small>
          </label>
          <fieldset className="invite-hub-access">
            <legend>Initial Workspace access</legend>
            {projects.slice(0, 6).map((hub) => (
              <label key={hub.id}>
                <input
                  type="checkbox"
                  checked={hubIds.includes(hub.id)}
                  onChange={() => toggleHub(hub.id)}
                />
                <span>
                  {hub.icon} {hub.name}
                </span>
              </label>
            ))}
          </fieldset>
        </div>
        <footer className="workflow-dialog-actions">
          <span>You can change role and access later.</span>
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
              <UserPlus size={14} /> Create invitation
            </button>
          </div>
        </footer>
      </form>
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
