"use client";

import { useQuery } from "@tanstack/react-query";
import type { ConversationDto } from "@founderhq/api-contract";
import { AppLink as Link } from "@/components/navigation-link";
import { useLiveAppRecords } from "@/lib/live-app-data";
import { useAppSession } from "@/lib/app-session-context";
import { workspaceResourceKeys } from "@/lib/workspace-resource-keys";
import { workspaceHref } from "@/lib/workspace-routes";

export function PlanningContextLink({
  conversation,
  workspaceSlug,
}: {
  conversation: ConversationDto;
  workspaceSlug: string;
}) {
  const { client } = useLiveAppRecords();
  const session = useAppSession();
  const context = conversation.context;
  const item = useQuery({
    queryKey: workspaceResourceKeys.itemDetails(
      session.organization.id,
      conversation.workspaceId,
      context?.entityId ?? "",
    ),
    queryFn: ({ signal }) => client.withSignal(signal).item(context!.entityId),
    enabled: context?.entityType === "work_item",
    staleTime: 30_000,
  });
  if (!context) return null;
  if (context.entityType === "board")
    return (
      <Link
        href={`${workspaceHref(workspaceSlug)}/boards/${encodeURIComponent(context.entityId)}`}
      >
        Open linked plan
      </Link>
    );
  if (item.error) return <small>The linked idea is unavailable.</small>;
  if (!item.data || item.data.workspaceId !== conversation.workspaceId)
    return <small>Loading linked idea…</small>;
  return (
    <Link
      href={`${workspaceHref(workspaceSlug)}/boards/${encodeURIComponent(item.data.boardId)}#${encodeURIComponent(context.entityId)}`}
    >
      Open linked idea
    </Link>
  );
}
