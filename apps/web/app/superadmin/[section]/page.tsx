import { notFound } from "next/navigation";
import {
  superadminDirectoryKindSchema,
  superadminDirectoryFilters,
} from "@founderhq/api-contract/superadmin";
import { requireSuperadminSession } from "@/lib/server-superadmin";
import { SuperadminConsole } from "@/components/superadmin-console";
import { SuperadminShell } from "@/components/superadmin-shell";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parsed = superadminDirectoryKindSchema.safeParse(
    (await params).section,
  );
  if (!parsed.success) notFound();
  const search = await searchParams;
  const filter =
    typeof search.filter === "string" &&
    (superadminDirectoryFilters[parsed.data] as readonly string[]).includes(
      search.filter,
    )
      ? search.filter
      : "all";
  const query = typeof search.q === "string" ? search.q.slice(0, 100) : "";
  const organizationId =
    (parsed.data === "people" || parsed.data === "invitations") &&
    typeof search.organizationId === "string" &&
    search.organizationId.length <= 128
      ? search.organizationId
      : undefined;
  const session = await requireSuperadminSession();
  if (parsed.data === "administrators" && session.role !== "owner") notFound();
  return (
    <SuperadminShell session={session} section={parsed.data}>
      <SuperadminConsole
        key={JSON.stringify([parsed.data, filter, query, organizationId])}
        session={session}
        section={parsed.data}
        initialFilter={filter}
        initialQuery={query}
        organizationId={organizationId}
      />
    </SuperadminShell>
  );
}
