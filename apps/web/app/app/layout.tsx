import { cookies, headers } from "next/headers";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShellProviders } from "@/components/app-shell-providers";
import {
  parseWorkspaceSelection,
  workspaceSelectionCookie,
} from "@/lib/workspace-selection";
import { requireAppSession } from "@/lib/server-auth";
import { loadLiveAppData } from "@/lib/server-live-data";
import { clientNavigationHeader } from "@/lib/navigation-request";
import { webRuntimeMode } from "@/lib/web-runtime-config";
import {
  parseThemePreference,
  themePreferenceCookie,
} from "@/lib/display-preferences";

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true },
};

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Read on the server so the shell renders the member's workspace on the
  // first paint instead of correcting itself after hydration.
  const mode = webRuntimeMode();
  const [store, session, requestHeaders] = await Promise.all([
    cookies(),
    requireAppSession(),
    headers(),
  ]);
  // Resolve identity and onboarding first so an anonymous request redirects
  // cleanly instead of racing a protected data request into the error boundary.
  // RSC navigation reuses the mounted query provider. Vinext still executes
  // dynamic layouts for these requests, so reloading every item here made each
  // page switch wait for a redundant organization-wide snapshot. This header
  // only controls the initial seed: session and leaf authorization always run,
  // and a newly mounted provider without a seed fetches its own authorized data.
  const liveData =
    mode === "live" && requestHeaders.get(clientNavigationHeader) !== "1"
      ? await loadLiveAppData()
      : undefined;
  const storedSelection = parseWorkspaceSelection(
    store.get(workspaceSelectionCookie)?.value,
  );
  const initialTheme = parseThemePreference(
    store.get(themePreferenceCookie)?.value,
  );

  return (
    <AppShellProviders
      session={{
        demo: mode === "demo",
        ...(session.platformRole ? { platformRole: session.platformRole } : {}),
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
        managedWorkspaceIds: session.managedWorkspaceIds,
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          role: session.user.role,
        },
      }}
      {...(storedSelection ? { storedSelection } : {})}
      {...(initialTheme ? { initialTheme } : {})}
      {...(liveData ? { liveData } : {})}
    >
      {children}
    </AppShellProviders>
  );
}
