"use client";

import { ArrowRight, Lightbulb } from "lucide-react";
import { useId, useState, type FocusEvent } from "react";
import { getLearningHint } from "@/lib/learning-resource-hints";
import { useLearningCenter } from "./learning-center-context";

export function Hint({
  resourceId,
  label,
}: {
  resourceId: string;
  label?: string;
}) {
  const { openLearningCenter } = useLearningCenter();
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const resource = getLearningHint(resourceId);

  if (!resource) return null;

  const closeWhenFocusLeaves = (event: FocusEvent<HTMLSpanElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  };

  return (
    <span className="trevv-hint" onBlur={closeWhenFocusLeaves}>
      <button
        type="button"
        className="trevv-hint-trigger"
        aria-label={label ?? `Hint: ${resource.title}`}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        title={`Hint: ${resource.title}`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <Lightbulb size={12} />
      </button>
      {open && (
        <span className="trevv-hint-popover" id={tooltipId} role="tooltip">
          <span className="hint-popover-label">
            <Lightbulb size={12} /> Helpful hint
          </span>
          <strong>{resource.title}</strong>
          <span>{resource.summary}</span>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              openLearningCenter(resource.id);
            }}
          >
            Open full guide <ArrowRight size={12} />
          </button>
        </span>
      )}
    </span>
  );
}
