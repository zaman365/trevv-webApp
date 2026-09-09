import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Superadmin",
  description: "Private TREVV platform administration.",
  robots: { index: false, follow: false, noarchive: true, nocache: true },
  referrer: "same-origin",
  alternates: { canonical: "/superadmin" },
};
export const dynamic = "force-dynamic";
export default function SuperadminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
