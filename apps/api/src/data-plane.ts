import type {
  ApprovalTransitionInput,
  AssignWorkItemInput,
  AttentionSignalDto,
  AttentionAction,
  BlockWorkItemInput,
  BoardDto,
  CaptureInboxItemInput,
  ChangeRadarDto,
  CollaborationEventBatch,
  ConversationDto,
  ConversationMessageDto,
  ConversationReadCheckpointDto,
  ConvertInboxItemInput,
  ConvertedInboxItem,
  CreateBoardInput,
  CreateConversationInput,
  CreateConversationMessageInput,
  CreatePrivacyRequestInput,
  CreateItemInput,
  CreateTeamInput,
  CreateWaitingInput,
  CreateWorkspaceInput,
  DecisionTransitionInput,
  InboxItemDto,
  ManagementMemoryDto,
  OperationsStatusDto,
  DataLifecycleRequestDto,
  PrivacyProgramStatusDto,
  RetentionPolicyDto,
  PaginatedConversationMessages,
  PaginatedConversations,
  PortfolioDto,
  PortfolioResponse,
  Readiness,
  SearchResultDto,
  Session,
  ResolveWorkItemInput,
  SetTeamMemberInput,
  TeamDirectoryDto,
  TeamDto,
  UpdateInboxItemInput,
  WaitingAction,
  WaitingStateDto,
  WeeklyReviewInput,
  WeeklyReviewRecordDto,
  WeeklyReviewResponse,
  WorkItemEvidenceInput,
  WorkItemEvidenceMutation,
  WorkItemEvidenceDto,
  WorkItemHistoryEntryDto,
  WorkItemTransitionResponse,
  WorkItemDto,
  WorkspaceCreation,
  WorkspaceSnapshotDto,
  WorkspaceDetailDto,
  WorkspaceDto,
  UpdateItemInput,
  UpdateTeamInput,
  UpdateRetentionPolicyInput,
} from "@founderhq/api-contract";
import type { AccessContext } from "@founderhq/permissions";

export type ApiMode = "demo" | "live";

export interface ResolvedAccess {
  access: AccessContext;
  session: Session;
}

export interface AccessResolver {
  readonly mode: ApiMode;
  resolve(request: Request, requestId?: string): Promise<ResolvedAccess | null>;
}

export interface ApiRequestContext {
  access: AccessContext;
  requestId: string;
  now: Date;
  newId(): string;
}

export interface ApiMutationContext extends ApiRequestContext {
  method: string;
  route: string;
  requestFingerprint: string;
  responseStatus: number;
  idempotencyKey?: string;
}

export interface MutationResult<T> {
  value: T;
  replayed?: boolean;
}

export type WorkspaceDetail = WorkspaceDetailDto;

export interface PaginatedWorkItems {
  data: WorkItemDto[];
  nextCursor: string | null;
}

export type ManagementMemory = ManagementMemoryDto;
export type ChangeRadar = ChangeRadarDto;
export type SearchResult = SearchResultDto;

export interface ImportPreviewInput {
  preset: "generic_csv" | "monday" | "clickup" | "asana";
  headers: string[];
  rowCount: number;
}

export interface DataPlane {
  readonly mode: ApiMode;
  readiness(): Promise<Pick<Readiness, "database">>;
  listPortfolios(context: ApiRequestContext): Promise<PortfolioDto[]>;
  getPortfolio(
    context: ApiRequestContext,
    portfolioId?: string,
  ): Promise<PortfolioResponse>;
  listAttention(
    context: ApiRequestContext,
    filters: {
      portfolioId?: string | undefined;
      workspaceId?: string | undefined;
    },
  ): Promise<AttentionSignalDto[]>;
  actOnAttention(
    context: ApiMutationContext,
    id: string,
    expectedVersion: number,
    input: AttentionAction,
  ): Promise<MutationResult<AttentionSignalDto>>;
  listWaiting(context: ApiRequestContext): Promise<WaitingStateDto[]>;
  actOnWaiting(
    context: ApiMutationContext,
    id: string,
    expectedVersion: number,
    input: WaitingAction,
  ): Promise<MutationResult<WaitingStateDto>>;
  getChangeRadar(context: ApiRequestContext): Promise<ChangeRadar>;
  getManagementMemory(context: ApiRequestContext): Promise<ManagementMemory>;
  submitWeeklyReview(
    context: ApiMutationContext,
    input: WeeklyReviewInput,
  ): Promise<MutationResult<WeeklyReviewResponse>>;
  listInsights(context: ApiRequestContext): Promise<unknown>;
  listBlueprints(context: ApiRequestContext): Promise<unknown>;
  getTeamPressure(context: ApiRequestContext): Promise<unknown>;
  getEntitlements(context: ApiRequestContext): Promise<unknown>;
  previewImport(
    context: ApiRequestContext,
    input: ImportPreviewInput,
  ): Promise<unknown>;
  listWorkspaces(context: ApiRequestContext): Promise<WorkspaceDto[]>;
  createWorkspace(
    context: ApiMutationContext,
    input: CreateWorkspaceInput,
  ): Promise<MutationResult<WorkspaceCreation>>;
  getWorkspace(
    context: ApiRequestContext,
    slug: string,
  ): Promise<WorkspaceDetail>;
  listTeamDirectory(
    context: ApiRequestContext,
    workspaceId: string,
  ): Promise<TeamDirectoryDto>;
  getTeam(context: ApiRequestContext, id: string): Promise<TeamDto>;
  createTeam(
    context: ApiMutationContext,
    input: CreateTeamInput,
  ): Promise<MutationResult<TeamDto>>;
  updateTeam(
    context: ApiMutationContext,
    id: string,
    expectedVersion: number,
    input: UpdateTeamInput,
  ): Promise<MutationResult<TeamDto>>;
  setTeamMember(
    context: ApiMutationContext,
    teamId: string,
    userId: string,
    expectedVersion: number,
    input: SetTeamMemberInput,
  ): Promise<MutationResult<TeamDto>>;
  removeTeamMember(
    context: ApiMutationContext,
    teamId: string,
    userId: string,
    expectedVersion: number,
  ): Promise<MutationResult<TeamDto>>;
  listConversations(
    context: ApiRequestContext,
    filters: { workspaceId: string; cursor?: string; limit: number },
  ): Promise<PaginatedConversations>;
  getConversation(
    context: ApiRequestContext,
    id: string,
  ): Promise<ConversationDto>;
  createConversation(
    context: ApiMutationContext,
    input: CreateConversationInput,
  ): Promise<MutationResult<ConversationDto>>;
  setConversationParticipant(
    context: ApiMutationContext,
    conversationId: string,
    userId: string,
    expectedVersion: number,
    active: boolean,
    participantRole?: "member" | "owner",
  ): Promise<MutationResult<ConversationDto>>;
  listConversationMessages(
    context: ApiRequestContext,
    conversationId: string,
    filters: { cursor?: string; limit: number; parentMessageId?: string },
  ): Promise<PaginatedConversationMessages>;
  sendConversationMessage(
    context: ApiMutationContext,
    conversationId: string,
    input: CreateConversationMessageInput,
  ): Promise<MutationResult<ConversationMessageDto>>;
  updateMessageResponse(
    context: ApiMutationContext,
    messageId: string,
    expectedVersion: number,
    responseState: "open" | "resolved",
  ): Promise<MutationResult<ConversationMessageDto>>;
  addMessageReaction(
    context: ApiMutationContext,
    messageId: string,
    expectedVersion: number,
    emoji: string,
  ): Promise<MutationResult<ConversationMessageDto>>;
  removeMessageReaction(
    context: ApiMutationContext,
    messageId: string,
    expectedVersion: number,
    emoji: string,
  ): Promise<MutationResult<ConversationMessageDto>>;
  markConversationRead(
    context: ApiMutationContext,
    conversationId: string,
    messageId: string,
  ): Promise<MutationResult<ConversationReadCheckpointDto>>;
  listCollaborationEvents(
    context: ApiRequestContext,
    workspaceId: string,
    after: number,
  ): Promise<CollaborationEventBatch>;
  listBoards(
    context: ApiRequestContext,
    workspaceId: string,
  ): Promise<BoardDto[]>;
  getBoard(context: ApiRequestContext, id: string): Promise<BoardDto>;
  createBoard(
    context: ApiMutationContext,
    input: CreateBoardInput,
  ): Promise<MutationResult<BoardDto>>;
  listInbox(context: ApiRequestContext): Promise<InboxItemDto[]>;
  captureInboxItem(
    context: ApiMutationContext,
    input: CaptureInboxItemInput,
  ): Promise<MutationResult<InboxItemDto>>;
  updateInboxItem(
    context: ApiMutationContext,
    id: string,
    expectedVersion: number,
    input: UpdateInboxItemInput,
  ): Promise<MutationResult<InboxItemDto>>;
  convertInboxItem(
    context: ApiMutationContext,
    id: string,
    expectedVersion: number,
    input: ConvertInboxItemInput,
  ): Promise<MutationResult<ConvertedInboxItem>>;
  listItems(
    context: ApiRequestContext,
    filters: {
      cursor?: string | undefined;
      workspaceId?: string | undefined;
      assigneeId?: string | undefined;
      limit: number;
    },
  ): Promise<PaginatedWorkItems>;
  getItem(context: ApiRequestContext, id: string): Promise<WorkItemDto>;
  createItem(
    context: ApiMutationContext,
    input: CreateItemInput,
  ): Promise<MutationResult<WorkItemDto>>;
  updateItem(
    context: ApiMutationContext,
    id: string,
    expectedVersion: number,
    patch: UpdateItemInput,
  ): Promise<MutationResult<WorkItemDto>>;
  listItemHistory(
    context: ApiRequestContext,
    id: string,
  ): Promise<WorkItemHistoryEntryDto[]>;
  listItemEvidence(
    context: ApiRequestContext,
    id: string,
  ): Promise<WorkItemEvidenceDto[]>;
  addItemEvidence(
    context: ApiMutationContext,
    id: string,
    expectedVersion: number,
    input: WorkItemEvidenceInput,
  ): Promise<MutationResult<WorkItemEvidenceMutation>>;
  assignItem(
    context: ApiMutationContext,
    id: string,
    expectedVersion: number,
    input: AssignWorkItemInput,
  ): Promise<MutationResult<WorkItemTransitionResponse>>;
  setItemBlocked(
    context: ApiMutationContext,
    id: string,
    expectedVersion: number,
    input: BlockWorkItemInput,
  ): Promise<MutationResult<WorkItemTransitionResponse>>;
  transitionDecision(
    context: ApiMutationContext,
    id: string,
    expectedVersion: number,
    input: DecisionTransitionInput,
  ): Promise<MutationResult<WorkItemTransitionResponse>>;
  transitionApproval(
    context: ApiMutationContext,
    id: string,
    expectedVersion: number,
    input: ApprovalTransitionInput,
  ): Promise<MutationResult<WorkItemTransitionResponse>>;
  resolveItem(
    context: ApiMutationContext,
    id: string,
    expectedVersion: number,
    input: ResolveWorkItemInput,
  ): Promise<MutationResult<WorkItemTransitionResponse>>;
  createWaiting(
    context: ApiMutationContext,
    expectedItemVersion: number,
    input: CreateWaitingInput,
  ): Promise<MutationResult<WaitingStateDto>>;
  listWeeklyReviews(
    context: ApiRequestContext,
    workspaceId?: string,
  ): Promise<WeeklyReviewRecordDto[]>;
  listSnapshots(
    context: ApiRequestContext,
    filters: { portfolioId?: string; workspaceId?: string },
  ): Promise<WorkspaceSnapshotDto[]>;
  getOperationsStatus(context: ApiRequestContext): Promise<OperationsStatusDto>;
  getPrivacyProgram(
    context: ApiRequestContext,
  ): Promise<PrivacyProgramStatusDto>;
  listPrivacyRequests(
    context: ApiRequestContext,
  ): Promise<DataLifecycleRequestDto[]>;
  createPrivacyRequest(
    context: ApiMutationContext,
    input: CreatePrivacyRequestInput,
  ): Promise<MutationResult<DataLifecycleRequestDto>>;
  cancelPrivacyRequest(
    context: ApiMutationContext,
    id: string,
    expectedVersion: number,
  ): Promise<MutationResult<DataLifecycleRequestDto>>;
  updateRetentionPolicy(
    context: ApiMutationContext,
    expectedVersion: number,
    input: UpdateRetentionPolicyInput,
  ): Promise<MutationResult<RetentionPolicyDto>>;
  search(context: ApiRequestContext, query: string): Promise<SearchResult>;
  exportOrganization(context: ApiRequestContext): Promise<unknown>;
  exportBoardCsv(context: ApiRequestContext, boardId: string): Promise<string>;
}

export type DataPlaneErrorCode =
  | "resource_not_found"
  | "scope_mismatch"
  | "version_conflict"
  | "idempotency_key_reused"
  | "invitation_delivery_incomplete"
  | "identity_verification_required"
  | "onboarding_required"
  | "organization_selection_required"
  | "identity_access_unavailable"
  | "repository_unavailable"
  | "rate_limited"
  | "capability_unavailable";

export class DataPlaneError extends Error {
  constructor(
    readonly code: DataPlaneErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DataPlaneError";
  }
}

export function dataPlaneErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error))
    return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}
