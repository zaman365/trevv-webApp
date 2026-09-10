import { notFound } from "next/navigation";
import { requireSuperadminSession } from "@/lib/server-superadmin";
import { SuperadminOrganization } from "@/components/superadmin-organization";
import { SuperadminShell } from "@/components/superadmin-shell";
export default async function Page({
  params,
}: {
  params: Promise<{ section: string; id: string }>;
}) {
  const { section, id } = await params;
  if (section !== "organizations" || id.length > 128) notFound();
  const session = await requireSuperadminSession();
  return (
    <SuperadminShell session={session} section="organizations">
      <SuperadminOrganization key={id} id={id} session={session} />
    </SuperadminShell>
  );
}
