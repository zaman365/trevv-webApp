import { requireSuperadminSession } from "@/lib/server-superadmin";
import { SuperadminSecurity } from "@/components/superadmin-security";
import { SuperadminShell } from "@/components/superadmin-shell";
export default async function Page() {
  const session = await requireSuperadminSession(true);
  return (
    <SuperadminShell session={session} section="security">
      <SuperadminSecurity session={session} />
    </SuperadminShell>
  );
}
