import { cookies } from "next/headers";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShellProviders } from "@/components/app-shell-providers";
import {
  parseWorkspaceSelection,
  workspaceSelectionCookie,
} from "@/lib/workspace-selection";
import { requireAppSession } from "@/lib/server-auth";
import { loadLiveAppData } from "@/lib/server-live-data";
import { webRuntimeMode } from "@/lib/web-runtime-config";

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true },
};

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Read on the server so the shell renders the member's workspace on the
  // first paint instead of correcting itself after hydration.
  const mode = webRuntimeMode();
  const [store, session] = await Promise.all([cookies(), requireAppSession()]);
  // Resolve identity and onboarding first so an anonymous request redirects
  // cleanly instead of racing a protected data request into the error boundary.
  const liveData = mode === "live" ? await loadLiveAppData() : undefined;
  const storedSelection = parseWorkspaceSelection(
    store.get(workspaceSelectionCookie)?.value,
  );

  return (
    <AppShellProviders
      session={{
        demo: mode === "demo",
        organization: {
          id: session.organization.id,
          name: session.organization.name,
          role: session.organization.role,
          ...("timezone" in session.organization &&
          session.organization.timezone
            ? { timezone: session.organization.timezone }
            : {}),
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
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          role: session.user.role,
        },
      }}
      {...(storedSelection ? { storedSelection } : {})}
      {...(liveData ? { liveData } : {})}
    >
      {children}
    </AppShellProviders>
  );
}
