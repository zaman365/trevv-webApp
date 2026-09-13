"use client";

import {
  CircleCheckBig,
  FileQuestion,
  Lightbulb,
  ListTodo,
  Milestone,
  MoreHorizontal,
  Send,
} from "lucide-react";
import { useId, useRef, type ReactNode } from "react";
import type { WorkItemDto } from "@founderhq/api-contract";
import styles from "./quick-capture-types.module.css";

export const captureTypes = {
  task: {
    label: "Task",
    description: "A concrete next action",
    placeholder: "What needs to move?",
    icon: ListTodo,
  },
  idea: {
    label: "Idea",
    description: "An opportunity to explore",
    placeholder: "What opportunity did you notice?",
    icon: Lightbulb,
  },
  decision: {
    label: "Decision",
    description: "A choice that needs an outcome",
    placeholder: "Which path should we choose?",
    icon: FileQuestion,
  },
  approval: {
    label: "Approval",
    description: "Work that needs a reviewer",
    placeholder: "Name the work to review",
    icon: CircleCheckBig,
  },
  milestone: {
    label: "Milestone",
    description: "A meaningful checkpoint",
    placeholder: "Name the meaningful checkpoint",
    icon: Milestone,
  },
  request: {
    label: "Request",
    description: "An ask for someone else",
    placeholder: "Describe the ask clearly",
    icon: Send,
  },
} satisfies Record<
  WorkItemDto["type"],
  {
    label: string;
    description: string;
    placeholder: string;
    icon: typeof ListTodo;
  }
>;

const mainTypes = ["task", "idea", "decision", "approval"] as const;
const otherTypes = ["milestone", "request"] as const;
const tabs = [...mainTypes, "other"] as const;

/** One shared selector keeps every supported capture type available in both modes. */
export function QuickCaptureTypes({
  value,
  onChange,
  children,
}: {
  value: WorkItemDto["type"];
  onChange: (type: WorkItemDto["type"]) => void;
  children: ReactNode;
}) {
  const id = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const lastOther = useRef<(typeof otherTypes)[number]>("milestone");
  const isOther = value === "milestone" || value === "request";
  const selectedTab = isOther ? "other" : value;
  function select(index: number) {
    const tab = tabs[index];
    if (!tab) return;
    if (isOther) lastOther.current = value;
    onChange(tab === "other" ? lastOther.current : tab);
  }
  return (
    <div className={styles.picker}>
      <div className={styles.tabs} role="tablist" aria-label="Capture type">
        {tabs.map((tab, index) => {
          const Icon =
            tab === "other" ? MoreHorizontal : captureTypes[tab].icon;
          return (
            <button
              key={tab}
              id={`${id}-${tab}`}
              type="button"
              role="tab"
              aria-selected={selectedTab === tab}
              aria-controls={`${id}-panel`}
              tabIndex={selectedTab === tab ? 0 : -1}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              onClick={() => select(index)}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % tabs.length
                    : event.key === "ArrowLeft"
                      ? (index + tabs.length - 1) % tabs.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabs.length - 1
                          : null;
                if (next === null) return;
                event.preventDefault();
                select(next);
                buttons.current[next]?.focus();
              }}
            >
              <Icon size={17} aria-hidden="true" />
              <span>
                {tab === "other" ? "Other items" : captureTypes[tab].label}
              </span>
            </button>
          );
        })}
      </div>
      <div
        className={styles.panel}
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${selectedTab}`}
      >
        {isOther ? (
          <fieldset className={styles.otherTypes}>
            <legend>Other items</legend>
            {otherTypes.map((type) => {
              const { label, description, icon: Icon } = captureTypes[type];
              return (
                <label
                  key={type}
                  className={value === type ? styles.selected : undefined}
                >
                  <input
                    type="radio"
                    name={`${id}-other-type`}
                    value={type}
                    checked={value === type}
                    onChange={() => {
                      lastOther.current = type;
                      onChange(type);
                    }}
                  />
                  <Icon size={18} aria-hidden="true" />
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                </label>
              );
            })}
          </fieldset>
        ) : (
          <p className={styles.hint}>{captureTypes[value].description}</p>
        )}
        {children}
      </div>
    </div>
  );
}
