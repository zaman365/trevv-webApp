"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLink as Link } from "@/components/navigation-link";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords } from "@/lib/live-app-data";
import { collaborationKeys } from "@/lib/live-collaboration";
import { presentLiveError } from "@/lib/live-errors";
import { retainedKey } from "@/lib/live-work-view-helpers";
import { LiveStateNotice } from "./live-state";
import styles from "./live-collaboration.module.css";

/** Usable inside task forms too: deliberately does not introduce a nested form. */
export function LiveInvitePerson({
  workspaceId,
  teamId,
  teamName,
  onRefresh,
}: {
  workspaceId: string;
  teamId?: string;
  teamName?: string;
  onRefresh?: () => void;
}) {
  const session = useAppSession();
  const { client } = useLiveAppRecords();
  const cache = useQueryClient();
  const canInvite = ["owner", "admin"].includes(session.organization.role);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState("");
  const keys = useRef(new Map<string, string>());
  const invitations = useQuery({
    queryKey: ["invitations", session.organization.id],
    queryFn: ({ signal }) => client.withSignal(signal).invitations(),
    enabled: canInvite,
    staleTime: 15_000,
  });
  const relevant =
    invitations.data?.filter(
      (entry) =>
        entry.workspaceId === workspaceId &&
        (!teamId || entry.teamId === teamId) &&
        entry.status === "pending",
    ) ?? [];

  async function invite() {
    if (pending || !canInvite || !/^\S+@\S+\.\S+$/.test(email.trim())) return;
    const input = {
      email: email.trim().toLowerCase(),
      role: "member" as const,
      workspaceId,
      ...(teamId ? { teamId } : {}),
    };
    const fingerprint = JSON.stringify(input);
    setPending(true);
    setError(null);
    setMessage("");
    try {
      const { data } = await client.createInvitation(
        input,
        retainedKey(keys.current, fingerprint),
      );
      keys.current.delete(fingerprint);
      setEmail("");
      setMessage(
        data.deliveryStatus === "sent"
          ? `Invitation sent to ${data.email}. They can be assigned work after accepting${teamName ? ` and will join ${teamName}` : ""}.`
          : data.deliveryStatus === "failed"
            ? `Invitation saved, but email delivery failed. Open invitations to resend it.`
            : `Invitation saved. Email delivery is pending; membership starts after acceptance.`,
      );
      void cache.invalidateQueries({
        queryKey: ["invitations", session.organization.id],
      });
    } catch (reason) {
      setError(reason);
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className={styles.peopleInvite}
      aria-label={teamName ? `Invite to ${teamName}` : "Invite a teammate"}
    >
      <h4>
        {teamName ? `Invite someone to ${teamName}` : "Invite a teammate"}
      </h4>
      {canInvite ? (
        <>
          <p>
            Send an invitation by email. Accepting it gives them access to this
            workspace{teamName ? ` and adds them to ${teamName}` : ""}.
          </p>
          <div className={styles.addMemberRow}>
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                value={email}
                disabled={pending}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="teammate@company.com"
              />
            </label>
            <button
              type="button"
              disabled={pending || !/^\S+@\S+\.\S+$/.test(email.trim())}
              onClick={() => void invite()}
            >
              {pending ? "Sending…" : "Send invitation"}
            </button>
          </div>
          {error ? (
            <LiveStateNotice {...presentLiveError(error)} compact />
          ) : null}
          {message ? <p role="status">{message}</p> : null}
          {relevant.length ? (
            <ul aria-label="Pending team invitations">
              {relevant.map((entry) => (
                <li key={entry.id}>
                  {entry.email} ·{" "}
                  {entry.deliveryStatus === "failed"
                    ? "Email failed — resend needed"
                    : "Waiting for acceptance"}
                </li>
              ))}
            </ul>
          ) : null}
          <Link
            href={`/app/account/invitations?workspaceId=${encodeURIComponent(workspaceId)}${teamId ? `&teamId=${encodeURIComponent(teamId)}` : ""}`}
          >
            View invitations and delivery status
          </Link>
        </>
      ) : (
        <p>
          An organization owner or admin can invite new people. You can add
          people who already have workspace access using the member selector.
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          void cache.invalidateQueries({
            queryKey: collaborationKeys.teams(workspaceId),
          });
          void cache.invalidateQueries({
            queryKey: [
              "workspace-resources",
              session.organization.id,
              workspaceId,
              "assignees",
            ],
          });
          if (canInvite) void invitations.refetch();
          onRefresh?.();
        }}
      >
        Refresh people after acceptance
      </button>
    </section>
  );
}
