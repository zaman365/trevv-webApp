"use client";
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { BoardDto } from "@founderhq/api-contract";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords } from "@/lib/live-app-data";
import { workspaceResourceKeys } from "@/lib/workspace-resource-keys";
import {
  emptyPeopleChoice,
  usePlanningSharing,
  type PeopleChoice,
} from "@/lib/planning-sharing";
import { LiveDashboardPlanDialog } from "./live-dashboard-plan-dialog";

/** Loaded after the first New plan click; stays mounted to preserve dismissed drafts. */
export function LiveDashboardPlanCreator({
  open,
  workspaceId,
  workspaceName,
  onCreated,
  onClose,
}: {
  open: boolean;
  workspaceId: string;
  workspaceName: string;
  onCreated(board: BoardDto): void;
  onClose(): void;
}) {
  const session = useAppSession();
  const liveData = useLiveAppRecords();
  const queryClient = useQueryClient();
  const boardsKey = workspaceResourceKeys.boards(
    session.organization.id,
    workspaceId,
  );
  const shareResource = usePlanningSharing();
  const [boardTeamId, setBoardTeamId] = useState("");
  const [people, setPeople] = useState<PeopleChoice>(emptyPeopleChoice);
  const [boardName, setBoardName] = useState("");
  const [boardDescription, setBoardDescription] = useState("");
  const [boardStartDate, setBoardStartDate] = useState("");
  const [boardEndDate, setBoardEndDate] = useState("");
  const [pending, setPending] = useState(false);
  const [mutationError, setMutationError] = useState<unknown>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  async function createBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !boardName.trim() ||
      pending ||
      (people.enabled && !people.participantIds.length)
    )
      return;
    setPending(true);
    setMutationError(null);
    try {
      const result = await liveData.client.createBoard(
        {
          workspaceId,
          name: boardName.trim(),
          ...(boardTeamId
            ? {
                planning: {
                  kind: "project",
                  state: "planned",
                  teamId: boardTeamId,
                },
              }
            : {}),
          description: boardDescription.trim(),
          visibility: "private",
          progressMode: "task_completion",
          ...(boardStartDate ? { startDate: boardStartDate } : {}),
          ...(boardEndDate ? { endDate: boardEndDate } : {}),
        },
        idempotencyKey,
      );
      queryClient.setQueryData<BoardDto[]>(boardsKey, (current) => [
        ...(current ?? []),
        result.data,
      ]);
      shareResource(
        {
          entityType: "board",
          entityId: result.data.id,
          title: result.data.name,
          description: result.data.description,
          workspaceId,
        },
        people,
        idempotencyKey,
      );
      setPeople(emptyPeopleChoice);
      setBoardTeamId("");
      onCreated(result.data);
      onClose();
      setBoardName("");
      setBoardDescription("");
      setBoardStartDate("");
      setBoardEndDate("");
      setIdempotencyKey(crypto.randomUUID());
      void liveData.refresh();
    } catch (reason) {
      setMutationError(reason);
    } finally {
      setPending(false);
    }
  }

  if (!open) return null;
  return (
    <LiveDashboardPlanDialog
      workspaceId={workspaceId}
      workspaceName={workspaceName}
      draft={{
        name: boardName,
        description: boardDescription,
        startDate: boardStartDate,
        endDate: boardEndDate,
        teamId: boardTeamId,
        people,
      }}
      onChange={(next) => {
        if (mutationError) {
          setMutationError(null);
          setIdempotencyKey(crypto.randomUUID());
        }
        if (next.name !== undefined) setBoardName(next.name);
        if (next.description !== undefined)
          setBoardDescription(next.description);
        if (next.startDate !== undefined) setBoardStartDate(next.startDate);
        if (next.endDate !== undefined) setBoardEndDate(next.endDate);
        if (next.teamId !== undefined) setBoardTeamId(next.teamId);
        if (next.people !== undefined) setPeople(next.people);
      }}
      pending={pending}
      error={mutationError}
      onSubmit={createBoard}
      onClose={onClose}
    />
  );
}
