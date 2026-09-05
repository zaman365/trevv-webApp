"use client";

import NextLink, { useLinkStatus } from "next/link";
import { forwardRef, type ComponentProps } from "react";
import styles from "./navigation-link.module.css";

/** Keep the current page interactive while its destination is authorized. */
export const NavigationLink = forwardRef<
  HTMLAnchorElement,
  ComponentProps<typeof NextLink>
>(function NavigationLink({ children, className, ...props }, ref) {
  return (
    <NextLink
      {...props}
      ref={ref}
      className={`${styles.link} ${className ?? ""}`}
    >
      {children}
      <PendingHint />
    </NextLink>
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
