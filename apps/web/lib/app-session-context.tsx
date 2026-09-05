"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface AppSessionView {
  demo: boolean;
  platformRole?: "owner";
  organization: {
    id: string;
    name: string;
    role: string;
    timezone?: string;
  };
  availableOrganizations: Array<{
    id: string;
    name: string;
    role: string;
    slug: string;
  }>;
  managedWorkspaceIds: readonly string[];
  user: { id: string; email: string; name: string; role: string };
}

const AppSessionContext = createContext<AppSessionView | null>(null);

export function AppSessionProvider({
  children,
  session,
}: {
  children: ReactNode;
  session: AppSessionView;
}) {
  return (
    <AppSessionContext.Provider value={session}>
      {children}
    </AppSessionContext.Provider>
  );
}

export function useAppSession(): AppSessionView {
  const session = useOptionalAppSession();
  if (!session) throw new Error("App session provider is missing.");
  return session;
}

export function useOptionalAppSession() {
  return useContext(AppSessionContext);
}
