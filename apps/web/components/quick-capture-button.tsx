"use client";

import { Plus } from "lucide-react";
import { useId } from "react";

export function QuickCaptureButton({
  onClick,
  onIntent,
}: {
  onClick: () => void;
  onIntent?: () => void;
}) {
  const tooltipId = useId();
  return (
    <button
      type="button"
      className="quiet-button capture-button topbar-tool topbar-create-button"
      onPointerEnter={onIntent}
      onFocus={onIntent}
      onClick={(event) => {
        // Safari does not focus buttons on pointer click. Keep a return target
        // for the capture dialog when it restores focus after closing.
        event.currentTarget.focus();
        onClick();
      }}
      aria-label="Quick capture"
      aria-describedby={tooltipId}
      aria-keyshortcuts="Q"
    >
      <Plus size={16} strokeWidth={2} aria-hidden="true" />
      <span className="topbar-create-shortcut" id={tooltipId} role="tooltip">
        Quick capture <kbd>Q</kbd>
      </span>
    </button>
  );
}
