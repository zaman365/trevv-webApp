"use client";

import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lightbulb, MessageCircleMore, Plus, Users, X } from "lucide-react";
import { AppLink as Link } from "@/components/navigation-link";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords } from "@/lib/live-app-data";
import {
  useAccessibleDialog,
  useLiveConversations,
  useLiveTeamDirectory,
} from "@/lib/live-collaboration";
import {
  emptyPeopleChoice,
  usePlanningSharing,
  type PeopleChoice,
  type SharedResource,
} from "@/lib/planning-sharing";
import { workspaceResourceKeys } from "@/lib/workspace-resource-keys";
import { isLiveAccessLoss, presentLiveError } from "@/lib/live-errors";
import { workspaceHref } from "@/lib/workspace-routes";
import { PlanningPeopleFields } from "./planning-people-fields";
import { LiveStateNotice } from "./live-state";
import styles from "./planning-sharing.module.css";
import formStyles from "./live-operating-loop.module.css";

const PlanEditor = lazy(() =>
  import("./live-project-planning").then((m) => ({ default: m.PlanEditor })),
);
const IdeaEditor = lazy(() =>
  import("./live-quick-capture").then((m) => ({
    default: m.LiveQuickCaptureDialog,
  })),
);

type ResourceCard = SharedResource & {
  teamId?: string | undefined;
  href: string;
  state: string;
  updatedAt: string;
  mine: boolean;
};

export function SharedPlanningHub({
  workspaceId,
  workspaceSlug,
  teamId,
  compact = false,
  personal = false,
}: {
  workspaceId: string;
  workspaceSlug: string;
  teamId?: string;
  compact?: boolean;
  personal?: boolean;
}) {
  const session = useAppSession();
  const data = useLiveAppRecords();
  const cache = useQueryClient();
  const rooms = useLiveConversations(workspaceId);
  const directory = useLiveTeamDirectory(workspaceId);
  const boardsKey = workspaceResourceKeys.boards(
    session.organization.id,
    workspaceId,
  );
  const boards = useQuery({
    queryKey: boardsKey,
    queryFn: ({ signal }) => data.client.withSignal(signal).boards(workspaceId),
    staleTime: 30_000,
  });
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [create, setCreate] = useState<"plan" | "idea" | null>(null);
  const [sharing, setSharing] = useState<ResourceCard | null>(null);
  const canWrite = !["viewer", "guest"].includes(session.organization.role);
  const accessLost =
    isLiveAccessLoss(boards.error) || isLiveAccessLoss(rooms.error);
  const discussions = accessLost
    ? []
    : (rooms.data ?? []).filter((room) => room.context);
  const cards = useMemo(() => {
    if (accessLost) return [];
    const plans = boards.data ?? [];
    const base = workspaceHref(workspaceSlug);
    const records: ResourceCard[] = [
      ...plans.map((plan) => ({
        entityType: "board" as const,
        entityId: plan.id,
        title: plan.name,
        description: plan.description,
        workspaceId,
        teamId: plan.planning?.teamId,
        href: `${base}/boards/${encodeURIComponent(plan.id)}`,
        state: plan.planning?.state ?? "planned",
        updatedAt: plan.updatedAt,
        mine: false,
      })),
      ...data.items
        .filter(
          (item) => item.workspaceId === workspaceId && item.type === "idea",
        )
        .map((item) => ({
          entityType: "work_item" as const,
          entityId: item.id,
          title: item.title,
          description: item.description,
          workspaceId,
          teamId:
            item.planning?.teamId ??
            plans.find((plan) => plan.id === item.boardId)?.planning?.teamId,
          href: `${base}/boards/${encodeURIComponent(item.boardId)}#${encodeURIComponent(item.id)}`,
          state: item.status.replaceAll("_", " "),
          updatedAt: item.updatedAt,
          mine: item.assignees.some((person) => person.id === session.user.id),
        })),
    ];
    return records
      .filter(
        (record) =>
          (!teamId || record.teamId === teamId) &&
          (!personal ||
            record.mine ||
            (rooms.data ?? []).some(
              (room) =>
                room.context?.entityId === record.entityId &&
                room.context.entityType === record.entityType &&
                room.participants.some(
                  (person) => person.user.id === session.user.id,
                ),
            )) &&
          (kind === "all" ||
            (kind === "plans"
              ? record.entityType === "board"
              : record.entityType === "work_item")) &&
          `${record.title} ${record.description}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [
    accessLost,
    boards.data,
    data.items,
    workspaceId,
    workspaceSlug,
    teamId,
    personal,
    rooms.data,
    session.user.id,
    kind,
    search,
  ]);
  const visible = compact ? cards.slice(0, 4) : cards;
  return (
    <section
      className={styles.hub}
      aria-label={personal ? "Plans and ideas involving me" : "Plans and ideas"}
    >
      <header>
        <div>
          <h2>
            <Lightbulb size={19} aria-hidden="true" />{" "}
            {personal ? "Plans and ideas involving me" : "Plans and ideas"}
          </h2>
          <p>
            {personal
              ? `${data.workspaces.find((entry) => entry.id === workspaceId)?.name ?? "Workspace"} · Your ideas and the discussions you have been included in.`
              : "Explore upcoming work, invite input and keep the conversation connected."}
          </p>
        </div>
        <div className={styles.actions}>
          {canWrite ? (
            <>
              <button type="button" onClick={() => setCreate("idea")}>
                <Plus size={14} /> New idea
              </button>
              <button type="button" onClick={() => setCreate("plan")}>
                <Plus size={14} /> New plan
              </button>
            </>
          ) : null}
          {compact ? (
            <Link href={workspaceHref(workspaceSlug, "ideas")}>View all</Link>
          ) : null}
        </div>
      </header>
      {!compact ? (
        <div className={styles.filters}>
          <input
            aria-label="Search plans and ideas"
            placeholder="Search plans and ideas"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            aria-label="Show plans or ideas"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="all">Plans and ideas</option>
            <option value="ideas">Ideas</option>
            <option value="plans">Plans</option>
          </select>
        </div>
      ) : null}
      {boards.error || rooms.error ? (
        <LiveStateNotice
          {...presentLiveError(boards.error ?? rooms.error)}
          actions={
            <button
              type="button"
              onClick={() => {
                void boards.refetch();
                void rooms.refetch();
              }}
            >
              Refresh plans and discussions
            </button>
          }
        />
      ) : null}
      {boards.isPending || rooms.isPending ? (
        <p role="status">Loading plans and discussions…</p>
      ) : null}
      {!accessLost ? (
        <div className={styles.grid}>
          {visible.map((record) => {
            const related = discussions.filter(
              (room) =>
                room.context?.entityId === record.entityId &&
                room.context.entityType === record.entityType,
            );
            return (
              <article
                key={`${record.entityType}:${record.entityId}`}
                className={styles.card}
              >
                <header>
                  <span className={styles.badge}>
                    {record.entityType === "board" ? "Plan" : "Idea"} ·{" "}
                    {record.state}
                  </span>
                  {record.teamId ? (
                    <small>
                      {
                        directory.data?.teams.find(
                          (entry) => entry.id === record.teamId,
                        )?.name
                      }
                    </small>
                  ) : null}
                </header>
                <h3>{record.title}</h3>
                <p>
                  {record.description.length > 220
                    ? `${record.description.slice(0, 220)}…`
                    : record.description ||
                      "Add context and invite people to shape the next steps."}
                </p>
                {related.map((room) => (
                  <div key={room.id}>
                    <Link
                      href={`${workspaceHref(workspaceSlug, "messages")}#${encodeURIComponent(room.id)}`}
                    >
                      <MessageCircleMore size={14} />{" "}
                      {related.length > 1 ? room.title : "Open discussion"}
                      {room.unreadCount ? ` · ${room.unreadCount} unread` : ""}
                    </Link>
                    <p>
                      {room.participants
                        .map((person) =>
                          person.user.id === session.user.id
                            ? "You"
                            : person.user.name,
                        )
                        .join(", ")}
                    </p>
                  </div>
                ))}
                {!related.length ? <p>No shared discussion yet.</p> : null}
                <div className={styles.actions}>
                  <Link href={record.href}>
                    Open {record.entityType === "board" ? "plan" : "idea"}
                  </Link>
                  {canWrite ? (
                    <button type="button" onClick={() => setSharing(record)}>
                      <Users size={14} />{" "}
                      {related.length ? "New discussion" : "Include people"}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
      {!boards.isPending &&
      !rooms.isPending &&
      !accessLost &&
      !visible.length ? (
        <p>
          {search
            ? "No plans or ideas match your search."
            : "Start a plan or capture an idea. Include people when you want their input."}
        </p>
      ) : null}
      {!data.recordsComplete ? (
        <p>
          Showing loaded ideas. More may appear as workspace records finish
          loading.
        </p>
      ) : null}
      <Suspense fallback={<p role="status">Opening editor…</p>}>
        {create === "plan" ? (
          <PlanEditor
            workspaceId={workspaceId}
            boards={boards.data ?? []}
            teams={directory.data?.teams ?? []}
            initialTeamId={teamId ?? ""}
            onClose={() => setCreate(null)}
            onSaved={() => {
              setCreate(null);
              void cache.invalidateQueries({ queryKey: boardsKey });
              void data.refresh();
            }}
          />
        ) : null}
        {create === "idea" ? (
          <IdeaEditor
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            defaultType="idea"
            {...(teamId ? { defaultTeamId: teamId } : {})}
            defaultAssigneeId={session.user.id}
            draftScope={`planning-idea:${workspaceId}:${teamId ?? "all"}`}
            onClose={() => setCreate(null)}
            onConfirmed={() => setCreate(null)}
          />
        ) : null}
      </Suspense>
      {sharing ? (
        <ShareExisting resource={sharing} onClose={() => setSharing(null)} />
      ) : null}
    </section>
  );
}

function ShareExisting({
  resource,
  onClose,
}: {
  resource: ResourceCard;
  onClose: () => void;
}) {
  const share = usePlanningSharing();
  const [people, setPeople] = useState<PeopleChoice>({
    ...emptyPeopleChoice,
    enabled: true,
  });
  const [teamId, setTeamId] = useState(resource.teamId ?? "");
  const ref = useAccessibleDialog<HTMLFormElement>(onClose);
  return (
    <div className={`dialog-layer ${formStyles.dialogLayer}`}>
      <form
        className={`capture-dialog ${formStyles.captureDialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-planning-title"
        ref={ref}
        onSubmit={(event) => {
          event.preventDefault();
          if (!people.enabled || !people.participantIds.length) return;
          share(resource, people);
          onClose();
        }}
      >
        <header>
          <div>
            <h2 id="share-planning-title">Include people</h2>
            <p>{resource.title}</p>
          </div>
          <button type="button" aria-label="Close sharing" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className={formStyles.formBody}>
          <PlanningPeopleFields
            workspaceId={resource.workspaceId}
            teamId={teamId}
            onTeamChange={(id) => {
              setTeamId(id);
              setPeople((current) => ({ ...current, participantIds: [] }));
            }}
            value={people}
            onChange={setPeople}
          />
        </div>
        <footer>
          <span>
            A new private discussion will include you and the selected people.
          </span>
          <button
            type="submit"
            className="primary-button"
            disabled={!people.enabled || !people.participantIds.length}
          >
            Share and start discussion
          </button>
        </footer>
      </form>
    </div>
  );
}
