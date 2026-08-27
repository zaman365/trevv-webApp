export type ConversationKind = "hub" | "team" | "direct" | "external";
export type MessageIntent = "message" | "request" | "decision" | "update";
export type ResponseState = "open" | "resolved";

export interface MessagingPerson {
  id: string;
  name: string;
  initials: string;
  role: string;
  color: string;
  presence: "online" | "away" | "offline";
  external?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  purpose: string;
  kind: ConversationKind;
  participantIds: string[];
  hubId?: string;
  hubSlug?: string;
  unread: number;
  pinned?: boolean;
  archived?: boolean;
  visibility: "organization" | "private" | "guest-scoped";
  lastActivity: string;
}

export interface MessageReaction {
  emoji: string;
  userIds: string[];
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  sentAt: string;
  intent: MessageIntent;
  parentId?: string;
  responseOwnerId?: string;
  responseDue?: string;
  responseState?: ResponseState;
  linkedWorkId?: string;
  linkedWorkTitle?: string;
  reactions: MessageReaction[];
  editedAt?: string;
}

export const currentMessagingUserId = "person-mohammed";

export const messagingPeople: MessagingPerson[] = [
  {
    id: currentMessagingUserId,
    name: "Mohammed Zaman",
    initials: "MZ",
    role: "Owner",
    color: "#5b5bd6",
    presence: "online",
  },
  {
    id: "person-nora",
    name: "Nora Klein",
    initials: "NK",
    role: "Product lead",
    color: "#b95043",
    presence: "online",
  },
  {
    id: "person-amira",
    name: "Amira Demir",
    initials: "AD",
    role: "Operations",
    color: "#505c73",
    presence: "online",
  },
  {
    id: "person-elias",
    name: "Elias Hart",
    initials: "EH",
    role: "Delivery lead",
    color: "#17846b",
    presence: "away",
  },
  {
    id: "person-jana",
    name: "Jana Roth",
    initials: "JR",
    role: "Studio lead",
    color: "#2b77b9",
    presence: "online",
  },
  {
    id: "person-tim",
    name: "Tim Bauer",
    initials: "TB",
    role: "Technical lead",
    color: "#1f8c94",
    presence: "offline",
  },
  {
    id: "person-lena",
    name: "Lena Weber",
    initials: "LW",
    role: "Northstar legal counsel",
    color: "#8d5c32",
    presence: "away",
    external: true,
  },
];

export const seedConversations: Conversation[] = [
  {
    id: "conversation-northstar-launch",
    title: "Northstar · Launch room",
    purpose: "Move the SS26 launch through decisions, evidence, and approvals.",
    kind: "hub",
    participantIds: [
      currentMessagingUserId,
      "person-nora",
      "person-amira",
      "person-elias",
    ],
    hubId: "hub-northstar",
    hubSlug: "northstar-apparel",
    unread: 3,
    pinned: true,
    visibility: "organization",
    lastActivity: "2026-08-27T09:42:00.000Z",
  },
  {
    id: "conversation-leadership",
    title: "Leadership decisions",
    purpose: "A low-noise room for choices that change priorities or risk.",
    kind: "team",
    participantIds: [currentMessagingUserId, "person-nora", "person-amira"],
    unread: 1,
    pinned: true,
    visibility: "private",
    lastActivity: "2026-08-27T08:30:00.000Z",
  },
  {
    id: "conversation-mealflow",
    title: "MealFlow · Beta",
    purpose: "Coordinate the restaurant beta without losing product context.",
    kind: "hub",
    participantIds: [currentMessagingUserId, "person-nora", "person-tim"],
    hubId: "hub-mealflow",
    hubSlug: "mealflow",
    unread: 2,
    visibility: "organization",
    lastActivity: "2026-08-26T16:18:00.000Z",
  },
  {
    id: "conversation-client-proof",
    title: "LocalReach · Client proof",
    purpose: "Share delivery evidence with the client in one scoped room.",
    kind: "external",
    participantIds: [currentMessagingUserId, "person-elias", "person-lena"],
    hubId: "hub-localreach",
    hubSlug: "localreach",
    unread: 0,
    visibility: "guest-scoped",
    lastActivity: "2026-08-26T13:04:00.000Z",
  },
  {
    id: "conversation-nora",
    title: "Nora Klein",
    purpose: "Direct conversation",
    kind: "direct",
    participantIds: [currentMessagingUserId, "person-nora"],
    unread: 0,
    visibility: "private",
    lastActivity: "2026-08-25T15:52:00.000Z",
  },
  {
    id: "conversation-amira",
    title: "Amira Demir",
    purpose: "Direct conversation",
    kind: "direct",
    participantIds: [currentMessagingUserId, "person-amira"],
    unread: 0,
    visibility: "private",
    lastActivity: "2026-08-24T11:10:00.000Z",
  },
];

export const seedMessages: ConversationMessage[] = [
  {
    id: "message-northstar-1",
    conversationId: "conversation-northstar-launch",
    senderId: "person-nora",
    body: "Polo photography is approved and the product pages are staged. The only launch blockers left are packaging copy and GPSR evidence.",
    sentAt: "2026-08-27T08:12:00.000Z",
    intent: "update",
    linkedWorkId: "i-4",
    linkedWorkTitle: "SS26 storefront launch",
    reactions: [
      { emoji: "🙌", userIds: [currentMessagingUserId, "person-elias"] },
    ],
  },
  {
    id: "message-northstar-2",
    conversationId: "conversation-northstar-launch",
    senderId: "person-amira",
    body: "I have the manufacturer declaration, but the address format conflicts with the packaging proof. Mohammed, can you confirm which legal entity line we should publish?",
    sentAt: "2026-08-27T08:47:00.000Z",
    intent: "request",
    responseOwnerId: currentMessagingUserId,
    responseDue: "2026-08-27T15:00:00.000Z",
    responseState: "open",
    linkedWorkId: "i-3",
    linkedWorkTitle: "Confirm GPSR manufacturer evidence",
    reactions: [],
  },
  {
    id: "message-northstar-3",
    conversationId: "conversation-northstar-launch",
    senderId: "person-elias",
    body: "The fit guide is ready for final copy review. I added the mobile crop and size-table notes to the work item.",
    sentAt: "2026-08-27T09:21:00.000Z",
    intent: "update",
    linkedWorkId: "i-5",
    linkedWorkTitle: "Publish polo fit guide",
    reactions: [{ emoji: "✅", userIds: ["person-nora"] }],
  },
  {
    id: "message-northstar-4",
    conversationId: "conversation-northstar-launch",
    senderId: currentMessagingUserId,
    body: "Let’s keep the launch offer simple: free EU shipping for the first 72 hours. Nora, please run the margin check before we lock it.",
    sentAt: "2026-08-27T09:42:00.000Z",
    intent: "decision",
    responseOwnerId: "person-nora",
    responseDue: "2026-08-27T13:00:00.000Z",
    responseState: "open",
    linkedWorkId: "i-2",
    linkedWorkTitle: "Choose storefront launch offer",
    reactions: [],
  },
  {
    id: "reply-northstar-4-1",
    conversationId: "conversation-northstar-launch",
    senderId: "person-nora",
    body: "Running it now. I’ll add the final contribution margin here before lunch.",
    sentAt: "2026-08-27T09:48:00.000Z",
    intent: "message",
    parentId: "message-northstar-4",
    reactions: [],
  },
  {
    id: "message-leadership-1",
    conversationId: "conversation-leadership",
    senderId: "person-amira",
    body: "GreenTable is pulling delivery capacity into a pilot with no single success measure. Should we pause the expanded scope until the owner chooses one outcome?",
    sentAt: "2026-08-27T08:30:00.000Z",
    intent: "decision",
    responseOwnerId: currentMessagingUserId,
    responseDue: "2026-08-28T10:00:00.000Z",
    responseState: "open",
    linkedWorkId: "i-14",
    linkedWorkTitle: "Choose single pilot outcome",
    reactions: [],
  },
  {
    id: "message-mealflow-1",
    conversationId: "conversation-mealflow",
    senderId: "person-nora",
    body: "Usability sessions strongly favor the guided onboarding. I need a final call between a left rail and a step-by-step header before engineering starts tomorrow.",
    sentAt: "2026-08-26T14:24:00.000Z",
    intent: "request",
    responseOwnerId: currentMessagingUserId,
    responseDue: "2026-08-27T12:00:00.000Z",
    responseState: "open",
    linkedWorkId: "i-6",
    linkedWorkTitle: "Select onboarding navigation",
    reactions: [],
  },
  {
    id: "message-mealflow-2",
    conversationId: "conversation-mealflow",
    senderId: "person-tim",
    body: "Permissions fix is isolated. I can ship today after the owner-dashboard review clears the role model.",
    sentAt: "2026-08-26T16:18:00.000Z",
    intent: "update",
    linkedWorkId: "i-8",
    linkedWorkTitle: "Fix onboarding permissions",
    reactions: [{ emoji: "👍", userIds: ["person-nora"] }],
  },
  {
    id: "message-client-1",
    conversationId: "conversation-client-proof",
    senderId: "person-elias",
    body: "The storefront repair is live. I attached the before/after evidence to the delivery item and scheduled a seven-day follow-up.",
    sentAt: "2026-08-26T13:04:00.000Z",
    intent: "update",
    linkedWorkId: "i-10",
    linkedWorkTitle: "Client storefront repair",
    reactions: [{ emoji: "✅", userIds: ["person-lena"] }],
  },
  {
    id: "message-nora-1",
    conversationId: "conversation-nora",
    senderId: "person-nora",
    body: "I moved tomorrow’s beta review to 10:30 so Tim can join. No action needed.",
    sentAt: "2026-08-25T15:52:00.000Z",
    intent: "message",
    reactions: [],
  },
  {
    id: "message-amira-1",
    conversationId: "conversation-amira",
    senderId: "person-amira",
    body: "The Q3 evidence review has two supplier declarations left. I’ll escalate if neither lands by Friday.",
    sentAt: "2026-08-24T11:10:00.000Z",
    intent: "update",
    reactions: [],
  },
];

export function personById(id: string): MessagingPerson {
  return (
    messagingPeople.find((person) => person.id === id) ?? messagingPeople[0]!
  );
}
