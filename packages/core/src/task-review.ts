export interface TaskReview {
  id: string;
  round: number;
  requestedBy: { id: string; name: string };
  requestedAt: string;
  requestedVersion: number;
  note: string;
  dueDate?: string | undefined;
  state:
    "pending" | "approved" | "changes_requested" | "cancelled" | "invalidated";
  closedAt?: string | undefined;
  closingNote?: string | undefined;
  reviewers: Array<{
    id: string;
    name: string;
    decision: "pending" | "approved" | "changes_requested";
    note?: string | undefined;
    respondedAt?: string | undefined;
  }>;
}

export type TaskReviewCommand =
  | {
      action: "request";
      reviewerIds: string[];
      note: string;
      dueDate?: string | undefined;
    }
  | {
      action: "respond";
      roundId: string;
      decision: "approved" | "changes_requested";
      note: string;
    }
  | { action: "cancel"; roundId: string; note: string };

/** Review state lives with the versioned task; each revision is retained in its history. */
export function applyTaskReview(
  item: {
    type: string;
    status: string;
    version: number;
    review?: TaskReview | undefined;
  },
  command: TaskReviewCommand,
  context: {
    actor: { id: string; name: string };
    now: string;
    newId: string;
    reviewers: Array<{ id: string; name: string }>;
  },
): { review: TaskReview; status: "review" | "working" } {
  if (item.type !== "task") throw new Error("Only tasks use task reviews.");
  if (item.status === "done" || item.status === "blocked")
    throw new Error("Reopen or unblock the task before changing its review.");
  if (!command.note.trim())
    throw new Error("Add a note explaining this review action.");
  if (command.action === "request") {
    if (item.review?.state === "pending")
      throw new Error(
        "Finish or cancel the current review before sending another round.",
      );
    const ids = [...new Set(command.reviewerIds)];
    if (
      !ids.length ||
      ids.length > 25 ||
      ids.length !== command.reviewerIds.length
    )
      throw new Error("Choose between 1 and 25 different reviewers.");
    const reviewers = ids.map((id) => {
      const person = context.reviewers.find((entry) => entry.id === id);
      if (!person)
        throw new Error("Every reviewer must have access to this workspace.");
      return { ...person, decision: "pending" as const };
    });
    return {
      status: "review",
      review: {
        id: context.newId,
        round: (item.review?.round ?? 0) + 1,
        requestedBy: context.actor,
        requestedAt: context.now,
        requestedVersion: item.version,
        note: command.note.trim(),
        ...(command.dueDate ? { dueDate: command.dueDate } : {}),
        state: "pending",
        reviewers,
      },
    };
  }
  if (!item.review || item.review.id !== command.roundId)
    throw new Error(
      "This review has been replaced. Reload the task for the current round.",
    );
  if (
    ![
      "pending",
      "changes_requested",
      ...(command.action === "cancel" ? ["invalidated"] : []),
    ].includes(item.review.state)
  )
    throw new Error("This review round is closed.");
  if (command.action === "cancel")
    return {
      status: "working",
      review: {
        ...item.review,
        state: "cancelled",
        closedAt: context.now,
        closingNote: command.note.trim(),
      },
    };
  const reviewer = item.review.reviewers.find(
    (entry) => entry.id === context.actor.id,
  );
  if (!reviewer)
    throw new Error("Only an assigned reviewer can submit a response.");
  if (reviewer.decision !== "pending")
    throw new Error("Your response has already been recorded for this round.");
  const reviewers = item.review.reviewers.map((entry) =>
    entry.id === context.actor.id
      ? {
          ...entry,
          decision: command.decision,
          note: command.note.trim(),
          respondedAt: context.now,
        }
      : entry,
  );
  const state = reviewers.some(
    (entry) => entry.decision === "changes_requested",
  )
    ? "changes_requested"
    : reviewers.every((entry) => entry.decision === "approved")
      ? "approved"
      : "pending";
  return {
    status: state === "changes_requested" ? "working" : "review",
    review: {
      ...item.review,
      reviewers,
      state,
      ...(state !== "pending" ? { closedAt: context.now } : {}),
    },
  };
}

export function reviewForTaskChange(
  item: {
    status: string;
    review?: TaskReview | undefined;
    title?: string | undefined;
    description?: string | undefined;
    planning?: unknown;
  },
  patch: {
    status?: string | undefined;
    title?: string | undefined;
    description?: string | undefined;
    planning?: unknown;
  },
  now: string,
): TaskReview | undefined {
  const review = item.review;
  if (!review) return undefined;
  if (
    patch.status === "done" &&
    !["approved", "cancelled"].includes(review.state)
  )
    throw new Error(
      "All reviewers must approve this task before it can be completed. Address feedback and send a new round, or explicitly cancel the review with a note.",
    );
  const revised =
    (patch.title !== undefined && patch.title !== item.title) ||
    (patch.description !== undefined &&
      patch.description !== item.description) ||
    (patch.planning !== undefined &&
      JSON.stringify(patch.planning) !== JSON.stringify(item.planning)) ||
    (item.status === "done" &&
      patch.status !== undefined &&
      patch.status !== "done");
  if (revised && patch.status === "done" && review.state !== "cancelled")
    throw new Error("Changed work needs a new review before completion.");
  if (revised && !["cancelled", "invalidated"].includes(review.state))
    return {
      ...review,
      state: "invalidated",
      closedAt: now,
      closingNote:
        "The task was revised or reopened. Send a new review round for the updated work.",
    };
  return review;
}
