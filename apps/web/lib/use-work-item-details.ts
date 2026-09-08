"use client";
import type { TrevvApiClient } from "@founderhq/api-client";
import { useQuery } from "@tanstack/react-query";
import { workspaceResourceKeys } from "./workspace-resource-keys";

export function useWorkItemDetails(
  client: TrevvApiClient,
  organizationId: string,
  workspaceId: string | undefined,
  itemId: string | null,
) {
  return useQuery({
    queryKey: workspaceResourceKeys.itemDetails(
      organizationId,
      workspaceId ?? "",
      itemId ?? "",
    ),
    queryFn: async ({ signal }) => {
      const scopedClient = client.withSignal(signal);
      const [history, evidence] = await Promise.all([
        scopedClient.itemHistory(itemId!),
        scopedClient.itemEvidence(itemId!),
      ]);
      return { history, evidence };
    },
    enabled: Boolean(workspaceId && itemId),
    staleTime: 15_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
}
