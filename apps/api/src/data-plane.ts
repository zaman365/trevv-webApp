import type {
  AttentionSignalDto,
  AttentionAction,
  ChangeRadarDto,
  CreateItemInput,
  ManagementMemoryDto,
  PortfolioDto,
  PortfolioResponse,
  SearchResultDto,
  Session,
  WaitingAction,
  WaitingStateDto,
  WeeklyReviewInput,
  WeeklyReviewResponse,
  WorkItemDto,
  WorkspaceDetailDto,
  WorkspaceDto,
  UpdateItemInput,
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
  getWorkspace(
    context: ApiRequestContext,
    slug: string,
  ): Promise<WorkspaceDetail>;
  listItems(
    context: ApiRequestContext,
    filters: {
      cursor?: string | undefined;
      workspaceId?: string | undefined;
      assigneeId?: string | undefined;
      limit: number;
    },
  ): Promise<PaginatedWorkItems>;
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
