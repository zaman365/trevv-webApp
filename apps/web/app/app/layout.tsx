import { cookies } from "next/headers";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShellProviders } from "@/components/app-shell-providers";
import {
  parseWorkspaceSelection,
  workspaceSelectionCookie,
} from "@/lib/workspace-selection";
import { requireAppSession } from "@/lib/server-auth";
import { webRuntimeMode } from "@/lib/web-runtime-config";

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true },
};

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Read on the server so the shell renders the member's workspace on the
  // first paint instead of correcting itself after hydration.
  const [store, session] = await Promise.all([cookies(), requireAppSession()]);
  const storedSelection = parseWorkspaceSelection(
    store.get(workspaceSelectionCookie)?.value,
  );

  return (
    <AppShellProviders
      session={{
        demo: webRuntimeMode() === "demo",
        organization: {
          id: session.organization.id,
          name: session.organization.name,
          role: session.organization.role,
        },
        availableOrganizations: session.availableOrganizations.map(
          (organization) => ({
            id: organization.id,
            name: organization.name,
            role: organization.role,
            slug: organization.slug,
          }),
        ),
        user: {
          email: session.user.email,
          name: session.user.name,
          role: session.user.role,
        },
      }}
      {...(storedSelection ? { storedSelection } : {})}
    >
      {children}
    </AppShellProviders>
  );
}
