import { requireSuperadminSession } from "@/lib/server-superadmin";
import { SuperadminConsole } from "@/components/superadmin-console";
import { SuperadminShell } from "@/components/superadmin-shell";
export default async function Page() {
  const session = await requireSuperadminSession();
  return (
    <SuperadminShell session={session} section="overview">
      <SuperadminConsole session={session} section="overview" />
    </SuperadminShell>
  );
}
