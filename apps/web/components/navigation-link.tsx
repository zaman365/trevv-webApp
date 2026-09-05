"use client";

import NextLink, { useLinkStatus } from "next/link";
import { forwardRef, type ComponentProps } from "react";
import { useOptionalAppSession } from "@/lib/app-session-context";
import { isAppPath, preloadRouteCode } from "@/lib/route-code-preload";
import styles from "./navigation-link.module.css";

/** Application links warm code without fetching disposable private pages. */
export const AppLink = forwardRef<
  HTMLAnchorElement,
  ComponentProps<typeof NextLink>
>(function AppLink({ onMouseEnter, onFocus, ...props }, ref) {
  const session = useOptionalAppSession();
  const pathname =
    typeof props.href === "string" ? props.href : (props.href.pathname ?? "");
  const protectedPage = isAppPath(pathname);
  const warmCode = () => {
    if (protectedPage && session)
      void preloadRouteCode(pathname, session.demo ? "demo" : "live");
  };
  return (
    <NextLink
      {...props}
      // Dynamic route responses expire immediately in the Worker adapter.
      // Warming every visible link creates an API stampede with no cache hit.
      // Keep per-navigation authorization fresh and warm static code on intent.
      {...(protectedPage ? { prefetch: false } : {})}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        if (!event.defaultPrevented) warmCode();
      }}
      onFocus={(event) => {
        onFocus?.(event);
        if (!event.defaultPrevented) warmCode();
      }}
      ref={ref}
    />
  );
});

/** Keep the current page interactive while its destination is authorized. */
export const NavigationLink = forwardRef<
  HTMLAnchorElement,
  ComponentProps<typeof NextLink>
>(function NavigationLink({ children, className, ...props }, ref) {
  return (
    <AppLink
      {...props}
      ref={ref}
      className={`${styles.link} ${className ?? ""}`}
    >
      {children}
      <PendingHint />
    </AppLink>
  );
});

function PendingHint() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={styles.pending}
      data-navigation-pending={pending || undefined}
    />
  );
}
