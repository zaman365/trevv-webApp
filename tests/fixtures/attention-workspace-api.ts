import { expect, type Route } from "@playwright/test";
import type {
  AttentionAction,
  WeeklyReviewRecordDto,
} from "@founderhq/api-contract";
import { issueSignals } from "../../apps/web/test-fixtures/attention-workspace-data";
import {
  timestamp,
  session,
} from "../../apps/web/test-fixtures/live-workflow-data";
import { teamWorkspaceApi } from "./team-workspace-api";
import { teamMessage } from "../../apps/web/test-fixtures/team-workspace-data";

export function attentionWorkspaceApi() {
  const collaboration = teamWorkspaceApi();
  const state = {
    signals: structuredClone(issueSignals),
    denied: false,
    sourceDenied: false,
    failAction: false,
    malformedAction: false,
    conflict: false,
    actions: [] as Array<{
      id: string;
      input: AttentionAction;
      key: string;
      version: string;
    }>,
    reviews: [] as WeeklyReviewRecordDto[],
  };
  async function api(route: Route) {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/v1/attention") {
      await route.fulfill(
        state.denied
          ? {
              status: 403,
              json: {
                error: {
                  code: "forbidden",
                  message: "Access removed",
                  requestId: "test-denied",
                },
              },
            }
          : {
              json: state.signals.filter(
                (signal) =>
                  !signal.resolvedAt &&
                  !signal.dismissedAt &&
                  (!signal.snoozedUntil ||
                    Date.parse(signal.snoozedUntil) <= Date.now()),
              ),
            },
      );
      return true;
    }
    if (state.sourceDenied && path.startsWith("/api/v1/items/item-one")) {
      await route.fulfill({
        status: 403,
        json: {
          error: {
            code: "forbidden",
            message: "Source task access removed",
            requestId: "test-source-denied",
          },
        },
      });
      return true;
    }
    if (path.startsWith("/api/v1/attention/") && request.method() === "PATCH") {
      const signal = state.signals.find(
        (signal) => signal.id === path.split("/").at(-1),
      )!;
      const input = request.postDataJSON();
      state.actions.push({
        id: signal.id,
        input,
        key: request.headers()["idempotency-key"]!,
        version: request.headers()["if-match"]!,
      });
      expect(request.headers()["if-match"]).toBe(`"${signal.version}"`);
      if (state.failAction) {
        state.failAction = false;
        await route.fulfill({
          status: 503,
          json: {
            error: {
              code: "unavailable",
              message: "Try again",
              requestId: "test-retry",
            },
          },
        });
        return true;
      }
      if (state.conflict) {
        state.conflict = false;
        signal.version++;
        await route.fulfill({
          status: 409,
          json: {
            error: {
              code: "version_conflict",
              message: "Issue changed",
              requestId: "test-conflict",
            },
          },
        });
        return true;
      }
      signal.version++;
      Object.assign(
        signal,
        { actionReason: input.reason },
        input.action === "resolve"
          ? { resolvedAt: new Date().toISOString() }
          : input.action === "dismiss"
            ? { dismissedAt: new Date().toISOString() }
            : { snoozedUntil: input.snoozedUntil },
      );
      await route.fulfill({
        json: signal,
        ...(state.malformedAction
          ? {}
          : { headers: { etag: `"${signal.version}"` } }),
      });
      return true;
    }
    if (path === "/api/v1/reviews/weekly") {
      if (request.method() === "POST") {
        const input = request.postDataJSON();
        const update = {
          ...input,
          id: "review-one",
          author: { id: session.user.id, name: session.user.name },
          createdAt: timestamp,
          updatedAt: timestamp,
          publishedAt: timestamp,
        };
        state.reviews.push(update);
        state.signals = state.signals.filter(
          (signal) => signal.reasonCode !== "workspace.update_stale",
        );
        await route.fulfill({
          json: {
            update,
            snapshot: {
              id: "snapshot-one",
              organizationId: session.organization.id,
              portfolioId: "portfolio-one",
              workspaceId: input.workspaceId,
              capturedAt: timestamp,
              health: input.health,
              source: "weekly_review",
            },
            attentionRefreshQueued: true,
          },
        });
      } else await route.fulfill({ json: state.reviews });
      return true;
    }
    if (path === "/api/v1/snapshots") {
      await route.fulfill({ json: [] });
      return true;
    }
    if (
      path === "/api/v1/conversations/direct-new/messages" &&
      request.method() === "POST"
    ) {
      collaboration.state.messageKeys.push(
        request.headers()["idempotency-key"]!,
      );
      if (collaboration.state.failNextMessage) {
        collaboration.state.failNextMessage = false;
        await route.fulfill({
          status: 503,
          json: {
            error: {
              code: "unavailable",
              message: "Please retry",
              requestId: "test-message",
            },
          },
        });
        return true;
      }
      const message = {
        ...teamMessage,
        ...request.postDataJSON(),
        conversationId: "direct-new",
        id: "message-direct",
        sequence: 2,
      };
      collaboration.state.messages.push(message);
      await route.fulfill({
        status: 201,
        headers: { etag: '"1"' },
        json: message,
      });
      return true;
    }
    return collaboration.api(route);
  }
  return { state, collaboration: collaboration.state, api };
}
