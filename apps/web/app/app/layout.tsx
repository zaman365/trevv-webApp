import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AppShellProviders } from "@/components/app-shell-providers";
import {
  parseWorkspaceSelection,
  workspaceSelectionCookie,
} from "@/lib/workspace-selection";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Read on the server so the shell renders the member's workspace on the
  // first paint instead of correcting itself after hydration.
  const store = await cookies();
  const storedSelection = parseWorkspaceSelection(
    store.get(workspaceSelectionCookie)?.value,
  );

  return (
    <AppShellProviders {...(storedSelection ? { storedSelection } : {})}>
      {children}
    </AppShellProviders>
  );
}
