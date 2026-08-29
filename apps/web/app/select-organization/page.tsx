import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OrganizationSelection } from "@/components/organization-selection";
import { requireAuthenticationIdentity } from "@/lib/server-auth";
import { safeReturnPath, webRuntimeMode } from "@/lib/web-runtime-config";

export const metadata: Metadata = {
  title: "Choose organization",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function SelectOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (webRuntimeMode() === "demo") redirect("/app/portfolio");
  const { next } = await searchParams;
  const returnTo = safeReturnPath(next);
  await requireAuthenticationIdentity(
    `/select-organization?next=${encodeURIComponent(returnTo)}`,
  );
  return <OrganizationSelection returnTo={returnTo} />;
}
