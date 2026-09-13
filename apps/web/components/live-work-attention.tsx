"use client";

import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AttentionAction,
  AttentionSignalDto,
} from "@founderhq/api-contract";
import { attentionActionSchema } from "@founderhq/api-contract";
import { ChevronRight, Sparkles } from "lucide-react";
import { useReportRouteReady } from "@/lib/navigation-performance";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords } from "@/lib/live-app-data";
import {
  isLiveAccessLoss,
  presentLiveError,
  presentLiveReadError,
} from "@/lib/live-errors";
import { formatLiveDate } from "@/lib/live-workflow-ui";
import {
  issueHash,
  issueIdFromHash,
  issueResolutionSection,
  isActiveIssue,
  type IssueSection,
} from "@/lib/attention-workspace";
import { recordKey, retainedKey } from "@/lib/live-work-view-helpers";
import { LiveStateNotice } from "./live-state";
import { WindowedCollection } from "./windowed-collection";
import styles from "./live-operating-loop.module.css";
import issueStyles from "./live-issue-detail.module.css";

const IssueDetail = lazy(() =>
  import("./live-issue-detail").then((module) => ({
    default: module.LiveIssueDetail,
  })),
);
type Selection = {
  signal: AttentionSignalDto;
  section: IssueSection;
  action?: AttentionAction["action"];
};

export function LiveAttention({ signals }: { signals: AttentionSignalDto[] }) {
  useReportRouteReady(true);
  const session = useAppSession();
  const data = useLiveAppRecords();
  const [records, setRecords] = useState(signals);
  const [selected, setSelected] = useState<Selection | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const busy = useRef(false);
  const [notice, setNotice] = useState<ReactNode>(null);
  const [failure, setFailure] = useState<{
    signal: AttentionSignalDto;
    input: AttentionAction;
    error: unknown;
  } | null>(null);
  const retryKeys = useRef(new Map<string, string>());
  const confirmed = useRef(new Map<string, AttentionSignalDto>());
  const [now, setNow] = useState(Date.now);
  const active = data.accessLost
    ? []
    : records.filter((signal) => isActiveIssue(signal, now));
  const selectedSignal = selected
    ? (records.find((record) => record.id === selected.signal.id) ??
      selected.signal)
    : null;
  const workspace = data.workspaces.find(
    (record) => record.id === selectedSignal?.workspaceId,
  );

  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setRecords(
          signals.map((signal) => {
            const saved = confirmed.current.get(signal.id);
            return saved && saved.version > signal.version ? saved : signal;
          }),
        ),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [signals]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const sync = () => {
      const id = issueIdFromHash(window.location.hash);
      setSelected((current) => {
        if (!id) return null;
        if (current?.signal.id === id) return current;
        const signal = signals.find((record) => record.id === id);
        return signal ? { signal, section: "overview" } : null;
      });
    };
    const timer = window.setTimeout(sync, 0);
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, [signals]);
  function open(
    signal: AttentionSignalDto,
    element: HTMLElement,
    section: IssueSection = "overview",
    action?: AttentionAction["action"],
  ) {
    trigger.current = element;
    setSelected({ signal, section, ...(action ? { action } : {}) });
    setNotice(null);
    setFailure(null);
    if (window.location.hash !== issueHash(signal.id))
      window.history.pushState(null, "", issueHash(signal.id));
  }
  function close() {
    setSelected(null);
    if (issueIdFromHash(window.location.hash))
      window.history.pushState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    trigger.current?.focus();
  }
  async function perform(signal: AttentionSignalDto, input: AttentionAction) {
    if (busy.current) return false;
    const parsed = attentionActionSchema.safeParse(input);
    if (!parsed.success) {
      setNotice(
        <LiveStateNotice
          kind="validation"
          title="Add a reason of at least three characters"
        />,
      );
      return false;
    }
    busy.current = true;
    setPendingId(signal.id);
    setNotice(null);
    setFailure(null);
    const fingerprint = `attention:${signal.id}:${signal.version}:${JSON.stringify(input)}`;
    try {
      const response = await data.client.actOnAttention(
        signal.id,
        {
          action: input.action,
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.snoozedUntil ? { snoozedUntil: input.snoozedUntil } : {}),
        },
        signal.version,
        retainedKey(retryKeys.current, fingerprint),
      );
      retryKeys.current.delete(fingerprint);
      confirmed.current.set(signal.id, response.data);
      setRecords((current) =>
        current.map((record) =>
          record.id === signal.id ? response.data : record,
        ),
      );
      setNotice(
        <LiveStateNotice
          kind="saved"
          title={
            input.action === "resolve"
              ? "Issue marked resolved"
              : input.action === "dismiss"
                ? "Issue dismissed"
                : "Issue snoozed for 24 hours"
          }
          {...(input.reason ? { description: input.reason } : {})}
        />,
      );
      // Refresh failure cannot turn an acknowledged write into an unconfirmed one.
      void data.refresh().catch(() => undefined);
      return true;
    } catch (error) {
      setFailure({ signal, input, error });
      return false;
    } finally {
      busy.current = false;
      setPendingId(null);
    }
  }
  async function loadLatest(reapply = false) {
    if (!failure || busy.current) return;
    const current = failure;
    try {
      const latest = await data.client.attention(
        current.signal.workspaceId
          ? { workspaceId: current.signal.workspaceId }
          : {},
      );
      const signal = latest.find((record) => record.id === current.signal.id);
      if (!signal) {
        setRecords((records) =>
          records.filter((record) => record.id !== current.signal.id),
        );
        setFailure(null);
        setNotice(
          <LiveStateNotice
            kind="saved"
            title="This issue is no longer active"
            description="The latest server check no longer lists it as open."
          />,
        );
        void data.refresh();
      } else if (reapply) await perform(signal, current.input);
      else {
        setRecords((records) =>
          records.map((record) => (record.id === signal.id ? signal : record)),
        );
        setFailure(null);
        setNotice(
          <LiveStateNotice
            kind="saved"
            title="Latest issue loaded"
            description="Review the current issue and your kept draft before applying an action."
          />,
        );
      }
    } catch (error) {
      setFailure({ ...current, error });
    }
  }
  const presented = failure ? presentLiveError(failure.error) : null;
  const actionNotice = (
    <>
      {notice}
      {failure && presented ? (
        <LiveStateNotice
          {...presented}
          title={
            presented.kind === "terminal-error"
              ? "Could not confirm the issue action"
              : presented.title
          }
          description={
            presented.kind === "terminal-error"
              ? "Your outcome is kept. Check the latest issue state before retrying; the action may already have been saved."
              : presented.description
          }
          actions={
            <>
              <button type="button" onClick={() => void loadLatest()}>
                Load latest
              </button>
              {presented.kind === "version-conflict" ? (
                <button type="button" onClick={() => void loadLatest(true)}>
                  Reapply to latest
                </button>
              ) : !isLiveAccessLoss(failure.error) ? (
                <button
                  type="button"
                  onClick={() => void perform(failure.signal, failure.input)}
                >
                  Retry action
                </button>
              ) : null}
            </>
          }
        />
      ) : null}
    </>
  );
  const canWrite = !["guest", "viewer"].includes(session.organization.role);
  return (
    <section className={styles.panel} aria-labelledby="attention-signals-title">
      <header>
        <div>
          <p>Issues that need a next step</p>
          <h2 id="attention-signals-title">Open signals</h2>
        </div>
        <span>
          {active.length}
          {data.recordsComplete ? " active" : " active loaded"}
        </span>
      </header>
      {!selected ? actionNotice : null}
      {data.error ? (
        <LiveStateNotice
          {...presentLiveReadError(data.error)}
          actions={
            <button type="button" onClick={() => void data.refresh()}>
              Refresh issues
            </button>
          }
        />
      ) : null}
      {active.length === 0 ? (
        <LiveStateNotice
          kind={data.recordsComplete ? "empty" : "loading"}
          title={
            data.recordsComplete
              ? "Nothing needs attention"
              : "Loading attention signals"
          }
          description={
            data.recordsComplete
              ? "There are no open issues requiring attention right now."
              : "Workspace records are still arriving."
          }
        />
      ) : (
        <WindowedCollection
          className={styles.stack}
          items={active}
          itemKey={recordKey}
          label="Work records"
        >
          {(signal) => (
            <article
              className={`${styles.signalCard} ${issueStyles.card}`}
              data-severity={signal.severity}
              data-testid={`attention-signal-${signal.id}`}
              key={signal.id}
              onClick={(event) => {
                if (
                  !(event.target as HTMLElement).closest(
                    "button, a, input, select, textarea, summary",
                  )
                ) {
                  const button =
                    event.currentTarget.querySelector<HTMLButtonElement>(
                      "button",
                    );
                  if (button) open(signal, button);
                }
              }}
            >
              <span className={styles.rowIcon}>
                <Sparkles size={16} aria-hidden="true" />
              </span>
              <div>
                <p>
                  {signal.severity} · {signal.reasonCode}
                </p>
                <h3>
                  <button
                    type="button"
                    className={issueStyles.openIssue}
                    onClick={(event) => open(signal, event.currentTarget)}
                  >
                    {signal.reason}
                  </button>
                </h3>
                {signal.recommendedAction ? (
                  <span>{signal.recommendedAction}</span>
                ) : null}
                <span className={issueStyles.cardHint}>
                  Open details & next steps <ChevronRight size={13} />
                </span>
                <ul>
                  {signal.sourceEvidence.map((source) => (
                    <li key={`${source.sourceType}:${source.sourceId}`}>
                      <strong>{source.sourceType}</strong> {source.sourceId}
                      {source.summary ? ` · ${source.summary}` : ""}
                      <small>
                        {formatLiveDate(
                          source.capturedAt,
                          session.organization.timezone ?? "UTC",
                        )}
                      </small>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={styles.rowActions}>
                <button
                  type="button"
                  onClick={(event) =>
                    open(
                      signal,
                      event.currentTarget,
                      issueResolutionSection(signal),
                    )
                  }
                >
                  Resolve
                </button>
                {canWrite ? (
                  <>
                    <button
                      type="button"
                      disabled={pendingId === signal.id}
                      onClick={(event) =>
                        open(signal, event.currentTarget, "overview", "snooze")
                      }
                    >
                      Snooze 24h
                    </button>
                    <button
                      type="button"
                      disabled={pendingId === signal.id}
                      onClick={(event) =>
                        open(signal, event.currentTarget, "overview", "dismiss")
                      }
                    >
                      Dismiss
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          )}
        </WindowedCollection>
      )}
      {selected && selectedSignal && workspace && !data.accessLost ? (
        <Suspense
          fallback={
            <LiveStateNotice kind="loading" title="Opening issue details" />
          }
        >
          <IssueDetail
            key={`${selectedSignal.id}:${selected.section}:${selected.action ?? ""}`}
            signal={selectedSignal}
            workspace={workspace}
            initialSection={selected.section}
            {...(selected.action ? { initialAction: selected.action } : {})}
            active={active.some((record) => record.id === selectedSignal.id)}
            pending={pendingId === selectedSignal.id}
            actionNotice={actionNotice}
            returnFocusRef={trigger}
            onClose={close}
            onAction={perform}
          />
        </Suspense>
      ) : null}
    </section>
  );
}
