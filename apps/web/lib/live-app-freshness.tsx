"use client";

import { createContext, useContext } from "react";

// Kept separate from the API/query runtime so sync labels and shared status
// notices do not pull the entire application data client into public routes.
export const LiveAppFreshnessContext = createContext<string | null>(null);

export function useLiveAppRefreshedAt(): string | null {
  return useContext(LiveAppFreshnessContext);
}
