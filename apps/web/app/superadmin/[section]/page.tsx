import { notFound } from "next/navigation";
import { superadminDirectoryKindSchema } from "@founderhq/api-contract";
import { requireSuperadminSession } from "@/lib/server-superadmin";
import { SuperadminConsole } from "@/components/superadmin-console";
import { SuperadminShell } from "@/components/superadmin-shell";
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const parsed = superadminDirectoryKindSchema.safeParse(
    (await params).section,
  );
  if (!parsed.success) notFound();
  const session = await requireSuperadminSession();
  if (parsed.data === "administrators" && session.role !== "owner") notFound();
  return (
    <SuperadminShell session={session} section={parsed.data}>
      <SuperadminConsole session={session} section={parsed.data} />
    </SuperadminShell>
  );
}
