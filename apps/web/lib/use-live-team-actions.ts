"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { TeamDto, TeamDirectoryDto } from "@founderhq/api-contract";
import { useLiveAppRecords } from "./live-app-data";
import { collaborationKeys } from "./live-collaboration";

export function useLiveTeamActions(workspaceId: string | undefined) {
  const queryClient = useQueryClient();
  const liveData = useLiveAppRecords();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [savedMessage, setSavedMessage] = useState("");
  async function refreshCollaboration() {
    if (!workspaceId) return;
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.teams(workspaceId),
      }),
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.conversations(workspaceId),
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
      await queryClient.cancelQueries({
        queryKey: collaborationKeys.teams(result.data.workspaceId),
      });
      queryClient.setQueryData<TeamDirectoryDto>(
        collaborationKeys.teams(result.data.workspaceId),
        (current) =>
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
      void refreshCollaboration();
      return result.data;
    } catch (reason) {
      setError(reason);
      return null;
    } finally {
      setPending(false);
    }
  }

  return {
    client: liveData.client,
    pending,
    error,
    savedMessage,
    setError,
    setSavedMessage,
    refreshCollaboration,
    runTeamMutation,
  };
}
