"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface AppSessionView {
  demo: boolean;
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
  const session = useContext(AppSessionContext);
  if (!session) throw new Error("App session provider is missing.");
  return session;
}
