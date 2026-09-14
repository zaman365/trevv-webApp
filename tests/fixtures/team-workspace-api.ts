import { expect, type Route } from "@playwright/test";
import type {
  BoardDto,
  ConversationDto,
  ConversationMessageDto,
} from "@founderhq/api-contract";
import {
  board,
  members,
  session,
  teams,
  timestamp,
} from "../../apps/web/test-fixtures/live-workflow-data";
import {
  teamBoards,
  teamConversation,
  teamMessage,
} from "../../apps/web/test-fixtures/team-workspace-data";

export function teamWorkspaceApi() {
  const state = {
    teams: structuredClone(teams),
    boards: structuredClone(teamBoards),
    messages: [structuredClone(teamMessage)],
    conversations: [structuredClone(teamConversation)],
    denied: false,
    roomDenied: false,
    failNextMessage: false,
    messageKeys: [] as string[],
    memberWrites: [] as string[],
    plans: [] as BoardDto[],
    conversationCreates: 0,
  };
  const respond = async (
    route: Route,
    json: unknown,
    status = 200,
    version?: number,
  ) => {
    await route.fulfill({
      json,
      status,
      ...(version !== undefined
        ? {
            headers: {
              etag: `"${version}"`,
              "x-trevv-resource-version": String(version),
            },
          }
        : {}),
    });
    return true;
  };
  async function api(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (path === `/api/v1/workspaces/${board.workspaceId}/teams`)
      return state.denied
        ? respond(
            route,
            { error: { code: "forbidden", message: "Team access removed" } },
            403,
          )
        : respond(route, {
            teams: state.teams,
            availableMembers: members.map((member) => ({
              ...member.user,
              organizationRole: "member",
            })),
          });
    if (path === "/api/v1/boards" && method === "GET")
      return respond(route, state.boards);
    if (path === "/api/v1/boards" && method === "POST") {
      const input = request.postDataJSON();
      const saved: BoardDto = {
        ...board,
        ...input,
        id: `plan-${state.plans.length}`,
        createdAt: timestamp,
        updatedAt: timestamp,
        versionTag: timestamp,
      };
      state.boards.push(saved);
      state.plans.push(saved);
      return respond(route, saved, 201);
    }
    const existingBoard = state.boards.find(
      (entry) => path === `/api/v1/boards/${entry.id}`,
    );
    if (existingBoard) {
      if (method === "PATCH") {
        expect(request.headers()["if-match"]).toBe(
          `"${existingBoard.versionTag}"`,
        );
        Object.assign(existingBoard, request.postDataJSON(), {
          versionTag: "2026-09-13T12:00:00.000Z",
        });
        // The API omits cleared dates from BoardDto rather than returning null.
        if (existingBoard.startDate === null) delete existingBoard.startDate;
        if (existingBoard.endDate === null) delete existingBoard.endDate;
      }
      return respond(route, existingBoard);
    }
    const team = state.teams.find(
      (entry) =>
        path === `/api/v1/teams/${entry.id}` ||
        path.startsWith(`/api/v1/teams/${entry.id}/members/`),
    );
    if (team && method !== "GET") {
      expect(request.headers()["if-match"]).toBe(`"${team.version}"`);
      if (method === "PATCH") Object.assign(team, request.postDataJSON());
      else {
        const userId = path.split("/").at(-1)!;
        state.memberWrites.push(`${method}:${userId}`);
        const existing = team.members.find(
          (member) => member.user.id === userId,
        );
        if (method === "DELETE")
          team.members = team.members.filter(
            (member) => member.user.id !== userId,
          );
        else if (existing) existing.role = request.postDataJSON().role;
        else
          team.members.push({
            user: {
              ...members.find((member) => member.user.id === userId)!.user,
              organizationRole: "member",
            },
            role: request.postDataJSON().role,
            joinedAt: timestamp,
          });
      }
      team.version++;
      return respond(route, team, 200, team.version);
    }
    const conversation = state.conversations.find(
      (entry) => path === `/api/v1/conversations/${entry.id}`,
    );
    const changedMessage = state.messages.find((entry) =>
      path.startsWith(`/api/v1/messages/${entry.id}/`),
    );
    if (changedMessage) {
      expect(request.headers()["if-match"]).toBe(`"${changedMessage.version}"`);
      if (path.endsWith("/response"))
        changedMessage.responseState = request.postDataJSON().responseState;
      else {
        const emoji = decodeURIComponent(path.split("/").at(-1)!);
        changedMessage.reactions =
          method === "DELETE"
            ? []
            : [
                {
                  emoji,
                  userIds: [session.user.id],
                  reactedByCurrentUser: true,
                },
              ];
      }
      changedMessage.version++;
      return respond(route, changedMessage, 200, changedMessage.version);
    }
    if (conversation && method === "GET") {
      return state.roomDenied
        ? respond(
            route,
            { error: { code: "forbidden", message: "Room access removed" } },
            403,
          )
        : respond(route, conversation, 200, conversation.version);
    }
    if (path === `/api/v1/workspaces/${board.workspaceId}/conversations`) {
      if (method === "POST") {
        state.conversationCreates++;
        const input = request.postDataJSON();
        const next: ConversationDto = {
          ...teamConversation,
          ...input,
          id: "direct-new",
          participants: teamConversation.participants.filter((person) =>
            input.participantIds.includes(person.user.id),
          ),
        };
        delete next.teamId;
        state.conversations.push(next);
        return respond(route, next, 201, next.version);
      }
      return respond(route, { data: state.conversations, nextCursor: null });
    }
    const messageConversation = state.conversations.find(
      (entry) => path === `/api/v1/conversations/${entry.id}/messages`,
    );
    if (messageConversation) {
      if (state.roomDenied)
        return respond(
          route,
          { error: { code: "forbidden", message: "Room access removed" } },
          403,
        );
      if (method === "POST") {
        state.messageKeys.push(request.headers()["idempotency-key"]!);
        if (state.failNextMessage) {
          state.failNextMessage = false;
          return respond(
            route,
            {
              error: {
                code: "unavailable",
                message: "Please retry",
                requestId: "test-retry",
              },
            },
            503,
          );
        }
        const input = request.postDataJSON();
        const message: ConversationMessageDto = {
          ...teamMessage,
          ...input,
          conversationId: messageConversation.id,
          id: `message-${state.messages.length + 1}`,
          sequence: state.messages.length + 1,
          senderId: session.user.id,
          sender: { ...session.user, organizationRole: "owner" },
        };
        state.messages.push(message);
        return respond(route, message, 201, message.version);
      }
      const parent = url.searchParams.get("parentMessageId");
      return respond(route, {
        data: state.messages.filter(
          (entry) =>
            entry.conversationId === messageConversation.id &&
            (parent
              ? entry.parentMessageId === parent
              : !entry.parentMessageId),
        ),
        nextCursor: null,
      });
    }
    const readConversation = state.conversations.find(
      (entry) => path === `/api/v1/conversations/${entry.id}/read-checkpoint`,
    );
    if (readConversation) {
      const messageId = request.postDataJSON().messageId;
      const team = state.teams[0]!;
      if (team.room) team.room.unreadCount = 0;
      return respond(route, {
        conversationId: readConversation.id,
        userId: session.user.id,
        messageId,
        messageSequence: state.messages.find(
          (message) => message.id === messageId,
        )!.sequence,
        version: 1,
        readAt: timestamp,
      });
    }
    return false;
  }
  return { state, api };
}
