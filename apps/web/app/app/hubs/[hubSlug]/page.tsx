import { permanentRedirect } from "next/navigation";
export default async function HubPage({
  params,
}: {
  params: Promise<{ hubSlug: string }>;
}) {
  const { hubSlug } = await params;
  permanentRedirect(`/app/workspaces/${encodeURIComponent(hubSlug)}`);
}
