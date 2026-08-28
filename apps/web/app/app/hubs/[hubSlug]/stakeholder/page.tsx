import { permanentRedirect } from "next/navigation";

export default async function StakeholderPage({
  params,
}: {
  params: Promise<{ hubSlug: string }>;
}) {
  const { hubSlug } = await params;
  permanentRedirect(
    `/app/workspaces/${encodeURIComponent(hubSlug)}/stakeholder`,
  );
}
