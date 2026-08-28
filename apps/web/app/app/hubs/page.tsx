import { redirect } from "next/navigation";

export default async function HubsPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>;
}) {
  const { create } = await searchParams;
  redirect(create ? "/app/workspaces?create=workspace" : "/app/workspaces");
}
