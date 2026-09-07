"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAppSession } from "./app-session-context";
import { recordNavigationIntent } from "./navigation-performance";
import { preloadRouteCode } from "./route-code-preload";

/** Programmatic switches share link warming, transition feedback, and timing. */
export function useAppNavigation() {
  const router = useRouter();
  const { demo } = useAppSession();
  const [pending, startTransition] = useTransition();
  const warm = useCallback(
    (href: string) => {
      void preloadRouteCode(href, demo ? "demo" : "live");
    },
    [demo],
  );
  const push = useCallback(
    (href: string) => {
      recordNavigationIntent(href);
      warm(href);
      startTransition(() => router.push(href));
    },
    [router, warm],
  );
  return { push, warm, pending };
}
