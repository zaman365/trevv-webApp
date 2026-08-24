import { HubOverview } from "@/components/hub-overview";
export default async function HubPage({
  params,
}: {
  params: Promise<{ hubSlug: string }>;
}) {
  const { hubSlug } = await params;
  return <HubOverview slug={hubSlug} />;
}
