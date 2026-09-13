"use client";
import dynamic from "next/dynamic";
import { useId, useRef, useState, type ReactNode } from "react";
import styles from "./person-identity.module.css";
const PersonHoverCard = dynamic(
  () => import("./person-hover-card").then((module) => module.PersonHoverCard),
  { ssr: false },
);

export function PersonIdentity({
  userId,
  name,
  workspaceSlug,
  children,
}: {
  userId: string;
  name: string;
  workspaceSlug: string;
  children?: ReactNode;
}) {
  const id = useId();
  const [anchor, setAnchor] = useState<{
    element: HTMLButtonElement;
    keyboard: boolean;
  } | null>(null);
  const suppressed = useRef(false);
  function show(element: HTMLButtonElement, keyboard = false) {
    if (!suppressed.current) setAnchor({ element, keyboard });
  }
  function close(focus = false) {
    suppressed.current = true;
    setAnchor(null);
    if (focus) anchor?.element.focus();
    queueMicrotask(() => {
      suppressed.current = false;
    });
  }
  return (
    <>
      <button
        type="button"
        className={styles.identity}
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchor)}
        aria-controls={anchor ? id : undefined}
        onMouseEnter={(event) => show(event.currentTarget)}
        onFocus={(event) => {
          // Focus restoration after a pointer action must not reopen a card.
          // Keyboard focus still reveals the same actionable preview.
          if (event.currentTarget.matches(":focus-visible"))
            show(event.currentTarget);
        }}
        onClick={(event) => show(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && anchor) {
            event.stopPropagation();
            close();
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            show(event.currentTarget, true);
          }
        }}
      >
        {children ?? name}
      </button>
      {anchor ? (
        <PersonHoverCard
          id={id}
          anchor={anchor.element}
          keyboard={anchor.keyboard}
          userId={userId}
          name={name}
          workspaceSlug={workspaceSlug}
          onClose={close}
        />
      ) : null}
    </>
  );
}
