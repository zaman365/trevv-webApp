"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLatestCallback } from "@/lib/use-latest-callback";
import { PersonCard } from "./person-card";
import styles from "./person-identity.module.css";

export function PersonHoverCard({
  id,
  anchor,
  keyboard,
  userId,
  name,
  workspaceSlug,
  onClose,
}: {
  id: string;
  anchor: HTMLButtonElement;
  keyboard: boolean;
  userId: string;
  name: string;
  workspaceSlug: string;
  onClose(focus?: boolean): void;
}) {
  const [position] = useState(() => {
    const bounds = anchor.getBoundingClientRect();
    const width = Math.min(336, window.innerWidth - 24);
    const height = Math.min(360, window.innerHeight - 24);
    return {
      left: Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12)),
      top:
        bounds.bottom + height + 8 > window.innerHeight
          ? Math.max(12, bounds.top - height - 8)
          : bounds.bottom + 8,
    };
  });
  const [container] = useState(
    () => anchor.closest<HTMLElement>('[role="dialog"]') ?? document.body,
  );
  const card = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = useLatestCallback(onClose);
  function cancelClose() {
    if (timer.current) clearTimeout(timer.current);
  }
  const scheduleClose = useLatestCallback(() => {
    cancelClose();
    timer.current = setTimeout(() => {
      if (
        !card.current?.contains(document.activeElement) &&
        !card.current?.matches(":hover") &&
        document.activeElement !== anchor &&
        !anchor.matches(":hover")
      )
        close();
    }, 200);
  });
  useLayoutEffect(() => {
    if (keyboard) card.current?.focus();
  }, [keyboard]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !anchor.contains(event.target) &&
        !card.current?.contains(event.target)
      )
        close();
    };
    const resized = () => close();
    anchor.addEventListener("mouseleave", scheduleClose);
    anchor.addEventListener("blur", scheduleClose);
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("resize", resized);
    scheduleClose();
    return () => {
      cancelClose();
      anchor.removeEventListener("mouseleave", scheduleClose);
      anchor.removeEventListener("blur", scheduleClose);
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("resize", resized);
    };
  }, [anchor, close, scheduleClose]);
  return createPortal(
    <div
      ref={card}
      id={id}
      tabIndex={-1}
      role="dialog"
      aria-label={`${name} profile card`}
      className={styles.hoverCard}
      style={position}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
      onFocus={cancelClose}
      onBlur={scheduleClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          close(true);
        }
      }}
    >
      <PersonCard
        userId={userId}
        workspaceSlug={workspaceSlug}
        onClose={() => close(true)}
      />
    </div>,
    container,
  );
}
