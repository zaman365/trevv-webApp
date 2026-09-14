"use client";

import { Plus, Trash2, ExternalLink } from "lucide-react";
import {
  elapsedWorkMinutes,
  type SaveReportPlanInput,
  type ReportTimeEntry,
} from "@founderhq/api-contract/report-plan";
import { formatWorkMinutes, reportTimeTotal } from "@/lib/report-plan";
import styles from "./report-plan.module.css";

type Props = {
  input: SaveReportPlanInput;
  onChange(input: SaveReportPlanInput): void;
};
export function ReportTimeFields({ input, onChange }: Props) {
  const entries = input.content.timeEntries ?? [];
  const setEntries = (timeEntries: ReportTimeEntry[]) =>
    onChange({ ...input, content: { ...input.content, timeEntries } });
  function update(index: number, patch: Partial<ReportTimeEntry>) {
    setEntries(
      entries.map((entry, at) => {
        if (at !== index) return entry;
        const next = { ...entry, ...patch };
        const elapsed = elapsedWorkMinutes(next);
        return {
          ...next,
          ...(elapsed !== undefined ? { minutes: elapsed } : {}),
        };
      }),
    );
  }
  return (
    <section className={styles.full} aria-label="Working time entries">
      <div className={styles.sectionHeading}>
        <div>
          <h3>Working time</h3>
          <p>
            Enter a duration or use start/end times with breaks. Total:{" "}
            <strong>{formatWorkMinutes(reportTimeTotal(input))}</strong>
          </p>
        </div>
        <button
          className={styles.secondary}
          type="button"
          disabled={entries.length >= 100}
          onClick={() =>
            setEntries([
              ...entries,
              { date: input.periodStart, activity: "", minutes: 60 },
            ])
          }
        >
          <Plus size={16} aria-hidden="true" /> Add time entry
        </button>
      </div>
      {!entries.length && (
        <p className={styles.hint}>
          Optional for reports. Log focused work, meetings, research or delivery
          activities. Only time you enter is recorded.
        </p>
      )}
      <div className={styles.entryList}>
        {entries.map((entry, index) => (
          <fieldset key={index} className={styles.entry}>
            <legend>Time entry {index + 1}</legend>
            <div className={styles.editorFields}>
              <label className={styles.full}>
                Activity
                <input
                  aria-label={`Activity ${index + 1}`}
                  maxLength={240}
                  value={entry.activity}
                  placeholder="e.g. Prepare campaign assets"
                  onChange={(e) => update(index, { activity: e.target.value })}
                />
              </label>
              <label>
                Date
                <input
                  aria-label={`Work date ${index + 1}`}
                  type="date"
                  min={input.periodStart}
                  max={input.periodEnd}
                  value={entry.date}
                  onChange={(e) => update(index, { date: e.target.value })}
                />
              </label>
              <label>
                Entry method
                <select
                  aria-label={`Entry method ${index + 1}`}
                  value={entry.startTime !== undefined ? "clock" : "duration"}
                  onChange={(e) => {
                    if (e.target.value === "clock")
                      update(index, {
                        startTime: "09:00",
                        endTime: "10:00",
                        breakMinutes: 0,
                        endsNextDay: false,
                      });
                    else
                      setEntries(
                        entries.map((value, at) =>
                          at === index
                            ? {
                                date: value.date,
                                activity: value.activity,
                                minutes: Math.max(1, value.minutes),
                              }
                            : value,
                        ),
                      );
                  }}
                >
                  <option value="duration">Duration only</option>
                  <option value="clock">Start / end time</option>
                </select>
              </label>
              {entry.startTime !== undefined ? (
                <>
                  <label>
                    Start time
                    <input
                      aria-label={`Start time ${index + 1}`}
                      type="time"
                      value={entry.startTime}
                      onChange={(e) =>
                        update(index, { startTime: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    End time
                    <input
                      aria-label={`End time ${index + 1}`}
                      type="time"
                      value={entry.endTime ?? ""}
                      onChange={(e) =>
                        update(index, { endTime: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Break minutes
                    <input
                      aria-label={`Break minutes ${index + 1}`}
                      type="number"
                      min={0}
                      max={1439}
                      value={entry.breakMinutes ?? 0}
                      onChange={(e) =>
                        update(index, { breakMinutes: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={entry.endsNextDay ?? false}
                      onChange={(e) =>
                        update(index, { endsNextDay: e.target.checked })
                      }
                    />{" "}
                    Ends the next day
                  </label>
                </>
              ) : (
                <label>
                  Working minutes
                  <input
                    aria-label={`Working minutes ${index + 1}`}
                    type="number"
                    min={1}
                    max={1440}
                    value={entry.minutes}
                    onChange={(e) =>
                      update(index, { minutes: Number(e.target.value) })
                    }
                  />
                </label>
              )}
            </div>
            <div className={styles.sectionHeading}>
              <span className={styles.hint}>
                {entry.minutes > 0
                  ? `${formatWorkMinutes(entry.minutes)} of work`
                  : "Check the times and breaks"}
              </span>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={`Remove time entry ${index + 1}`}
                onClick={() =>
                  setEntries(entries.filter((_, at) => at !== index))
                }
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          </fieldset>
        ))}
      </div>
    </section>
  );
}

export function ReportResourceFields({ input, onChange }: Props) {
  const resources = input.content.resources ?? [];
  const update = (next: typeof resources) =>
    onChange({ ...input, content: { ...input.content, resources: next } });
  return (
    <section className={styles.full} aria-label="Report resources">
      <div className={styles.sectionHeading}>
        <div>
          <h3>Links & resources</h3>
          <p>
            Add Google Drive, documents, designs, results or other supporting
            files.
          </p>
        </div>
        <button
          type="button"
          className={styles.secondary}
          disabled={resources.length >= 20}
          onClick={() =>
            update([...resources, { label: "", url: "", note: "" }])
          }
        >
          <Plus size={16} aria-hidden="true" /> Add resource link
        </button>
      </div>
      <p className={styles.hint}>
        Links open at their source. People still need access there; adding a
        link does not change the file’s sharing permissions.
      </p>
      <div className={styles.entryList}>
        {resources.map((resource, index) => (
          <fieldset className={styles.entry} key={index}>
            <legend>Resource {index + 1}</legend>
            <div className={styles.editorFields}>
              <label className={styles.full}>
                Link name
                <input
                  aria-label={`Link name ${index + 1}`}
                  maxLength={160}
                  value={resource.label}
                  placeholder="e.g. Campaign results on Google Drive"
                  onChange={(e) =>
                    update(
                      resources.map((r, at) =>
                        at === index ? { ...r, label: e.target.value } : r,
                      ),
                    )
                  }
                />
              </label>
              <label className={styles.full}>
                URL
                <input
                  aria-label={`Resource URL ${index + 1}`}
                  type="url"
                  maxLength={2048}
                  value={resource.url}
                  placeholder="https://drive.google.com/…"
                  onChange={(e) =>
                    update(
                      resources.map((r, at) =>
                        at === index ? { ...r, url: e.target.value } : r,
                      ),
                    )
                  }
                />
              </label>
              <label className={styles.full}>
                Note · Optional
                <input
                  aria-label={`Resource note ${index + 1}`}
                  maxLength={500}
                  value={resource.note ?? ""}
                  onChange={(e) =>
                    update(
                      resources.map((r, at) =>
                        at === index ? { ...r, note: e.target.value } : r,
                      ),
                    )
                  }
                />
              </label>
            </div>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={`Remove resource ${index + 1}`}
              onClick={() => update(resources.filter((_, at) => at !== index))}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </fieldset>
        ))}
      </div>
    </section>
  );
}

export function ReportLogDetails({ input }: { input: SaveReportPlanInput }) {
  return (
    <>
      {input.content.progressPercent !== undefined && (
        <p>
          Reported progress: <strong>{input.content.progressPercent}%</strong>
        </p>
      )}
      {!!input.content.timeEntries?.length && (
        <section aria-label="Logged working time">
          <h3>Working time · {formatWorkMinutes(reportTimeTotal(input))}</h3>
          <ul className={styles.resourceList}>
            {input.content.timeEntries.map((entry, i) => (
              <li key={i}>
                <strong>{entry.activity}</strong>
                <span>
                  {entry.date} · {formatWorkMinutes(entry.minutes)}
                  {entry.startTime
                    ? ` · ${entry.startTime}–${entry.endTime}${entry.endsNextDay ? " (+1 day)" : ""} · ${entry.breakMinutes ?? 0}m break`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!!input.content.resources?.length && (
        <section aria-label="Linked resources">
          <h3>Links & resources</h3>
          <ul className={styles.resourceList}>
            {input.content.resources.map((resource, i) => (
              <li key={i}>
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={14} aria-hidden="true" />
                  {resource.label}
                </a>
                {resource.note && <span>{resource.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
