"use client";
import { useRef } from "react";
import type { PageSection } from "./page-sections";
import styles from "./page-sections.module.css";
export function PageTabs({
  sections,
  value,
  onChange,
  label,
  id,
}: {
  sections: readonly PageSection[];
  value: string;
  onChange(id: string): void;
  label: string;
  id: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  return (
    <div role="tablist" aria-label={label} className={styles.tabs}>
      {sections.map((section, index) => (
        <button
          key={section.id}
          type="button"
          role="tab"
          id={`${id}-tab-${section.id}`}
          aria-controls={`${id}-panel-${section.id}`}
          aria-selected={value === section.id}
          tabIndex={value === section.id ? 0 : -1}
          ref={(element) => {
            refs.current[index] = element;
          }}
          onClick={() => onChange(section.id)}
          onKeyDown={(event) => {
            const next =
              event.key === "ArrowRight"
                ? (index + 1) % sections.length
                : event.key === "ArrowLeft"
                  ? (index + sections.length - 1) % sections.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? sections.length - 1
                      : null;
            if (next === null) return;
            event.preventDefault();
            refs.current[next]?.focus();
            onChange(sections[next]!.id);
          }}
        >
          {section.icon}
          {section.label}
        </button>
      ))}
    </div>
  );
}
