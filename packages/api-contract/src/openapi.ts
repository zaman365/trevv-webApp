export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "TREVV API",
    version: "2.0.0",
    description:
      "Versioned, permission-scoped contracts shared by the TREVV Web, Mobile, and Desktop clients. Health, this OpenAPI document, and provider-managed /api/auth/* endpoints are public. In live mode every product request derives its user, selected organization, role, and managed scopes from a Better Auth session and active PostgreSQL memberships.",
  },
  servers: [{ url: "http://localhost:8787", description: "Local API" }],
  security: [{ SessionCookie: [] }],
  tags: [
    { name: "System" },
    { name: "Identity" },
    { name: "Organization" },
    { name: "Portfolio" },
    { name: "Attention" },
    { name: "Waiting" },
    { name: "Management Memory" },
    { name: "Reviews" },
    { name: "Insights" },
    { name: "Blueprints" },
    { name: "Commercial" },
    { name: "Workspaces" },
    { name: "Teams" },
    { name: "Messages" },
    { name: "Boards" },
    { name: "Inbox" },
    { name: "Items" },
    { name: "Operations" },
    { name: "Privacy" },
    { name: "Search" },
    { name: "Exports" },
    { name: "Events" },
  ],
  paths: {
    "/api/v1/health": {
      get: {
        security: [],
        tags: ["System"],
        operationId: "health",
        responses: {
          "200": {
            description: "Service health",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Health" },
              },
            },
          },
        },
      },
    },
    "/api/v1/readyz": {
      get: {
        security: [],
        tags: ["System"],
        operationId: "readiness",
        description:
          "Reports whether the API can serve its configured data plane and identifies the packaged release artifact. Live mode probes PostgreSQL; demo or source-mode development may report null release metadata when no deployed artifact exists.",
        responses: {
          "200": {
            description: "The configured data plane is ready",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Readiness" },
              },
            },
          },
          "503": {
            description: "The configured live data plane is unavailable",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Readiness" },
              },
            },
          },
        },
      },
    },
    "/openapi.json": {
      get: {
        security: [],
        tags: ["System"],
        operationId: "getOpenApiDocument",
        responses: {
          "200": {
            description: "This public OpenAPI document",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OpenApiDocument" },
              },
            },
          },
        },
      },
    },
    "/api/v1/session": {
      get: {
        tags: ["System"],
        operationId: "getSession",
        responses: {
          "200": {
            description: "Current session",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Session" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "409": { $ref: "#/components/responses/Conflict" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/session/organizations": {
      get: {
        tags: ["Identity"],
        operationId: "listSessionOrganizations",
        description:
          "List only the active organizations derived from the authenticated identity's server-side memberships, for selecting an active organization.",
        responses: {
          "200": {
            description: "Active organization choices",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  minItems: 1,
                  maxItems: 100,
                  items: {
                    $ref: "#/components/schemas/OrganizationSummary",
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "409": { $ref: "#/components/responses/Conflict" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/session/organization": {
      post: {
        tags: ["Identity"],
        operationId: "selectOrganization",
        description:
          "Persist a server-validated active organization selection. The requested identifier is never used as authorization context until membership is verified.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OrganizationSelection" },
            },
          },
        },
        responses: {
          "200": {
            description: "Session with the validated organization selected",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Session" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "422": { $ref: "#/components/responses/Validation" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/onboarding": {
      get: {
        tags: ["Identity"],
        operationId: "getOnboarding",
        responses: {
          "200": {
            description: "Recoverable onboarding progress",
            headers: { ETag: { $ref: "#/components/headers/ETag" } },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OnboardingState" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
      put: {
        tags: ["Identity"],
        operationId: "saveOnboarding",
        parameters: [{ $ref: "#/components/parameters/IfMatch" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OnboardingDraft" },
            },
          },
        },
        responses: {
          "200": {
            description: "Durably saved onboarding progress",
            headers: { ETag: { $ref: "#/components/headers/ETag" } },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OnboardingState" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/onboarding/complete": {
      post: {
        tags: ["Identity"],
        operationId: "completeOnboarding",
        parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CompleteOnboarding" },
            },
          },
        },
        responses: {
          "201": {
            description:
              "Application user, owner membership, default Portfolio, first Workspace, starter board, and Blueprint committed atomically",
            headers: {
              ETag: { $ref: "#/components/headers/ETag" },
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OnboardingState" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/invitations": {
      get: {
        tags: ["Organization"],
        operationId: "listInvitations",
        responses: {
          "200": {
            description:
              "Sanitized organization invitations without tokens or hashes",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Invitation" },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
      post: {
        tags: ["Organization"],
        operationId: "createInvitation",
        parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateInvitation" },
            },
          },
        },
        responses: {
          "201": {
            description:
              "Durable invitation record. deliveryStatus truthfully reports whether email delivery succeeded.",
            headers: {
              ETag: { $ref: "#/components/headers/ETag" },
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Invitation" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/invitations/{id}/resend": {
      post: {
        tags: ["Organization"],
        operationId: "resendInvitation",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        responses: {
          "200": {
            description: "Rotated one-time token and current delivery result",
            headers: {
              ETag: { $ref: "#/components/headers/ETag" },
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Invitation" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/invitations/{id}": {
      delete: {
        tags: ["Organization"],
        operationId: "revokeInvitation",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        responses: {
          "200": {
            description: "Revoked invitation",
            headers: {
              ETag: { $ref: "#/components/headers/ETag" },
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Invitation" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/invitations/accept": {
      post: {
        tags: ["Identity"],
        operationId: "acceptInvitation",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AcceptInvitation" },
            },
          },
        },
        responses: {
          "200": {
            description:
              "One-time invitation acceptance and membership creation",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/InvitationAcceptance" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "422": { $ref: "#/components/responses/Validation" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/memberships": {
      get: {
        tags: ["Organization"],
        operationId: "listMemberships",
        responses: {
          "200": {
            description: "Active organization memberships",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Membership" },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/memberships/{userId}": {
      patch: {
        tags: ["Organization"],
        operationId: "updateMembership",
        parameters: [
          {
            name: "userId",
            in: "path",
            required: true,
            schema: { type: "string", minLength: 3, maxLength: 128 },
          },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateMembership" },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated role or active state",
            headers: {
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Membership" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/portfolio": {
      get: {
        tags: ["Portfolio"],
        operationId: "getPortfolio",
        parameters: [
          {
            name: "portfolioId",
            in: "query",
            required: false,
            schema: { type: "string", minLength: 3, maxLength: 128 },
          },
        ],
        responses: {
          "200": {
            description: "Accessible Portfolio roll-up",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PortfolioResponse" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/portfolios": {
      get: {
        tags: ["Portfolio"],
        operationId: "listPortfolios",
        responses: {
          "200": {
            description: "Accessible Portfolios",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Portfolio" },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/attention": {
      get: {
        tags: ["Attention"],
        operationId: "listAttentionSignals",
        parameters: [
          { name: "portfolioId", in: "query", schema: { type: "string" } },
          {
            name: "workspaceId",
            in: "query",
            description: "Limit signals to one accessible Workspace.",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Active explainable Attention signals",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/AttentionSignal" },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/attention/{id}": {
      patch: {
        tags: ["Attention"],
        operationId: "actOnAttentionSignal",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/OptionalIdempotencyKey" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AttentionAction" },
            },
          },
        },
        responses: {
          "200": {
            description: "Resolved, dismissed, or snoozed signal",
            headers: {
              ETag: { $ref: "#/components/headers/ETag" },
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AttentionSignal" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/waiting": {
      get: {
        tags: ["Waiting"],
        operationId: "listWaitingStates",
        responses: {
          "200": {
            description: "Accessible active waiting states",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/WaitingState" },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
      post: {
        tags: ["Waiting"],
        operationId: "createWaitingState",
        parameters: [
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateWaitingState" },
            },
          },
        },
        responses: {
          "201": {
            description: "Durably created Waiting state and bumped WorkItem",
            headers: {
              ETag: { $ref: "#/components/headers/ETag" },
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WaitingState" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/waiting/{id}": {
      patch: {
        tags: ["Waiting"],
        operationId: "updateWaitingState",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/OptionalIdempotencyKey" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/WaitingAction" },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated waiting state",
            headers: {
              ETag: { $ref: "#/components/headers/ETag" },
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WaitingState" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/change-radar": {
      get: {
        tags: ["Management Memory"],
        operationId: "getChangeRadar",
        responses: {
          "200": {
            description: "Meaningful changes since the user checkpoint",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ChangeRadar" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/management-memory": {
      get: {
        tags: ["Management Memory"],
        operationId: "getManagementMemory",
        responses: {
          "200": {
            description: "Snapshots, review rituals, and decision outcomes",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ManagementMemory" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/reviews/weekly": {
      get: {
        tags: ["Reviews"],
        operationId: "listWeeklyReviews",
        parameters: [
          { name: "workspaceId", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Accessible durable weekly-review history",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/WeeklyReviewRecord" },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "422": { $ref: "#/components/responses/Validation" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
      post: {
        tags: ["Reviews"],
        operationId: "submitWeeklyReview",
        parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/WeeklyReviewInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Durably recorded weekly review",
            headers: {
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WeeklyReviewResponse" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/snapshots": {
      get: {
        tags: ["Reviews"],
        operationId: "listWorkspaceSnapshots",
        parameters: [
          { name: "portfolioId", in: "query", schema: { type: "string" } },
          { name: "workspaceId", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Accessible durable Workspace snapshots",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/WorkspaceSnapshot" },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "422": { $ref: "#/components/responses/Validation" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/operations/status": {
      get: {
        tags: ["Operations"],
        operationId: "getOperationsStatus",
        responses: {
          "200": {
            description: "Tenant-scoped outbox processing status for managers",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OperationsStatus" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "429": { $ref: "#/components/responses/RateLimited" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/privacy": {
      get: {
        tags: ["Privacy"],
        operationId: "getPrivacyProgram",
        description:
          "Returns the versioned data inventory, effective retention policies, pending legal-review status, and an explicit no-provider posture.",
        responses: {
          "200": {
            description: "Tenant privacy program and effective policy metadata",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PrivacyProgramStatus" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "429": { $ref: "#/components/responses/RateLimited" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/privacy/requests": {
      get: {
        tags: ["Privacy"],
        operationId: "listPrivacyRequests",
        description:
          "Members see their own requests; organization managers see all tenant requests. No response implies that an external or destructive effect has completed.",
        responses: {
          "200": {
            description: "Visible privacy and data-lifecycle requests",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/DataLifecycleRequest",
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "429": { $ref: "#/components/responses/RateLimited" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
      post: {
        tags: ["Privacy"],
        operationId: "createPrivacyRequest",
        description:
          "Submits a reviewed workflow request. HTTP 202 means accepted for review, not exported, erased, revoked, or otherwise completed.",
        parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreatePrivacyRequest" },
            },
          },
        },
        responses: {
          "202": {
            description: "Submitted for review; no effect has yet been applied",
            headers: {
              ETag: { $ref: "#/components/headers/ETag" },
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DataLifecycleRequest",
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "429": { $ref: "#/components/responses/RateLimited" },
          "501": { $ref: "#/components/responses/CapabilityUnavailable" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/privacy/requests/{id}": {
      delete: {
        tags: ["Privacy"],
        operationId: "cancelPrivacyRequest",
        description:
          "Cancels the current user's submitted or under-review request before processing starts.",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        responses: {
          "200": {
            description: "Request cancellation recorded durably",
            headers: {
              ETag: { $ref: "#/components/headers/ETag" },
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DataLifecycleRequest",
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
          "429": { $ref: "#/components/responses/RateLimited" },
          "501": { $ref: "#/components/responses/CapabilityUnavailable" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/privacy/retention": {
      put: {
        tags: ["Privacy"],
        operationId: "updateRetentionPolicy",
        description:
          "Records a versioned, currently unenforced tenant retention policy. It does not alter the separate message-level expiry workflow. Any future destructive processor must enforce legal holds before acting.",
        parameters: [
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateRetentionPolicy",
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Versioned organization retention policy record; no disposition is currently enforced",
            headers: {
              ETag: { $ref: "#/components/headers/ETag" },
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RetentionPolicy" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
          "429": { $ref: "#/components/responses/RateLimited" },
          "501": { $ref: "#/components/responses/CapabilityUnavailable" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/insights": {
      get: {
        tags: ["Insights"],
        operationId: "listInsights",
        responses: {
          "200": {
            description: "Permission-filtered demo operational evidence",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Insight" },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "501": { $ref: "#/components/responses/CapabilityUnavailable" },
        },
      },
    },
    "/api/v1/blueprints": {
      get: {
        tags: ["Blueprints"],
        operationId: "listBlueprints",
        responses: {
          "200": {
            description:
              "Demo Blueprint versions, instances, and safe update preview",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/BlueprintResponse" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "501": { $ref: "#/components/responses/CapabilityUnavailable" },
        },
      },
    },
    "/api/v1/team/pressure": {
      get: {
        tags: ["Attention"],
        operationId: "getTeamPressure",
        responses: {
          "200": {
            description: "Demo cross-Workspace capacity evidence",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/ResourcePressure" },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "501": { $ref: "#/components/responses/CapabilityUnavailable" },
        },
      },
    },
    "/api/v1/entitlements": {
      get: {
        tags: ["Commercial"],
        operationId: "getEntitlements",
        responses: {
          "200": {
            description: "Demo capability entitlement set",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/EntitlementSet" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "501": { $ref: "#/components/responses/CapabilityUnavailable" },
        },
      },
    },
    "/api/v1/import/preview": {
      post: {
        tags: ["Commercial"],
        operationId: "previewImport",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ImportPreviewInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Demo dry-run mapping and unsupported-data report",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ImportPreview" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "422": { $ref: "#/components/responses/Validation" },
          "501": { $ref: "#/components/responses/CapabilityUnavailable" },
        },
      },
    },
    "/api/v1/workspaces": {
      get: {
        tags: ["Workspaces"],
        operationId: "listWorkspaces",
        responses: {
          "200": {
            description: "Accessible Workspaces",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Workspace" },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
      post: {
        tags: ["Workspaces"],
        operationId: "createWorkspace",
        parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateWorkspace" },
            },
          },
        },
        responses: {
          "201": {
            description: "Atomically created Workspace and starter Board",
            headers: {
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WorkspaceCreation" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/workspaces/{slug}": {
      get: {
        tags: ["Workspaces"],
        operationId: "getWorkspace",
        parameters: [{ $ref: "#/components/parameters/WorkspaceSlug" }],
        responses: {
          "200": {
            description: "Workspace overview and accessible work",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WorkspaceDetail" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/workspaces/{workspaceId}/teams": {
      get: {
        tags: ["Teams"],
        operationId: "listTeams",
        parameters: [{ $ref: "#/components/parameters/WorkspaceId" }],
        responses: {
          "200": {
            description:
              "Teams and assignable active members in the accessible Workspace",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TeamDirectory" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
      post: {
        tags: ["Teams"],
        operationId: "createTeam",
        description:
          "Atomically creates a Team, its feature preset, members, and its single private Team room. Feature presets never grant data access.",
        parameters: [
          { $ref: "#/components/parameters/WorkspaceId" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateTeam" },
            },
          },
        },
        responses: {
          "201": {
            description: "Durable Team and synchronized Team room",
            headers: {
              ETag: { $ref: "#/components/headers/ETag" },
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Team" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/teams/{id}": {
      get: {
        tags: ["Teams"],
        operationId: "getTeam",
        parameters: [{ $ref: "#/components/parameters/ItemId" }],
        responses: {
          "200": {
            description: "Permission-filtered Team detail",
            headers: { ETag: { $ref: "#/components/headers/ETag" } },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Team" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        tags: ["Teams"],
        operationId: "updateTeam",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateTeam" },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated Team and synchronized Team-room metadata",
            headers: { ETag: { $ref: "#/components/headers/ETag" } },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Team" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
        },
      },
    },
    "/api/v1/teams/{teamId}/members/{userId}": {
      put: {
        tags: ["Teams"],
        operationId: "setTeamMember",
        parameters: [
          { $ref: "#/components/parameters/TeamId" },
          { $ref: "#/components/parameters/UserId" },
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SetTeamMember" },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Team with Team room participation synchronized atomically",
            headers: { ETag: { $ref: "#/components/headers/ETag" } },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Team" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
        },
      },
      delete: {
        tags: ["Teams"],
        operationId: "removeTeamMember",
        parameters: [
          { $ref: "#/components/parameters/TeamId" },
          { $ref: "#/components/parameters/UserId" },
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        responses: {
          "200": {
            description:
              "Team with the member removed from the Team room atomically",
            headers: { ETag: { $ref: "#/components/headers/ETag" } },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Team" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
        },
      },
    },
    "/api/v1/workspaces/{workspaceId}/conversations": {
      get: {
        tags: ["Messages"],
        operationId: "listConversations",
        parameters: [
          { $ref: "#/components/parameters/WorkspaceId" },
          { $ref: "#/components/parameters/Cursor" },
          { $ref: "#/components/parameters/PageLimit" },
        ],
        responses: {
          "200": {
            description:
              "Workspace, Team, room, and direct conversations visible to the current participant",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/PaginatedConversations",
                },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      post: {
        tags: ["Messages"],
        operationId: "createConversation",
        parameters: [
          { $ref: "#/components/parameters/WorkspaceId" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateConversation" },
            },
          },
        },
        responses: {
          "201": {
            description: "Durable contextual conversation",
            headers: { ETag: { $ref: "#/components/headers/ETag" } },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Conversation" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
        },
      },
    },
    "/api/v1/conversations/{id}": {
      get: {
        tags: ["Messages"],
        operationId: "getConversation",
        parameters: [{ $ref: "#/components/parameters/ItemId" }],
        responses: {
          "200": {
            description: "Participant-authorized conversation",
            headers: { ETag: { $ref: "#/components/headers/ETag" } },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Conversation" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/v1/conversations/{id}/participants/{userId}": {
      put: {
        tags: ["Messages"],
        operationId: "setConversationParticipant",
        description:
          "Adds or restores a participant in a mutable Workspace or external room. Team-room membership is managed through Teams and direct-room membership is immutable.",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          { $ref: "#/components/parameters/UserId" },
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["participantRole"],
                additionalProperties: false,
                properties: {
                  participantRole: {
                    type: "string",
                    enum: ["member", "owner"],
                    default: "member",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Versioned participant addition",
            headers: { ETag: { $ref: "#/components/headers/ETag" } },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Conversation" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
        },
      },
      delete: {
        tags: ["Messages"],
        operationId: "removeConversationParticipant",
        description:
          "Removes a participant from a mutable Workspace or external room without leaking inaccessible room membership.",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          { $ref: "#/components/parameters/UserId" },
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        responses: {
          "200": {
            description: "Versioned participant removal",
            headers: { ETag: { $ref: "#/components/headers/ETag" } },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Conversation" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
        },
      },
    },
    "/api/v1/conversations/{id}/messages": {
      get: {
        tags: ["Messages"],
        operationId: "listConversationMessages",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          { $ref: "#/components/parameters/Cursor" },
          { $ref: "#/components/parameters/PageLimit" },
          { $ref: "#/components/parameters/ParentMessageId" },
        ],
        responses: {
          "200": {
            description: "Cursor-paginated contextual messages",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/PaginatedConversationMessages",
                },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      post: {
        tags: ["Messages"],
        operationId: "sendConversationMessage",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateMessage" },
            },
          },
        },
        responses: {
          "201": {
            description: "Idempotently persisted message",
            headers: { ETag: { $ref: "#/components/headers/ETag" } },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Message" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
        },
      },
    },
    "/api/v1/messages/{id}/response": {
      patch: {
        tags: ["Messages"],
        operationId: "updateMessageResponse",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateMessageResponse" },
            },
          },
        },
        responses: {
          "200": {
            description: "Versioned request or decision response",
            headers: { ETag: { $ref: "#/components/headers/ETag" } },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Message" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
        },
      },
    },
    "/api/v1/messages/{id}/reactions/{emoji}": {
      put: {
        tags: ["Messages"],
        operationId: "addMessageReaction",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          { $ref: "#/components/parameters/Emoji" },
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        responses: {
          "200": {
            description: "Versioned reaction update",
            headers: { ETag: { $ref: "#/components/headers/ETag" } },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Message" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
        },
      },
      delete: {
        tags: ["Messages"],
        operationId: "removeMessageReaction",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          { $ref: "#/components/parameters/Emoji" },
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        responses: {
          "200": {
            description: "Versioned reaction removal",
            headers: { ETag: { $ref: "#/components/headers/ETag" } },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Message" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
        },
      },
    },
    "/api/v1/conversations/{id}/read-checkpoint": {
      put: {
        tags: ["Messages"],
        operationId: "markConversationRead",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MarkConversationRead" },
            },
          },
        },
        responses: {
          "200": {
            description: "Monotonic read checkpoint",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReadCheckpoint" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
        },
      },
    },
    "/api/v1/boards": {
      get: {
        tags: ["Boards"],
        operationId: "listBoards",
        parameters: [
          {
            name: "workspaceId",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Boards in an accessible Workspace",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Board" },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "422": { $ref: "#/components/responses/Validation" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
      post: {
        tags: ["Boards"],
        operationId: "createBoard",
        parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateBoard" },
            },
          },
        },
        responses: {
          "201": {
            description: "Durably created Board",
            headers: {
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Board" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/boards/{id}": {
      get: {
        tags: ["Boards"],
        operationId: "getBoard",
        parameters: [{ $ref: "#/components/parameters/ItemId" }],
        responses: {
          "200": {
            description: "Accessible Board",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Board" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/inbox": {
      get: {
        tags: ["Inbox"],
        operationId: "listInbox",
        responses: {
          "200": {
            description: "Current user's durable Inbox",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/InboxItem" },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
      post: {
        tags: ["Inbox"],
        operationId: "captureInboxItem",
        parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CaptureInboxItem" },
            },
          },
        },
        responses: {
          "201": {
            description: "Durably captured Inbox item",
            headers: {
              ETag: { $ref: "#/components/headers/ETag" },
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/InboxItem" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/inbox/{id}": {
      patch: {
        tags: ["Inbox"],
        operationId: "updateInboxItem",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateInboxItem" },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated Inbox item",
            headers: {
              ETag: { $ref: "#/components/headers/ETag" },
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/InboxItem" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/inbox/{id}/convert": {
      post: {
        tags: ["Inbox"],
        operationId: "convertInboxItem",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ConvertInboxItem" },
            },
          },
        },
        responses: {
          "201": {
            description: "Atomically converted Inbox item to WorkItem",
            headers: {
              ETag: { $ref: "#/components/headers/ETag" },
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ConvertedInboxItem" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/items": {
      get: {
        tags: ["Items"],
        operationId: "listItems",
        parameters: [
          { name: "cursor", in: "query", schema: { type: "string" } },
          {
            name: "workspaceId",
            in: "query",
            schema: { type: "string" },
          },
          { name: "assigneeId", in: "query", schema: { type: "string" } },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
          },
        ],
        responses: {
          "200": {
            description: "Permission-filtered, cursor-paginated work items",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaginatedItems" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "422": { $ref: "#/components/responses/Validation" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
      post: {
        tags: ["Items"],
        operationId: "createItem",
        parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/WorkItemInput" },
            },
          },
        },
        responses: {
          "201": {
            description:
              "Created work item or exact replay of the original create",
            headers: {
              ETag: { $ref: "#/components/headers/ETag" },
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WorkItem" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/items/{id}": {
      get: {
        tags: ["Items"],
        operationId: "getItem",
        parameters: [{ $ref: "#/components/parameters/ItemId" }],
        responses: {
          "200": {
            description: "Canonical accessible WorkItem",
            headers: { ETag: { $ref: "#/components/headers/ETag" } },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WorkItem" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
      patch: {
        tags: ["Items"],
        operationId: "updateItem",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/OptionalIdempotencyKey" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/WorkItemPatch" },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated work item",
            headers: {
              ETag: { $ref: "#/components/headers/ETag" },
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WorkItem" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/items/{id}/history": {
      get: {
        tags: ["Items"],
        operationId: "listItemHistory",
        parameters: [{ $ref: "#/components/parameters/ItemId" }],
        responses: {
          "200": {
            description: "Durable WorkItem state and evidence history",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/WorkItemHistory" },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/items/{id}/evidence": {
      get: {
        tags: ["Items"],
        operationId: "listItemEvidence",
        parameters: [{ $ref: "#/components/parameters/ItemId" }],
        responses: {
          "200": {
            description: "Durable evidence attached to a WorkItem",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/WorkItemEvidence" },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
      post: {
        tags: ["Items"],
        operationId: "addItemEvidence",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/WorkItemEvidenceInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Durably recorded evidence",
            headers: {
              ETag: { $ref: "#/components/headers/ETag" },
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/WorkItemEvidenceMutation",
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/items/{id}/assignees": {
      put: {
        tags: ["Items"],
        operationId: "assignItem",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AssignWorkItem" },
            },
          },
        },
        responses: {
          "200": {
            description: "Atomically changed WorkItem assignment",
            headers: {
              ETag: { $ref: "#/components/headers/ETag" },
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WorkItemTransition" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
          "429": { $ref: "#/components/responses/RateLimited" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/items/{id}/block": {
      post: {
        tags: ["Items"],
        operationId: "setItemBlocked",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BlockWorkItem" },
            },
          },
        },
        responses: {
          "200": {
            description: "Atomically blocked or unblocked WorkItem",
            headers: {
              ETag: { $ref: "#/components/headers/ETag" },
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WorkItemTransition" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
          "429": { $ref: "#/components/responses/RateLimited" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/items/{id}/decision": {
      post: {
        tags: ["Items"],
        operationId: "transitionDecision",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/DecisionTransition" },
            },
          },
        },
        responses: {
          "200": {
            description: "Atomically changed decision state and evidence",
            headers: {
              ETag: { $ref: "#/components/headers/ETag" },
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WorkItemTransition" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
          "429": { $ref: "#/components/responses/RateLimited" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/items/{id}/approval": {
      post: {
        tags: ["Items"],
        operationId: "transitionApproval",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApprovalTransition" },
            },
          },
        },
        responses: {
          "200": {
            description: "Atomically changed approval state and evidence",
            headers: {
              ETag: { $ref: "#/components/headers/ETag" },
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WorkItemTransition" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
          "429": { $ref: "#/components/responses/RateLimited" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/items/{id}/resolve": {
      post: {
        tags: ["Items"],
        operationId: "resolveItem",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ResolveWorkItem" },
            },
          },
        },
        responses: {
          "200": {
            description: "Atomically resolved WorkItem with evidence",
            headers: {
              ETag: { $ref: "#/components/headers/ETag" },
              "Idempotency-Key": {
                $ref: "#/components/headers/IdempotencyKey",
              },
              "Idempotency-Replayed": {
                $ref: "#/components/headers/IdempotencyReplayed",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WorkItemTransition" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/Validation" },
          "428": { $ref: "#/components/responses/PreconditionRequired" },
          "429": { $ref: "#/components/responses/RateLimited" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/search": {
      get: {
        tags: ["Search"],
        operationId: "search",
        parameters: [
          {
            name: "q",
            in: "query",
            required: true,
            schema: { type: "string", minLength: 2, maxLength: 200 },
          },
        ],
        responses: {
          "200": {
            description: "Permission-filtered Workspace and item results",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SearchResult" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "422": { $ref: "#/components/responses/Validation" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
    "/api/v1/export/organization.json": {
      get: {
        tags: ["Exports"],
        operationId: "exportOrganization",
        responses: {
          "200": {
            description: "Demo organization JSON export",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OrganizationExport" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "501": { $ref: "#/components/responses/CapabilityUnavailable" },
        },
      },
    },
    "/api/v1/export/board/{boardId}.csv": {
      get: {
        tags: ["Exports"],
        operationId: "exportBoardCsv",
        parameters: [
          {
            name: "boardId",
            in: "path",
            required: true,
            schema: { type: "string", minLength: 3, maxLength: 128 },
          },
        ],
        responses: {
          "200": {
            description: "Demo Board CSV export",
            content: { "text/csv": { schema: { type: "string" } } },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "501": { $ref: "#/components/responses/CapabilityUnavailable" },
        },
      },
    },
    "/api/v1/events": {
      get: {
        tags: ["Events"],
        operationId: "collaborationEvents",
        description:
          "Short-lived tenant-scoped invalidation feed. `format=json` provides the reliable polling fallback; event payloads contain identifiers only, never message bodies.",
        parameters: [
          {
            name: "workspaceId",
            in: "query",
            required: true,
            schema: { type: "string", minLength: 3, maxLength: 128 },
          },
          {
            name: "after",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 0, default: 0 },
          },
          {
            name: "format",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["json"] },
          },
        ],
        responses: {
          "200": {
            description: "Collaboration invalidation events and next cursor",
            content: {
              "text/event-stream": {
                schema: { type: "string" },
              },
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CollaborationEventBatch",
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "422": { $ref: "#/components/responses/Validation" },
          "503": { $ref: "#/components/responses/RepositoryUnavailable" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      SessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "trevv.session_token",
        description:
          "Better Auth session cookie. Production may apply the standard __Secure- cookie prefix; clients must obtain the cookie through the public /api/auth/* endpoints.",
      },
    },
    parameters: {
      WorkspaceSlug: {
        name: "slug",
        in: "path",
        required: true,
        schema: { type: "string" },
      },
      WorkspaceId: {
        name: "workspaceId",
        in: "path",
        required: true,
        description: "Tenant-scoped Workspace identifier.",
        schema: { type: "string", minLength: 3, maxLength: 128 },
      },
      TeamId: {
        name: "teamId",
        in: "path",
        required: true,
        description: "Tenant-scoped Team identifier.",
        schema: { type: "string", minLength: 3, maxLength: 128 },
      },
      UserId: {
        name: "userId",
        in: "path",
        required: true,
        description: "Application user identifier in the selected tenant.",
        schema: { type: "string", minLength: 3, maxLength: 128 },
      },
      Emoji: {
        name: "emoji",
        in: "path",
        required: true,
        schema: { type: "string", minLength: 1, maxLength: 32 },
      },
      Cursor: {
        name: "cursor",
        in: "query",
        required: false,
        schema: { type: "string", minLength: 1, maxLength: 512 },
      },
      PageLimit: {
        name: "limit",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
      ParentMessageId: {
        name: "parentMessageId",
        in: "query",
        required: false,
        description:
          "Limits the result to replies in one contextual message thread.",
        schema: { type: "string", minLength: 3, maxLength: 128 },
      },
      ItemId: {
        name: "id",
        in: "path",
        required: true,
        description: "Tenant-scoped resource identifier.",
        schema: { type: "string", minLength: 3, maxLength: 128 },
      },
      IdempotencyKey: {
        name: "Idempotency-Key",
        in: "header",
        required: true,
        description:
          "A UUID scoped to the authenticated identity and, after onboarding, the selected organization. Reusing it with the same request returns the original status and body after the mutation completes; reusing it with a different request returns 409.",
        schema: { type: "string", format: "uuid" },
      },
      OptionalIdempotencyKey: {
        name: "Idempotency-Key",
        in: "header",
        required: false,
        description:
          "Optional UUID for exact replay. When supplied, the key also binds the current If-Match value.",
        schema: { type: "string", format: "uuid" },
      },
      IfMatch: {
        name: "If-Match",
        in: "header",
        required: true,
        description:
          'Strong numeric ETag returned by the resource, from "0" through "2147483647"; for example "3".',
        schema: { type: "string", pattern: '^"[0-9]+"$' },
      },
    },
    headers: {
      ETag: {
        description:
          'Strong quoted PostgreSQL integer resource version, from "0" through "2147483647".',
        schema: { type: "string", pattern: '^"[0-9]+"$' },
      },
      IdempotencyKey: {
        description:
          "The validated idempotency key used for this mutation. Present when a key was supplied.",
        schema: { type: "string", format: "uuid" },
      },
      IdempotencyReplayed: {
        description:
          "Whether this status and body are an exact replay of a previously committed mutation. Present when an idempotency key was supplied.",
        schema: { type: "string", enum: ["true", "false"] },
      },
    },
    schemas: {
      Health: {
        type: "object",
        required: ["status", "service", "version", "mode", "time"],
        additionalProperties: false,
        properties: {
          status: { type: "string", const: "ok" },
          service: { type: "string", const: "trevv-api" },
          version: { type: "string", const: "v1" },
          mode: { type: "string", enum: ["demo", "live"] },
          time: { type: "string", format: "date-time" },
        },
      },
      Readiness: {
        type: "object",
        required: [
          "status",
          "service",
          "version",
          "mode",
          "registrationMode",
          "database",
          "release",
          "time",
        ],
        additionalProperties: false,
        properties: {
          status: { type: "string", enum: ["ready", "unavailable"] },
          service: { type: "string", const: "trevv-api" },
          version: { type: "string", const: "v1" },
          mode: { type: "string", enum: ["demo", "live"] },
          registrationMode: {
            type: "string",
            enum: ["closed", "invite_only", "public", "not_applicable"],
          },
          database: {
            type: "string",
            enum: ["ready", "not_applicable", "unavailable"],
          },
          release: {
            oneOf: [
              { $ref: "#/components/schemas/RuntimeReleaseMetadata" },
              { type: "null" },
            ],
          },
          time: { type: "string", format: "date-time" },
        },
      },
      RuntimeReleaseMetadata: {
        type: "object",
        required: ["releaseId", "gitSha", "imageId"],
        additionalProperties: false,
        properties: {
          releaseId: {
            type: "string",
            pattern: "^[a-z0-9][a-z0-9._+-]{7,127}$",
          },
          gitSha: { type: "string", pattern: "^[a-f0-9]{40}$" },
          imageId: {
            type: "string",
            pattern: "^sha256:[a-f0-9]{64}$",
          },
        },
      },
      OpenApiDocument: {
        type: "object",
        required: ["openapi", "info", "paths", "components"],
        properties: {
          openapi: { type: "string", const: "3.1.0" },
          info: {
            type: "object",
            required: ["title", "version"],
            properties: {
              title: { type: "string" },
              version: { type: "string" },
              description: { type: "string" },
            },
          },
          paths: { type: "object", additionalProperties: true },
          components: { type: "object", additionalProperties: true },
        },
      },
      User: {
        type: "object",
        required: ["id", "email", "name", "role", "locale"],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          email: { type: "string", format: "email" },
          name: { type: "string", minLength: 1, maxLength: 160 },
          role: {
            type: "string",
            enum: [
              "owner",
              "admin",
              "workspace_lead",
              "member",
              "guest",
              "viewer",
            ],
          },
          locale: { type: "string", enum: ["en", "de"] },
        },
      },
      OrganizationSummary: {
        type: "object",
        required: ["id", "name", "slug", "role"],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          name: { type: "string", minLength: 1, maxLength: 160 },
          slug: { type: "string", minLength: 1, maxLength: 120 },
          role: {
            type: "string",
            enum: [
              "owner",
              "admin",
              "workspace_lead",
              "member",
              "guest",
              "viewer",
            ],
          },
        },
      },
      OrganizationContext: {
        allOf: [
          { $ref: "#/components/schemas/OrganizationSummary" },
          {
            type: "object",
            required: ["timezone"],
            properties: {
              timezone: { type: "string", minLength: 1, maxLength: 120 },
            },
          },
        ],
      },
      Session: {
        type: "object",
        required: [
          "user",
          "organizationId",
          "organization",
          "availableOrganizations",
          "managedWorkspaceIds",
          "expiresAt",
        ],
        additionalProperties: false,
        properties: {
          user: { $ref: "#/components/schemas/User" },
          organizationId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
          organization: {
            $ref: "#/components/schemas/OrganizationContext",
          },
          availableOrganizations: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            items: { $ref: "#/components/schemas/OrganizationSummary" },
          },
          managedWorkspaceIds: {
            type: "array",
            maxItems: 1000,
            items: { type: "string", minLength: 3, maxLength: 128 },
          },
          expiresAt: { type: "string", format: "date-time" },
        },
      },
      OrganizationSelection: {
        type: "object",
        required: ["organizationId"],
        additionalProperties: false,
        properties: {
          organizationId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
        },
      },
      OnboardingDraft: {
        type: "object",
        required: ["step"],
        additionalProperties: false,
        properties: {
          step: { type: "integer", enum: [1, 2, 3, 4, 5] },
          organizationName: {
            type: "string",
            minLength: 2,
            maxLength: 160,
          },
          organizationSlug: {
            type: "string",
            minLength: 2,
            maxLength: 80,
            pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
          },
          workspaceName: {
            type: "string",
            minLength: 2,
            maxLength: 160,
          },
          workspaceSlug: {
            type: "string",
            minLength: 2,
            maxLength: 80,
            pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
          },
          workspaceType: {
            type: "string",
            enum: [
              "business",
              "brand",
              "client",
              "product",
              "department",
              "venture",
              "initiative",
              "investment",
              "campaign",
              "program",
              "project",
              "shared_function",
              "client_program",
              "journey",
              "other",
            ],
          },
          workspaceColor: {
            type: "string",
            pattern: "^#[0-9a-fA-F]{6}$",
          },
          blueprintKey: {
            type: "string",
            enum: [
              "operating_business",
              "client_delivery",
              "product_initiative",
              "launch_campaign",
              "blank",
            ],
          },
        },
      },
      CompleteOnboarding: {
        allOf: [
          { $ref: "#/components/schemas/OnboardingDraft" },
          {
            type: "object",
            required: [
              "step",
              "organizationName",
              "organizationSlug",
              "workspaceName",
              "workspaceSlug",
              "workspaceType",
              "workspaceColor",
              "blueprintKey",
            ],
            properties: {
              step: { type: "integer", const: 5 },
            },
          },
        ],
      },
      OnboardingState: {
        type: "object",
        required: ["status", "step", "draft", "version", "updatedAt"],
        additionalProperties: false,
        properties: {
          status: {
            type: "string",
            enum: ["not_started", "in_progress", "completed"],
          },
          step: { type: "integer", enum: [1, 2, 3, 4, 5] },
          draft: {
            type: "object",
            additionalProperties: false,
            properties: {
              organizationName: {
                type: "string",
                minLength: 2,
                maxLength: 160,
              },
              organizationSlug: {
                type: "string",
                minLength: 2,
                maxLength: 80,
                pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
              },
              workspaceName: {
                type: "string",
                minLength: 2,
                maxLength: 160,
              },
              workspaceSlug: {
                type: "string",
                minLength: 2,
                maxLength: 80,
                pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
              },
              workspaceType: {
                type: "string",
                enum: [
                  "business",
                  "brand",
                  "client",
                  "product",
                  "department",
                  "venture",
                  "initiative",
                  "investment",
                  "campaign",
                  "program",
                  "project",
                  "shared_function",
                  "client_program",
                  "journey",
                  "other",
                ],
              },
              workspaceColor: {
                type: "string",
                pattern: "^#[0-9a-fA-F]{6}$",
              },
              blueprintKey: {
                type: "string",
                enum: [
                  "operating_business",
                  "client_delivery",
                  "product_initiative",
                  "launch_campaign",
                  "blank",
                ],
              },
            },
          },
          version: { type: "integer", minimum: 0 },
          updatedAt: { type: "string", format: "date-time" },
          completedAt: { type: "string", format: "date-time" },
          organizationId: { type: "string", minLength: 3, maxLength: 128 },
          portfolioId: { type: "string", minLength: 3, maxLength: 128 },
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          boardId: { type: "string", minLength: 3, maxLength: 128 },
          blueprintInstanceId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
        },
      },
      Invitation: {
        type: "object",
        required: [
          "id",
          "organizationId",
          "email",
          "role",
          "status",
          "deliveryStatus",
          "version",
          "expiresAt",
          "createdAt",
          "updatedAt",
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          organizationId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
          email: { type: "string", format: "email" },
          role: {
            type: "string",
            enum: ["admin", "workspace_lead", "member", "guest", "viewer"],
          },
          status: {
            type: "string",
            enum: ["pending", "accepted", "revoked", "expired"],
          },
          deliveryStatus: {
            type: "string",
            enum: ["pending", "sent", "failed"],
          },
          version: { type: "integer", minimum: 1 },
          expiresAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          acceptedAt: { type: "string", format: "date-time" },
          revokedAt: { type: "string", format: "date-time" },
          lastSentAt: { type: "string", format: "date-time" },
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          teamId: { type: "string", minLength: 3, maxLength: 128 },
        },
      },
      CreateInvitation: {
        type: "object",
        required: ["email", "role"],
        additionalProperties: false,
        properties: {
          email: { type: "string", format: "email" },
          role: {
            type: "string",
            enum: ["admin", "workspace_lead", "member", "guest", "viewer"],
          },
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          teamId: { type: "string", minLength: 3, maxLength: 128 },
        },
      },
      AcceptInvitation: {
        type: "object",
        required: ["token"],
        additionalProperties: false,
        properties: {
          token: { type: "string", minLength: 32, maxLength: 1024 },
        },
      },
      InvitationAcceptance: {
        type: "object",
        required: ["invitationId", "organizationId", "role", "acceptedAt"],
        additionalProperties: false,
        properties: {
          invitationId: { type: "string", minLength: 3, maxLength: 128 },
          organizationId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
          role: {
            type: "string",
            enum: ["admin", "workspace_lead", "member", "guest", "viewer"],
          },
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          teamId: { type: "string", minLength: 3, maxLength: 128 },
          acceptedAt: { type: "string", format: "date-time" },
        },
      },
      Membership: {
        type: "object",
        required: [
          "organizationId",
          "user",
          "role",
          "active",
          "createdAt",
          "updatedAt",
        ],
        additionalProperties: false,
        properties: {
          organizationId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
          user: {
            type: "object",
            required: ["id", "email", "name"],
            additionalProperties: false,
            properties: {
              id: { type: "string", minLength: 3, maxLength: 128 },
              email: { type: "string", format: "email" },
              name: { type: "string", minLength: 1, maxLength: 160 },
            },
          },
          role: {
            type: "string",
            enum: [
              "owner",
              "admin",
              "workspace_lead",
              "member",
              "guest",
              "viewer",
            ],
          },
          active: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      UpdateMembership: {
        type: "object",
        minProperties: 1,
        additionalProperties: false,
        properties: {
          role: {
            type: "string",
            enum: ["admin", "workspace_lead", "member", "guest", "viewer"],
          },
          active: { type: "boolean" },
        },
      },
      Portfolio: {
        type: "object",
        required: [
          "id",
          "organizationId",
          "name",
          "slug",
          "description",
          "isDefault",
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          organizationId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
          name: { type: "string", minLength: 1, maxLength: 160 },
          slug: { type: "string", minLength: 1, maxLength: 120 },
          description: { type: "string", maxLength: 1000 },
          isDefault: { type: "boolean" },
        },
      },
      WorkspaceMetric: {
        type: "object",
        required: ["label", "value"],
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          value: { type: "string" },
          trend: { type: "string" },
        },
      },
      Workspace: {
        type: "object",
        required: [
          "id",
          "portfolioId",
          "slug",
          "name",
          "description",
          "icon",
          "accent",
          "type",
          "stage",
          "health",
          "healthNote",
          "priority",
          "metrics",
          "versionTag",
          "updatedAt",
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          portfolioId: { type: "string", minLength: 3, maxLength: 128 },
          slug: { type: "string", minLength: 1, maxLength: 120 },
          name: { type: "string", minLength: 1, maxLength: 160 },
          description: { type: "string", maxLength: 5000 },
          icon: { type: "string", minLength: 1, maxLength: 12 },
          accent: {
            type: "string",
            pattern: "^#[0-9a-fA-F]{6}$",
          },
          type: {
            type: "string",
            enum: [
              "business",
              "brand",
              "client",
              "product",
              "department",
              "venture",
              "initiative",
              "investment",
              "campaign",
              "program",
              "project",
              "shared_function",
              "client_program",
              "journey",
              "other",
            ],
          },
          stage: {
            type: "string",
            enum: [
              "idea",
              "validate",
              "build",
              "launch",
              "grow",
              "operate",
              "paused",
              "archived",
            ],
          },
          health: {
            type: "string",
            enum: ["on_track", "watch", "critical", "parked"],
          },
          healthNote: { type: "string", maxLength: 1000 },
          priority: { type: "string", maxLength: 500 },
          lead: {
            type: "object",
            required: ["name", "initials", "color"],
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              initials: { type: "string" },
              color: { type: "string" },
            },
          },
          nextMilestone: {
            type: "object",
            required: ["title", "date"],
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              date: { type: "string", format: "date" },
            },
          },
          latestUpdate: {
            type: "object",
            required: ["text", "date"],
            additionalProperties: false,
            properties: {
              text: { type: "string" },
              date: { type: "string", format: "date" },
            },
          },
          metrics: {
            type: "array",
            maxItems: 12,
            items: { $ref: "#/components/schemas/WorkspaceMetric" },
          },
          versionTag: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      CollaborationUser: {
        type: "object",
        required: ["id", "email", "name", "organizationRole"],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          email: { type: "string", format: "email" },
          name: { type: "string", minLength: 1, maxLength: 160 },
          organizationRole: {
            type: "string",
            enum: [
              "owner",
              "admin",
              "workspace_lead",
              "member",
              "guest",
              "viewer",
            ],
          },
        },
      },
      TeamMember: {
        type: "object",
        required: ["user", "role", "joinedAt"],
        additionalProperties: false,
        properties: {
          user: { $ref: "#/components/schemas/CollaborationUser" },
          role: { type: "string", enum: ["lead", "member"] },
          joinedAt: { type: "string", format: "date-time" },
        },
      },
      TeamRoom: {
        type: "object",
        required: ["conversationId", "title", "unreadCount"],
        additionalProperties: false,
        properties: {
          conversationId: { type: "string", minLength: 3, maxLength: 128 },
          title: { type: "string", minLength: 1, maxLength: 160 },
          unreadCount: { type: "integer", minimum: 0 },
        },
      },
      Team: {
        type: "object",
        required: [
          "id",
          "organizationId",
          "portfolioId",
          "workspaceId",
          "name",
          "purpose",
          "preset",
          "featureCapabilities",
          "featurePolicySource",
          "members",
          "room",
          "version",
          "createdAt",
          "updatedAt",
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          organizationId: { type: "string", minLength: 3, maxLength: 128 },
          portfolioId: { type: "string", minLength: 3, maxLength: 128 },
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          name: { type: "string", minLength: 1, maxLength: 160 },
          purpose: { type: "string", maxLength: 1000 },
          preset: {
            type: "string",
            enum: [
              "leadership",
              "marketing",
              "technology",
              "operations",
              "sales",
              "custom",
            ],
          },
          featureCapabilities: {
            type: "array",
            maxItems: 20,
            uniqueItems: true,
            description:
              "Inherited product-feature defaults only. This field is never an authorization grant.",
            items: {
              type: "string",
              enum: [
                "work",
                "messages",
                "decisions",
                "approvals",
                "resources",
                "reporting",
              ],
            },
          },
          featurePolicySource: {
            type: "string",
            enum: ["preset", "override", "none"],
            description:
              "Provenance for the persisted feature defaults. These options never grant data access.",
          },
          members: {
            type: "array",
            maxItems: 250,
            items: { $ref: "#/components/schemas/TeamMember" },
          },
          room: { $ref: "#/components/schemas/TeamRoom" },
          version: { type: "integer", minimum: 0 },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      TeamDirectory: {
        type: "object",
        required: ["teams", "availableMembers"],
        additionalProperties: false,
        properties: {
          teams: {
            type: "array",
            items: { $ref: "#/components/schemas/Team" },
          },
          availableMembers: {
            type: "array",
            maxItems: 2000,
            items: { $ref: "#/components/schemas/CollaborationUser" },
          },
        },
      },
      CreateTeam: {
        type: "object",
        required: ["workspaceId", "name"],
        additionalProperties: false,
        properties: {
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          name: { type: "string", minLength: 1, maxLength: 160 },
          purpose: { type: "string", maxLength: 1000, default: "" },
          preset: {
            type: "string",
            enum: [
              "leadership",
              "marketing",
              "technology",
              "operations",
              "sales",
              "custom",
            ],
            default: "custom",
          },
          featureCapabilities: {
            type: "array",
            maxItems: 20,
            uniqueItems: true,
            items: {
              type: "string",
              enum: [
                "work",
                "messages",
                "decisions",
                "approvals",
                "resources",
                "reporting",
              ],
            },
          },
          memberIds: {
            type: "array",
            maxItems: 250,
            uniqueItems: true,
            items: { type: "string", minLength: 3, maxLength: 128 },
          },
          leadUserId: { type: "string", minLength: 3, maxLength: 128 },
        },
      },
      UpdateTeam: {
        type: "object",
        minProperties: 1,
        additionalProperties: false,
        properties: {
          name: { type: "string", minLength: 1, maxLength: 160 },
          purpose: { type: "string", maxLength: 1000 },
          preset: {
            type: "string",
            enum: [
              "leadership",
              "marketing",
              "technology",
              "operations",
              "sales",
              "custom",
            ],
          },
          featureCapabilities: {
            type: "array",
            maxItems: 20,
            uniqueItems: true,
            items: {
              type: "string",
              enum: [
                "work",
                "messages",
                "decisions",
                "approvals",
                "resources",
                "reporting",
              ],
            },
          },
        },
      },
      SetTeamMember: {
        type: "object",
        additionalProperties: false,
        properties: {
          role: { type: "string", enum: ["lead", "member"], default: "member" },
        },
      },
      ConversationParticipant: {
        type: "object",
        required: ["user", "participantRole", "notificationLevel", "joinedAt"],
        additionalProperties: false,
        properties: {
          user: { $ref: "#/components/schemas/CollaborationUser" },
          participantRole: {
            type: "string",
            enum: ["owner", "member", "guest"],
          },
          notificationLevel: {
            type: "string",
            enum: ["all", "mentions", "none"],
          },
          lastReadMessageId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
          lastReadAt: { type: "string", format: "date-time" },
          joinedAt: { type: "string", format: "date-time" },
        },
      },
      Conversation: {
        type: "object",
        required: [
          "id",
          "organizationId",
          "portfolioId",
          "workspaceId",
          "title",
          "purpose",
          "kind",
          "visibility",
          "participants",
          "unreadCount",
          "needsResponseCount",
          "retentionDays",
          "version",
          "createdAt",
          "updatedAt",
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          organizationId: { type: "string", minLength: 3, maxLength: 128 },
          portfolioId: { type: "string", minLength: 3, maxLength: 128 },
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          teamId: { type: "string", minLength: 3, maxLength: 128 },
          title: { type: "string", minLength: 1, maxLength: 160 },
          purpose: { type: "string", maxLength: 1000 },
          kind: {
            type: "string",
            enum: ["workspace", "team", "direct", "external"],
          },
          visibility: {
            type: "string",
            enum: ["organization", "private", "guest_scoped"],
          },
          participants: {
            type: "array",
            maxItems: 250,
            items: { $ref: "#/components/schemas/ConversationParticipant" },
          },
          unreadCount: { type: "integer", minimum: 0 },
          needsResponseCount: { type: "integer", minimum: 0 },
          retentionDays: { type: "integer", minimum: 1, maximum: 3650 },
          lastMessageAt: { type: "string", format: "date-time" },
          version: { type: "integer", minimum: 0 },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      PaginatedConversations: {
        type: "object",
        required: ["data", "nextCursor"],
        additionalProperties: false,
        properties: {
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/Conversation" },
          },
          nextCursor: { type: ["string", "null"] },
        },
      },
      CreateConversation: {
        type: "object",
        required: [
          "workspaceId",
          "title",
          "kind",
          "visibility",
          "participantIds",
        ],
        additionalProperties: false,
        properties: {
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          title: { type: "string", minLength: 1, maxLength: 160 },
          purpose: { type: "string", maxLength: 1000, default: "" },
          kind: { type: "string", enum: ["workspace", "direct", "external"] },
          visibility: {
            type: "string",
            enum: ["organization", "private", "guest_scoped"],
          },
          participantIds: {
            type: "array",
            minItems: 1,
            maxItems: 250,
            uniqueItems: true,
            items: { type: "string", minLength: 3, maxLength: 128 },
          },
          retentionDays: {
            type: "integer",
            minimum: 1,
            maximum: 3650,
            default: 365,
          },
        },
      },
      MessageReaction: {
        type: "object",
        required: ["emoji", "userIds", "reactedByCurrentUser"],
        additionalProperties: false,
        properties: {
          emoji: { type: "string", minLength: 1, maxLength: 32 },
          userIds: {
            type: "array",
            maxItems: 250,
            items: { type: "string", minLength: 3, maxLength: 128 },
          },
          reactedByCurrentUser: { type: "boolean" },
        },
      },
      Message: {
        type: "object",
        required: [
          "id",
          "sequence",
          "clientMessageId",
          "organizationId",
          "conversationId",
          "senderId",
          "sender",
          "body",
          "intent",
          "metadata",
          "reactions",
          "retainedUntil",
          "version",
          "createdAt",
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          sequence: { type: "integer", minimum: 1 },
          clientMessageId: { type: "string", format: "uuid" },
          organizationId: { type: "string", minLength: 3, maxLength: 128 },
          conversationId: { type: "string", minLength: 3, maxLength: 128 },
          senderId: { type: "string", minLength: 3, maxLength: 128 },
          sender: { $ref: "#/components/schemas/CollaborationUser" },
          parentMessageId: { type: "string", minLength: 3, maxLength: 128 },
          body: { type: "string", minLength: 1, maxLength: 20000 },
          intent: {
            type: "string",
            enum: ["message", "request", "decision", "update"],
          },
          responseOwnerId: { type: "string", minLength: 3, maxLength: 128 },
          responseDueAt: { type: "string", format: "date-time" },
          responseState: {
            type: "string",
            enum: ["open", "resolved", "cancelled"],
          },
          linkedEntityType: { type: "string", maxLength: 80 },
          linkedEntityId: { type: "string", minLength: 3, maxLength: 128 },
          metadata: { type: "object", additionalProperties: true },
          reactions: {
            type: "array",
            maxItems: 50,
            items: { $ref: "#/components/schemas/MessageReaction" },
          },
          retainedUntil: { type: "string", format: "date-time" },
          version: { type: "integer", minimum: 0 },
          editedAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      PaginatedConversationMessages: {
        type: "object",
        required: ["data", "nextCursor"],
        additionalProperties: false,
        properties: {
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/Message" },
          },
          nextCursor: { type: ["string", "null"] },
        },
      },
      CreateMessage: {
        type: "object",
        required: ["clientMessageId", "body"],
        additionalProperties: false,
        properties: {
          clientMessageId: { type: "string", format: "uuid" },
          parentMessageId: { type: "string", minLength: 3, maxLength: 128 },
          body: { type: "string", minLength: 1, maxLength: 20000 },
          intent: {
            type: "string",
            enum: ["message", "request", "decision", "update"],
            default: "message",
          },
          responseOwnerId: { type: "string", minLength: 3, maxLength: 128 },
          responseDueAt: { type: "string", format: "date-time" },
          linkedEntityType: { type: "string", maxLength: 80 },
          linkedEntityId: { type: "string", minLength: 3, maxLength: 128 },
          metadata: { type: "object", additionalProperties: true, default: {} },
        },
      },
      UpdateMessageResponse: {
        type: "object",
        required: ["responseState"],
        additionalProperties: false,
        properties: {
          responseState: { type: "string", enum: ["open", "resolved"] },
        },
      },
      MarkConversationRead: {
        type: "object",
        required: ["messageId"],
        additionalProperties: false,
        properties: {
          messageId: { type: "string", minLength: 3, maxLength: 128 },
        },
      },
      ReadCheckpoint: {
        type: "object",
        required: [
          "conversationId",
          "userId",
          "messageId",
          "messageSequence",
          "readAt",
          "version",
        ],
        additionalProperties: false,
        properties: {
          conversationId: { type: "string", minLength: 3, maxLength: 128 },
          userId: { type: "string", minLength: 3, maxLength: 128 },
          messageId: { type: "string", minLength: 3, maxLength: 128 },
          messageSequence: { type: "integer", minimum: 1 },
          readAt: { type: "string", format: "date-time" },
          version: { type: "integer", minimum: 0 },
        },
      },
      CollaborationEvent: {
        type: "object",
        required: [
          "cursor",
          "organizationId",
          "workspaceId",
          "type",
          "aggregateType",
          "aggregateId",
          "occurredAt",
        ],
        additionalProperties: false,
        properties: {
          cursor: { type: "integer", minimum: 1 },
          organizationId: { type: "string", minLength: 3, maxLength: 128 },
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          type: {
            type: "string",
            enum: [
              "team.created",
              "team.updated",
              "team.membership_changed",
              "conversation.created",
              "conversation.participants_changed",
              "message.sent",
              "message.response_changed",
              "message.reaction_changed",
              "conversation.read",
            ],
          },
          aggregateType: {
            type: "string",
            enum: ["team", "conversation", "message"],
          },
          aggregateId: { type: "string", minLength: 3, maxLength: 128 },
          teamId: { type: "string", minLength: 3, maxLength: 128 },
          conversationId: { type: "string", minLength: 3, maxLength: 128 },
          occurredAt: { type: "string", format: "date-time" },
        },
      },
      CollaborationEventBatch: {
        type: "object",
        required: ["events", "nextCursor"],
        additionalProperties: false,
        properties: {
          events: {
            type: "array",
            maxItems: 500,
            items: { $ref: "#/components/schemas/CollaborationEvent" },
          },
          nextCursor: { type: "integer", minimum: 0 },
        },
      },
      CreateWorkspace: {
        type: "object",
        required: ["portfolioId", "name", "slug", "type", "accent", "icon"],
        additionalProperties: false,
        properties: {
          portfolioId: { type: "string", minLength: 3, maxLength: 128 },
          name: { type: "string", minLength: 2, maxLength: 160 },
          slug: {
            type: "string",
            minLength: 2,
            maxLength: 80,
            pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
          },
          description: { type: "string", maxLength: 5000, default: "" },
          type: {
            type: "string",
            enum: [
              "business",
              "brand",
              "client",
              "product",
              "department",
              "venture",
              "initiative",
              "investment",
              "campaign",
              "program",
              "project",
              "shared_function",
              "client_program",
              "journey",
              "other",
            ],
          },
          accent: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
          icon: { type: "string", minLength: 1, maxLength: 12 },
          stage: {
            type: "string",
            enum: [
              "idea",
              "validate",
              "build",
              "launch",
              "grow",
              "operate",
              "paused",
              "archived",
            ],
            default: "idea",
          },
          health: {
            type: "string",
            enum: ["on_track", "watch", "critical", "parked"],
            default: "on_track",
          },
          healthNote: { type: "string", maxLength: 1000, default: "" },
          priority: { type: "string", maxLength: 500, default: "" },
          leadUserId: { type: "string", minLength: 3, maxLength: 128 },
          initialBoardName: { type: "string", minLength: 1, maxLength: 160 },
        },
      },
      Board: {
        type: "object",
        required: [
          "id",
          "workspaceId",
          "name",
          "description",
          "visibility",
          "progressMode",
          "ordering",
          "versionTag",
          "createdAt",
          "updatedAt",
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          name: { type: "string", minLength: 1, maxLength: 160 },
          description: { type: "string", maxLength: 5000 },
          templateKey: { type: "string", maxLength: 120 },
          visibility: { type: "string", enum: ["private", "organization"] },
          progressMode: {
            type: "string",
            enum: [
              "none",
              "task_completion",
              "weighted_work_items",
              "milestone_completion",
              "weighted_milestones",
              "manual",
            ],
          },
          manualProgressValue: { type: "number", minimum: 0, maximum: 100 },
          manualProgressNote: { type: "string", maxLength: 2000 },
          startDate: { type: "string", format: "date" },
          endDate: { type: "string", format: "date" },
          ordering: { type: "number" },
          versionTag: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      CreateBoard: {
        type: "object",
        required: ["workspaceId", "name"],
        additionalProperties: false,
        properties: {
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          name: { type: "string", minLength: 1, maxLength: 160 },
          description: { type: "string", maxLength: 5000, default: "" },
          templateKey: { type: "string", maxLength: 120 },
          visibility: {
            type: "string",
            enum: ["private", "organization"],
            default: "private",
          },
          progressMode: { type: "string", default: "task_completion" },
          startDate: { type: "string", format: "date" },
          endDate: { type: "string", format: "date" },
        },
      },
      WorkspaceCreation: {
        type: "object",
        required: ["workspace", "board"],
        additionalProperties: false,
        properties: {
          workspace: { $ref: "#/components/schemas/Workspace" },
          board: { $ref: "#/components/schemas/Board" },
        },
      },
      WorkspaceRollup: {
        type: "object",
        required: [
          "open",
          "overdue",
          "blocked",
          "decisions",
          "approvals",
          "score",
        ],
        additionalProperties: false,
        properties: {
          open: { type: "integer", minimum: 0 },
          overdue: { type: "integer", minimum: 0 },
          blocked: { type: "integer", minimum: 0 },
          decisions: { type: "integer", minimum: 0 },
          approvals: { type: "integer", minimum: 0 },
          score: { type: "number", minimum: 0 },
        },
      },
      PortfolioSignals: {
        type: "object",
        required: [
          "decisions",
          "approvals",
          "blocked",
          "overdueMilestones",
          "staleUpdates",
          "unassignedUrgent",
        ],
        additionalProperties: false,
        properties: {
          decisions: { type: "integer", minimum: 0 },
          approvals: { type: "integer", minimum: 0 },
          blocked: { type: "integer", minimum: 0 },
          overdueMilestones: { type: "integer", minimum: 0 },
          staleUpdates: { type: "integer", minimum: 0 },
          unassignedUrgent: { type: "integer", minimum: 0 },
        },
      },
      PortfolioWorkspaceRollup: {
        type: "object",
        required: ["workspace", "rollup"],
        additionalProperties: false,
        properties: {
          workspace: { $ref: "#/components/schemas/Workspace" },
          rollup: { $ref: "#/components/schemas/WorkspaceRollup" },
        },
      },
      PortfolioResponse: {
        type: "object",
        required: ["asOf", "portfolio", "signals", "workspaces"],
        additionalProperties: false,
        properties: {
          asOf: { type: "string", format: "date-time" },
          portfolio: { $ref: "#/components/schemas/Portfolio" },
          signals: { $ref: "#/components/schemas/PortfolioSignals" },
          workspaces: {
            type: "array",
            items: { $ref: "#/components/schemas/PortfolioWorkspaceRollup" },
          },
        },
      },
      WorkspaceDetail: {
        type: "object",
        required: ["workspace", "rollup", "items"],
        additionalProperties: false,
        properties: {
          workspace: { $ref: "#/components/schemas/Workspace" },
          rollup: { $ref: "#/components/schemas/WorkspaceRollup" },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/WorkItem" },
          },
        },
      },
      MeaningfulChange: {
        type: "object",
        required: [
          "id",
          "organizationId",
          "portfolioId",
          "workspaceId",
          "entityType",
          "entityId",
          "type",
          "summary",
          "occurredAt",
          "importance",
          "metadata",
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          organizationId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
          portfolioId: { type: "string", minLength: 3, maxLength: 128 },
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          entityType: { type: "string", minLength: 1, maxLength: 80 },
          entityId: { type: "string", minLength: 3, maxLength: 128 },
          type: {
            type: "string",
            enum: [
              "health_changed",
              "milestone_changed",
              "priority_changed",
              "decision_requested",
              "decision_resolved",
              "blocker_added",
              "blocker_resolved",
              "update_published",
              "update_became_stale",
              "major_work_completed",
              "due_date_materially_changed",
              "ownership_changed",
            ],
          },
          summary: { type: "string", minLength: 1, maxLength: 2000 },
          occurredAt: { type: "string", format: "date-time" },
          importance: { type: "number", minimum: 0 },
          metadata: { type: "object", additionalProperties: true },
        },
      },
      ChangeRadar: {
        type: "object",
        required: ["checkpoint", "changes"],
        additionalProperties: false,
        properties: {
          checkpoint: {
            type: "object",
            required: ["userId", "portfolioId", "lastSeenAt"],
            additionalProperties: false,
            properties: {
              userId: { type: "string", minLength: 3, maxLength: 128 },
              portfolioId: {
                type: "string",
                minLength: 3,
                maxLength: 128,
              },
              lastSeenAt: { type: "string", format: "date-time" },
            },
          },
          changes: {
            type: "array",
            items: { $ref: "#/components/schemas/MeaningfulChange" },
          },
        },
      },
      WorkspaceSnapshot: {
        type: "object",
        required: [
          "id",
          "organizationId",
          "portfolioId",
          "workspaceId",
          "capturedAt",
          "health",
          "openCount",
          "overdueCount",
          "blockedCount",
          "decisionCount",
          "attentionCount",
          "source",
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          organizationId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
          portfolioId: { type: "string", minLength: 3, maxLength: 128 },
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          capturedAt: { type: "string", format: "date-time" },
          health: {
            type: "string",
            enum: ["on_track", "watch", "critical", "parked"],
          },
          progress: { type: "number" },
          openCount: { type: "integer", minimum: 0 },
          overdueCount: { type: "integer", minimum: 0 },
          blockedCount: { type: "integer", minimum: 0 },
          decisionCount: { type: "integer", minimum: 0 },
          attentionCount: { type: "integer", minimum: 0 },
          nextMilestoneId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
          nextMilestoneStatus: { type: "string", maxLength: 120 },
          latestUpdateAt: { type: "string", format: "date-time" },
          source: {
            type: "string",
            enum: ["weekly_review", "monthly_review", "manual"],
          },
        },
      },
      ReviewRitual: {
        type: "object",
        required: [
          "id",
          "organizationId",
          "portfolioId",
          "type",
          "cadence",
          "enabled",
          "reminderEnabled",
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          organizationId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
          portfolioId: { type: "string", minLength: 3, maxLength: 128 },
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          type: {
            type: "string",
            enum: ["daily_focus", "weekly_workspace", "monthly_portfolio"],
          },
          cadence: { type: "string", minLength: 1, maxLength: 160 },
          enabled: { type: "boolean" },
          nextDueAt: { type: "string", format: "date-time" },
          reminderEnabled: { type: "boolean" },
        },
      },
      DecisionOutcome: {
        type: "object",
        required: [
          "id",
          "organizationId",
          "portfolioId",
          "decisionItemId",
          "outcome",
          "learning",
          "recordedBy",
          "recordedAt",
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          organizationId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
          portfolioId: { type: "string", minLength: 3, maxLength: 128 },
          decisionItemId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
          outcome: {
            type: "string",
            enum: [
              "better_than_expected",
              "as_expected",
              "worse_than_expected",
              "too_early",
            ],
          },
          learning: { type: "string", maxLength: 5000 },
          wouldRepeat: { type: "boolean" },
          recordedBy: { type: "string", minLength: 3, maxLength: 128 },
          recordedAt: { type: "string", format: "date-time" },
        },
      },
      ManagementMemory: {
        type: "object",
        required: ["workspaceSnapshots", "reviewRituals", "decisionOutcomes"],
        additionalProperties: false,
        properties: {
          workspaceSnapshots: {
            type: "array",
            items: { $ref: "#/components/schemas/WorkspaceSnapshot" },
          },
          reviewRituals: {
            type: "array",
            items: { $ref: "#/components/schemas/ReviewRitual" },
          },
          decisionOutcomes: {
            type: "array",
            items: { $ref: "#/components/schemas/DecisionOutcome" },
          },
        },
      },
      SearchResult: {
        type: "object",
        required: ["workspaces", "items"],
        additionalProperties: false,
        properties: {
          workspaces: {
            type: "array",
            items: { $ref: "#/components/schemas/Workspace" },
          },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/WorkItem" },
          },
        },
      },
      Insight: {
        type: "object",
        required: [
          "id",
          "organizationId",
          "portfolioId",
          "title",
          "description",
          "sourceType",
          "labels",
          "capturedBy",
          "capturedAt",
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          organizationId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
          portfolioId: { type: "string", minLength: 3, maxLength: 128 },
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          title: { type: "string" },
          description: { type: "string" },
          sourceType: {
            type: "string",
            enum: [
              "customer_feedback",
              "research",
              "analytics",
              "quote",
              "url",
              "screenshot",
              "file",
              "email",
              "slack",
              "figma",
              "github",
              "other",
            ],
          },
          sourceUrl: { type: "string", format: "uri" },
          impact: { type: "string", enum: ["low", "medium", "high"] },
          labels: { type: "array", items: { type: "string" } },
          capturedBy: { type: "string", minLength: 3, maxLength: 128 },
          capturedAt: { type: "string", format: "date-time" },
        },
      },
      BlueprintInstance: {
        type: "object",
        required: [
          "id",
          "organizationId",
          "blueprintId",
          "blueprintVersionId",
          "workspaceId",
          "boardId",
          "localOverrides",
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          organizationId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
          blueprintId: { type: "string", minLength: 3, maxLength: 128 },
          blueprintVersionId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          boardId: { type: "string", minLength: 3, maxLength: 128 },
          detachedAt: { type: "string", format: "date-time" },
          localOverrides: { type: "array", items: { type: "string" } },
        },
      },
      BlueprintVersion: {
        type: "object",
        required: [
          "id",
          "blueprintId",
          "version",
          "summary",
          "definition",
          "createdAt",
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          blueprintId: { type: "string", minLength: 3, maxLength: 128 },
          version: { type: "integer", minimum: 1 },
          summary: { type: "string" },
          definition: {
            type: "object",
            required: [
              "groups",
              "statuses",
              "customFields",
              "views",
              "updateCadence",
              "defaultRoles",
              "automationRules",
              "reviewRitual",
            ],
            additionalProperties: false,
            properties: {
              groups: { type: "array", items: { type: "string" } },
              statuses: { type: "array", items: { type: "string" } },
              customFields: { type: "array", items: { type: "string" } },
              views: { type: "array", items: { type: "string" } },
              updateCadence: { type: "string" },
              defaultRoles: { type: "array", items: { type: "string" } },
              automationRules: {
                type: "array",
                items: { type: "string" },
              },
              reviewRitual: { type: "string" },
            },
          },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      BlueprintDiff: {
        type: "object",
        required: ["additions", "changes", "conflicts", "preservedOverrides"],
        additionalProperties: false,
        properties: {
          additions: { type: "array", items: { type: "string" } },
          changes: { type: "array", items: { type: "string" } },
          conflicts: { type: "array", items: { type: "string" } },
          preservedOverrides: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
      BlueprintResponse: {
        type: "object",
        required: ["instances", "versions", "preview"],
        additionalProperties: false,
        properties: {
          instances: {
            type: "array",
            items: { $ref: "#/components/schemas/BlueprintInstance" },
          },
          versions: {
            type: "array",
            items: { $ref: "#/components/schemas/BlueprintVersion" },
          },
          preview: {
            oneOf: [
              { $ref: "#/components/schemas/BlueprintDiff" },
              { type: "null" },
            ],
          },
        },
      },
      ResourcePressure: {
        type: "object",
        required: [
          "userId",
          "userName",
          "urgentHighActive",
          "dueThisWeek",
          "blockedResponsibilities",
          "criticalWorkspaceResponsibilities",
          "milestonesOwned",
          "workspaceIds",
          "pressure",
        ],
        additionalProperties: false,
        properties: {
          userId: { type: "string", minLength: 3, maxLength: 128 },
          userName: { type: "string" },
          urgentHighActive: { type: "integer", minimum: 0 },
          dueThisWeek: { type: "integer", minimum: 0 },
          blockedResponsibilities: { type: "integer", minimum: 0 },
          criticalWorkspaceResponsibilities: {
            type: "integer",
            minimum: 0,
          },
          milestonesOwned: { type: "integer", minimum: 0 },
          workspaceIds: {
            type: "array",
            uniqueItems: true,
            items: { type: "string", minLength: 3, maxLength: 128 },
          },
          pressure: {
            type: "string",
            enum: ["normal", "elevated", "critical"],
          },
        },
      },
      EntitlementSet: {
        type: "object",
        required: ["planKey", "values"],
        additionalProperties: false,
        properties: {
          planKey: { type: "string" },
          values: {
            type: "object",
            propertyNames: {
              enum: [
                "portfolios.max",
                "workspaces.max",
                "members.max",
                "guests.max",
                "storage.bytes",
                "automations.monthly",
                "ai.actions",
                "integration.github",
                "integration.drive",
                "integration.figma",
              ],
            },
            additionalProperties: {
              oneOf: [
                { type: "number" },
                { type: "boolean" },
                { type: "string", const: "unlimited" },
              ],
            },
          },
        },
      },
      ImportPreviewInput: {
        type: "object",
        required: ["preset", "headers", "rowCount"],
        additionalProperties: false,
        properties: {
          preset: {
            type: "string",
            enum: ["generic_csv", "monday", "clickup", "asana"],
          },
          headers: {
            type: "array",
            minItems: 1,
            maxItems: 200,
            items: { type: "string" },
          },
          rowCount: { type: "integer", minimum: 1, maximum: 100000 },
        },
      },
      ImportPreview: {
        type: "object",
        required: [
          "preset",
          "rowsDetected",
          "rowsReady",
          "warnings",
          "unsupportedFields",
          "mapping",
          "dryRun",
        ],
        additionalProperties: false,
        properties: {
          preset: {
            type: "string",
            enum: ["generic_csv", "monday", "clickup", "asana"],
          },
          rowsDetected: { type: "integer", minimum: 0 },
          rowsReady: { type: "integer", minimum: 0 },
          warnings: { type: "array", items: { type: "string" } },
          unsupportedFields: {
            type: "array",
            items: { type: "string" },
          },
          mapping: {
            type: "object",
            additionalProperties: { type: "string" },
          },
          dryRun: { type: "boolean", const: true },
        },
      },
      WorkItemDependency: {
        type: "object",
        required: ["itemId", "dependsOnItemId", "relation"],
        additionalProperties: false,
        properties: {
          itemId: { type: "string", minLength: 3, maxLength: 128 },
          dependsOnItemId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
          relation: {
            type: "string",
            enum: ["depends_on", "blocks", "related"],
          },
        },
      },
      OrganizationExport: {
        type: "object",
        required: [
          "exportedAt",
          "organization",
          "portfolios",
          "workspaces",
          "boards",
          "items",
          "milestones",
          "ideas",
          "decisions",
          "decisionOutcomes",
          "approvals",
          "updates",
          "insights",
          "snapshots",
          "waiting",
          "attention",
          "dependencies",
          "commentMetadata",
          "smartLinks",
        ],
        additionalProperties: false,
        properties: {
          exportedAt: { type: "string", format: "date-time" },
          organization: {
            type: "object",
            required: ["id", "name"],
            additionalProperties: false,
            properties: {
              id: { type: "string", minLength: 3, maxLength: 128 },
              name: { type: "string" },
            },
          },
          portfolios: {
            type: "array",
            items: { $ref: "#/components/schemas/Portfolio" },
          },
          workspaces: {
            type: "array",
            items: { $ref: "#/components/schemas/Workspace" },
          },
          boards: {
            type: "array",
            items: {
              type: "object",
              required: ["id"],
              additionalProperties: false,
              properties: {
                id: { type: "string", minLength: 3, maxLength: 128 },
                workspaceId: {
                  type: "string",
                  minLength: 3,
                  maxLength: 128,
                },
              },
            },
          },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/WorkItem" },
          },
          milestones: {
            type: "array",
            items: { $ref: "#/components/schemas/WorkItem" },
          },
          ideas: {
            type: "array",
            items: { $ref: "#/components/schemas/WorkItem" },
          },
          decisions: {
            type: "array",
            items: { $ref: "#/components/schemas/WorkItem" },
          },
          decisionOutcomes: {
            type: "array",
            items: { $ref: "#/components/schemas/DecisionOutcome" },
          },
          approvals: {
            type: "array",
            items: { $ref: "#/components/schemas/WorkItem" },
          },
          updates: {
            type: "array",
            items: {
              type: "object",
              required: ["workspaceId", "text", "date"],
              additionalProperties: false,
              properties: {
                workspaceId: {
                  type: "string",
                  minLength: 3,
                  maxLength: 128,
                },
                text: { type: "string" },
                date: { type: "string", format: "date" },
              },
            },
          },
          insights: {
            type: "array",
            items: { $ref: "#/components/schemas/Insight" },
          },
          snapshots: {
            type: "array",
            items: { $ref: "#/components/schemas/WorkspaceSnapshot" },
          },
          waiting: {
            type: "array",
            items: { $ref: "#/components/schemas/WaitingState" },
          },
          attention: {
            type: "array",
            items: { $ref: "#/components/schemas/AttentionSignal" },
          },
          dependencies: {
            type: "array",
            items: { $ref: "#/components/schemas/WorkItemDependency" },
          },
          commentMetadata: { type: "array", items: { type: "object" } },
          smartLinks: { type: "array", items: { type: "object" } },
        },
      },
      Assignee: {
        type: "object",
        required: ["id", "name"],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          name: { type: "string", minLength: 1, maxLength: 160 },
        },
      },
      WorkItem: {
        type: "object",
        required: [
          "id",
          "workspaceId",
          "boardId",
          "title",
          "description",
          "type",
          "priority",
          "status",
          "assignees",
          "version",
          "createdAt",
          "updatedAt",
        ],
        additionalProperties: false,
        allOf: [
          {
            if: {
              properties: { type: { const: "approval" } },
              required: ["type"],
            },
            then: {
              required: ["approvalState"],
              not: { required: ["decisionState"] },
            },
            else: { not: { required: ["approvalState"] } },
          },
          {
            if: {
              properties: { type: { const: "decision" } },
              required: ["type"],
            },
            then: {
              required: ["decisionState"],
              not: { required: ["approvalState"] },
            },
            else: { not: { required: ["decisionState"] } },
          },
        ],
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          boardId: { type: "string", minLength: 3, maxLength: 128 },
          title: { type: "string", minLength: 1, maxLength: 500 },
          description: { type: "string", maxLength: 20000 },
          type: {
            type: "string",
            enum: [
              "task",
              "decision",
              "approval",
              "milestone",
              "idea",
              "request",
            ],
          },
          priority: {
            type: "string",
            enum: ["urgent", "high", "normal", "low", "none"],
          },
          status: {
            type: "string",
            enum: ["not_started", "working", "blocked", "review", "done"],
          },
          dueDate: { type: "string", format: "date" },
          assignees: {
            type: "array",
            maxItems: 100,
            items: { $ref: "#/components/schemas/Assignee" },
          },
          approvalState: {
            type: "string",
            enum: ["pending", "changes_requested", "approved", "rejected"],
          },
          decisionState: {
            type: "string",
            enum: ["needed", "analyzing", "delegated", "deferred", "decided"],
          },
          version: { type: "integer", minimum: 0, maximum: 2147483647 },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      PaginatedItems: {
        type: "object",
        required: ["data", "nextCursor"],
        additionalProperties: false,
        properties: {
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/WorkItem" },
          },
          nextCursor: { type: ["string", "null"] },
        },
      },
      AttentionSignal: {
        type: "object",
        required: [
          "id",
          "organizationId",
          "portfolioId",
          "entityType",
          "entityId",
          "signalType",
          "severity",
          "impact",
          "urgency",
          "responsibility",
          "reasonCode",
          "sourceFingerprint",
          "reason",
          "createdAt",
          "computedAt",
          "sourceEvidence",
          "metadata",
          "version",
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          organizationId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
          portfolioId: { type: "string", minLength: 3, maxLength: 128 },
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          entityType: { type: "string", minLength: 1, maxLength: 80 },
          entityId: { type: "string", minLength: 3, maxLength: 128 },
          signalType: { type: "string", minLength: 1, maxLength: 120 },
          severity: {
            type: "string",
            enum: ["info", "low", "medium", "high", "critical"],
          },
          impact: { type: "number", minimum: 1, maximum: 5 },
          urgency: { type: "number", minimum: 1, maximum: 5 },
          responsibility: { type: "number", exclusiveMinimum: 0 },
          reasonCode: { type: "string", minLength: 1, maxLength: 160 },
          sourceFingerprint: { type: "string", minLength: 1, maxLength: 256 },
          reason: { type: "string", minLength: 1, maxLength: 2000 },
          recommendedAction: { type: "string", maxLength: 2000 },
          createdAt: { type: "string", format: "date-time" },
          computedAt: { type: "string", format: "date-time" },
          sourceEvidence: {
            type: "array",
            minItems: 1,
            maxItems: 50,
            items: {
              type: "object",
              required: ["sourceType", "sourceId", "capturedAt"],
              additionalProperties: false,
              properties: {
                sourceType: { type: "string", minLength: 1, maxLength: 80 },
                sourceId: { type: "string", minLength: 3, maxLength: 128 },
                capturedAt: { type: "string", format: "date-time" },
                summary: { type: "string", maxLength: 1000 },
                data: { type: "object", additionalProperties: true },
              },
            },
          },
          resolvedAt: { type: "string", format: "date-time" },
          dismissedAt: { type: "string", format: "date-time" },
          snoozedUntil: { type: "string", format: "date-time" },
          actionReason: { type: "string", maxLength: 1000 },
          metadata: { type: "object", additionalProperties: true },
          version: { type: "integer", minimum: 0, maximum: 2147483647 },
        },
      },
      WaitingState: {
        type: "object",
        required: [
          "id",
          "organizationId",
          "portfolioId",
          "workspaceId",
          "entityType",
          "entityId",
          "title",
          "waitingType",
          "waitingSince",
          "followUpOwnerId",
          "followUpOwnerName",
          "version",
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          organizationId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
          portfolioId: { type: "string", minLength: 3, maxLength: 128 },
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          entityType: {
            type: "string",
            enum: ["work_item", "decision", "approval"],
          },
          entityId: { type: "string", minLength: 3, maxLength: 128 },
          title: { type: "string", minLength: 1, maxLength: 500 },
          description: { type: "string", maxLength: 20000, default: "" },
          waitingType: {
            type: "string",
            enum: [
              "person",
              "team",
              "external_partner",
              "client",
              "vendor",
              "decision",
              "document",
              "dependency",
              "other",
            ],
          },
          waitingReferenceId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
          waitingLabel: { type: "string", maxLength: 200 },
          waitingSince: { type: "string", format: "date" },
          expectedBy: { type: "string", format: "date" },
          followUpOwnerId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
          followUpOwnerName: {
            type: "string",
            minLength: 1,
            maxLength: 160,
          },
          nextFollowUp: { type: "string", format: "date" },
          waitingNote: { type: "string", maxLength: 2000 },
          resolvedAt: { type: "string", format: "date-time" },
          version: { type: "integer", minimum: 0, maximum: 2147483647 },
        },
      },
      WorkItemInput: {
        type: "object",
        required: [
          "workspaceId",
          "boardId",
          "title",
          "type",
          "priority",
          "status",
        ],
        additionalProperties: false,
        allOf: [
          {
            if: {
              properties: { type: { const: "approval" } },
              required: ["type"],
            },
            then: {
              required: ["approvalState"],
              not: { required: ["decisionState"] },
            },
            else: { not: { required: ["approvalState"] } },
          },
          {
            if: {
              properties: { type: { const: "decision" } },
              required: ["type"],
            },
            then: {
              required: ["decisionState"],
              not: { required: ["approvalState"] },
            },
            else: { not: { required: ["decisionState"] } },
          },
        ],
        properties: {
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          boardId: { type: "string", minLength: 3, maxLength: 128 },
          title: { type: "string", minLength: 1, maxLength: 500 },
          description: { type: "string", maxLength: 20000 },
          type: {
            type: "string",
            enum: [
              "task",
              "decision",
              "approval",
              "milestone",
              "idea",
              "request",
            ],
          },
          priority: {
            type: "string",
            enum: ["urgent", "high", "normal", "low", "none"],
          },
          status: {
            type: "string",
            enum: ["not_started", "working", "blocked", "review", "done"],
          },
          dueDate: { type: "string", format: "date" },
          assigneeIds: {
            type: "array",
            maxItems: 100,
            items: { type: "string", minLength: 3, maxLength: 128 },
          },
          approvalState: {
            type: "string",
            enum: ["pending", "changes_requested", "approved", "rejected"],
          },
          decisionState: {
            type: "string",
            enum: ["needed", "analyzing", "delegated", "deferred", "decided"],
          },
        },
      },
      WorkItemPatch: {
        type: "object",
        minProperties: 1,
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 1, maxLength: 500 },
          description: { type: "string", maxLength: 20000 },
          priority: {
            type: "string",
            enum: ["urgent", "high", "normal", "low", "none"],
          },
          status: {
            type: "string",
            enum: ["not_started", "working", "blocked", "review", "done"],
          },
          dueDate: { type: "string", format: "date" },
          assigneeIds: {
            type: "array",
            maxItems: 100,
            items: { type: "string", minLength: 3, maxLength: 128 },
          },
        },
      },
      InboxItem: {
        type: "object",
        required: [
          "id",
          "userId",
          "category",
          "title",
          "body",
          "resource",
          "version",
          "createdAt",
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          userId: { type: "string", minLength: 3, maxLength: 128 },
          category: { type: "string", minLength: 1, maxLength: 80 },
          title: { type: "string", minLength: 1, maxLength: 500 },
          body: { type: "string", maxLength: 20000 },
          resource: { type: "object", additionalProperties: true },
          doneAt: { type: "string", format: "date-time" },
          snoozedUntil: { type: "string", format: "date-time" },
          convertedItemId: { type: "string", minLength: 3, maxLength: 128 },
          convertedAt: { type: "string", format: "date-time" },
          version: { type: "integer", minimum: 0, maximum: 2147483647 },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      CaptureInboxItem: {
        type: "object",
        required: ["category", "title"],
        additionalProperties: false,
        properties: {
          category: { type: "string", minLength: 1, maxLength: 80 },
          title: { type: "string", minLength: 1, maxLength: 500 },
          body: { type: "string", maxLength: 20000, default: "" },
          resource: { type: "object", additionalProperties: true, default: {} },
        },
      },
      UpdateInboxItem: {
        type: "object",
        minProperties: 1,
        additionalProperties: false,
        properties: {
          done: { type: "boolean" },
          snoozedUntil: { type: ["string", "null"], format: "date-time" },
        },
      },
      ConvertInboxItem: {
        type: "object",
        required: ["workspaceId", "boardId"],
        additionalProperties: false,
        properties: {
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          boardId: { type: "string", minLength: 3, maxLength: 128 },
          title: { type: "string", minLength: 1, maxLength: 500 },
          description: { type: "string", maxLength: 20000 },
          type: {
            type: "string",
            enum: [
              "task",
              "decision",
              "approval",
              "milestone",
              "idea",
              "request",
            ],
            default: "task",
          },
          priority: {
            type: "string",
            enum: ["urgent", "high", "normal", "low", "none"],
            default: "normal",
          },
          status: {
            type: "string",
            enum: ["not_started", "working", "blocked", "review", "done"],
            default: "not_started",
          },
          dueDate: { type: "string", format: "date" },
          assigneeIds: {
            type: "array",
            maxItems: 100,
            items: { type: "string", minLength: 3, maxLength: 128 },
            default: [],
          },
          approvalState: {
            type: "string",
            enum: ["pending", "changes_requested", "approved", "rejected"],
          },
          decisionState: {
            type: "string",
            enum: ["needed", "analyzing", "delegated", "deferred", "decided"],
          },
        },
      },
      ConvertedInboxItem: {
        type: "object",
        required: ["inboxItem", "workItem"],
        additionalProperties: false,
        properties: {
          inboxItem: { $ref: "#/components/schemas/InboxItem" },
          workItem: { $ref: "#/components/schemas/WorkItem" },
        },
      },
      WorkItemEvidenceInput: {
        type: "object",
        required: ["body"],
        additionalProperties: false,
        properties: {
          body: { type: "string", minLength: 1, maxLength: 20000 },
        },
      },
      WorkItemEvidence: {
        type: "object",
        required: [
          "id",
          "itemId",
          "author",
          "body",
          "evidence",
          "createdAt",
          "updatedAt",
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          itemId: { type: "string", minLength: 3, maxLength: 128 },
          author: { $ref: "#/components/schemas/Assignee" },
          body: { type: "string", minLength: 1, maxLength: 20000 },
          evidence: { type: "boolean", const: true },
          editedAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      WorkItemEvidenceMutation: {
        type: "object",
        required: ["evidence", "itemVersion"],
        additionalProperties: false,
        properties: {
          evidence: { $ref: "#/components/schemas/WorkItemEvidence" },
          itemVersion: { type: "integer", minimum: 0, maximum: 2147483647 },
        },
      },
      WorkItemHistory: {
        type: "object",
        required: [
          "id",
          "type",
          "reasonCode",
          "summary",
          "occurredAt",
          "metadata",
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          type: { type: "string", minLength: 1, maxLength: 120 },
          reasonCode: { type: "string", minLength: 1, maxLength: 160 },
          summary: { type: "string", minLength: 1, maxLength: 2000 },
          actor: { $ref: "#/components/schemas/Assignee" },
          evidence: {
            type: "array",
            maxItems: 25,
            items: {
              type: "object",
              required: ["id", "body"],
              properties: {
                id: { type: "string", minLength: 3, maxLength: 128 },
                body: { type: "string", minLength: 1, maxLength: 20000 },
              },
            },
          },
          itemVersion: { type: "integer", minimum: 0 },
          occurredAt: { type: "string", format: "date-time" },
          metadata: { type: "object", additionalProperties: true },
        },
      },
      AssignWorkItem: {
        type: "object",
        required: ["assigneeIds"],
        additionalProperties: false,
        properties: {
          assigneeIds: {
            type: "array",
            maxItems: 100,
            items: { type: "string", minLength: 3, maxLength: 128 },
          },
        },
      },
      BlockWorkItem: {
        type: "object",
        required: ["blocked", "reason"],
        additionalProperties: false,
        properties: {
          blocked: { type: "boolean" },
          reason: { type: "string", minLength: 1, maxLength: 2000 },
        },
      },
      DecisionTransition: {
        type: "object",
        required: ["state", "rationale"],
        additionalProperties: false,
        properties: {
          state: {
            type: "string",
            enum: ["needed", "analyzing", "delegated", "deferred", "decided"],
          },
          rationale: { type: "string", minLength: 1, maxLength: 5000 },
          evidence: { type: "string", minLength: 1, maxLength: 20000 },
        },
      },
      ApprovalTransition: {
        type: "object",
        required: ["state", "rationale"],
        additionalProperties: false,
        properties: {
          state: {
            type: "string",
            enum: ["pending", "changes_requested", "approved", "rejected"],
          },
          rationale: { type: "string", minLength: 1, maxLength: 5000 },
          evidence: { type: "string", minLength: 1, maxLength: 20000 },
        },
      },
      ResolveWorkItem: {
        type: "object",
        required: ["evidence"],
        additionalProperties: false,
        properties: {
          evidence: { type: "string", minLength: 1, maxLength: 20000 },
        },
      },
      WorkItemTransition: {
        type: "object",
        required: ["item", "attentionRefreshQueued"],
        additionalProperties: false,
        properties: {
          item: { $ref: "#/components/schemas/WorkItem" },
          evidence: { $ref: "#/components/schemas/WorkItemEvidence" },
          attentionRefreshQueued: { type: "boolean" },
        },
      },
      AttentionAction: {
        type: "object",
        required: ["action"],
        additionalProperties: false,
        properties: {
          action: { type: "string", enum: ["resolve", "dismiss", "snooze"] },
          reason: { type: "string", minLength: 3, maxLength: 1000 },
          snoozedUntil: { type: "string", format: "date-time" },
        },
      },
      WaitingAction: {
        type: "object",
        required: ["action"],
        additionalProperties: false,
        allOf: [
          {
            if: { properties: { action: { const: "reschedule" } } },
            then: { required: ["nextFollowUp"] },
          },
        ],
        properties: {
          action: {
            type: "string",
            enum: ["resolve", "nudge", "reschedule"],
          },
          note: { type: "string", maxLength: 1000 },
          nextFollowUp: { type: "string", format: "date" },
        },
      },
      CreateWaitingState: {
        type: "object",
        required: [
          "workspaceId",
          "entityType",
          "entityId",
          "title",
          "waitingType",
          "followUpOwnerId",
        ],
        additionalProperties: false,
        properties: {
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          entityType: { type: "string", const: "work_item" },
          entityId: { type: "string", minLength: 3, maxLength: 128 },
          title: { type: "string", minLength: 1, maxLength: 500 },
          waitingType: {
            type: "string",
            enum: [
              "person",
              "team",
              "external_partner",
              "client",
              "vendor",
              "decision",
              "document",
              "dependency",
              "other",
            ],
          },
          waitingReferenceId: { type: "string", minLength: 3, maxLength: 128 },
          waitingLabel: { type: "string", maxLength: 200 },
          expectedBy: { type: "string", format: "date" },
          followUpOwnerId: { type: "string", minLength: 3, maxLength: 128 },
          nextFollowUp: { type: "string", format: "date" },
          note: { type: "string", maxLength: 2000 },
        },
      },
      WeeklyReviewInput: {
        type: "object",
        required: [
          "workspaceId",
          "health",
          "progress",
          "blocker",
          "nextMilestone",
          "priorityNextWeek",
        ],
        additionalProperties: false,
        properties: {
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          health: {
            type: "string",
            enum: ["on_track", "watch", "critical", "parked"],
          },
          progress: { type: "string", minLength: 1 },
          blocker: { type: "string", minLength: 1 },
          nextMilestone: { type: "string", minLength: 1 },
          decisionNeeded: { type: "string" },
          priorityNextWeek: { type: "string", minLength: 1 },
        },
      },
      WeeklyReviewRecord: {
        type: "object",
        required: [
          "id",
          "workspaceId",
          "author",
          "progress",
          "blocker",
          "nextMilestone",
          "priorityNextWeek",
          "publishedAt",
          "createdAt",
          "updatedAt",
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          workspaceId: { type: "string", minLength: 3, maxLength: 128 },
          author: { $ref: "#/components/schemas/Assignee" },
          health: {
            type: "string",
            enum: ["on_track", "watch", "critical", "parked"],
          },
          progress: { type: "string" },
          blocker: { type: "string" },
          nextMilestone: { type: "string" },
          decisionNeeded: { type: "string" },
          priorityNextWeek: { type: "string" },
          note: { type: "string" },
          publishedAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      WeeklyReviewResponse: {
        type: "object",
        required: ["update", "snapshot", "attentionRefreshQueued"],
        additionalProperties: false,
        properties: {
          update: {
            type: "object",
            required: [
              "id",
              "workspaceId",
              "health",
              "progress",
              "blocker",
              "nextMilestone",
              "priorityNextWeek",
              "publishedAt",
            ],
            additionalProperties: false,
            properties: {
              id: { type: "string", minLength: 3, maxLength: 128 },
              workspaceId: {
                type: "string",
                minLength: 3,
                maxLength: 128,
              },
              health: {
                type: "string",
                enum: ["on_track", "watch", "critical", "parked"],
              },
              progress: { type: "string" },
              blocker: { type: "string" },
              nextMilestone: { type: "string" },
              decisionNeeded: { type: "string" },
              priorityNextWeek: { type: "string" },
              publishedAt: { type: "string", format: "date-time" },
            },
          },
          snapshot: {
            type: "object",
            required: [
              "id",
              "organizationId",
              "portfolioId",
              "workspaceId",
              "capturedAt",
              "health",
              "source",
            ],
            additionalProperties: false,
            properties: {
              id: { type: "string", minLength: 3, maxLength: 128 },
              organizationId: {
                type: "string",
                minLength: 3,
                maxLength: 128,
              },
              portfolioId: {
                type: "string",
                minLength: 3,
                maxLength: 128,
              },
              workspaceId: {
                type: "string",
                minLength: 3,
                maxLength: 128,
              },
              capturedAt: { type: "string", format: "date-time" },
              health: {
                type: "string",
                enum: ["on_track", "watch", "critical", "parked"],
              },
              source: { type: "string", const: "weekly_review" },
            },
          },
          attentionRefreshQueued: { type: "boolean" },
        },
      },
      OperationsStatus: {
        type: "object",
        required: ["pendingOutbox", "failedCount"],
        additionalProperties: false,
        properties: {
          pendingOutbox: { type: "integer", minimum: 0 },
          failedCount: { type: "integer", minimum: 0 },
          oldestPendingAt: { type: "string", format: "date-time" },
          lastProcessedAt: { type: "string", format: "date-time" },
        },
      },
      CreatePrivacyRequest: {
        oneOf: [
          {
            type: "object",
            required: ["kind", "scope"],
            additionalProperties: false,
            properties: {
              kind: {
                type: "string",
                enum: [
                  "access",
                  "portability",
                  "erasure",
                  "rectification",
                  "restriction",
                  "objection",
                ],
              },
              scope: { type: "string", const: "user" },
            },
          },
          {
            type: "object",
            required: ["kind", "scope"],
            additionalProperties: false,
            properties: {
              kind: {
                type: "string",
                enum: ["access", "portability", "erasure", "restriction"],
              },
              scope: { type: "string", const: "organization" },
            },
          },
        ],
      },
      DataLifecycleRequest: {
        type: "object",
        required: [
          "id",
          "organizationId",
          "requestedBy",
          "kind",
          "scope",
          "status",
          "dueAt",
          "version",
          "createdAt",
          "updatedAt",
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          organizationId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
          requestedBy: { type: "string", minLength: 3, maxLength: 128 },
          subjectUserId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
          },
          kind: {
            type: "string",
            enum: [
              "access",
              "portability",
              "erasure",
              "rectification",
              "restriction",
              "objection",
            ],
          },
          scope: { type: "string", enum: ["user", "organization"] },
          status: {
            type: "string",
            enum: [
              "submitted",
              "under_review",
              "approved",
              "processing",
              "completed",
              "rejected",
              "cancelled",
              "failed",
            ],
          },
          dueAt: { type: "string", format: "date-time" },
          processingStartedAt: { type: "string", format: "date-time" },
          completedAt: { type: "string", format: "date-time" },
          cancelledAt: { type: "string", format: "date-time" },
          failureCode: { type: "string", maxLength: 128 },
          version: { type: "integer", minimum: 1 },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      RetentionPolicy: {
        type: "object",
        required: [
          "category",
          "retentionDays",
          "disposition",
          "legalHold",
          "policyVersion",
          "source",
          "effectiveAt",
          "enforcementStatus",
        ],
        additionalProperties: false,
        properties: {
          category: {
            type: "string",
            enum: [
              "identity",
              "organization",
              "work",
              "collaboration",
              "audit",
              "operations",
              "integrations",
              "billing",
            ],
          },
          retentionDays: { type: "integer", minimum: 1, maximum: 3650 },
          disposition: {
            type: "string",
            enum: ["delete", "anonymize", "archive", "manual_review"],
          },
          legalHold: { type: "boolean" },
          policyVersion: { type: "integer", minimum: 1 },
          source: {
            type: "string",
            enum: ["default", "organization_override"],
          },
          effectiveAt: { type: "string", format: "date-time" },
          enforcementStatus: { type: "string", const: "not_implemented" },
        },
      },
      UpdateRetentionPolicy: {
        type: "object",
        required: ["category", "retentionDays", "disposition", "legalHold"],
        additionalProperties: false,
        properties: {
          category: {
            type: "string",
            enum: [
              "identity",
              "organization",
              "work",
              "collaboration",
              "audit",
              "operations",
              "integrations",
              "billing",
            ],
          },
          retentionDays: { type: "integer", minimum: 1, maximum: 3650 },
          disposition: {
            type: "string",
            enum: ["delete", "anonymize", "archive", "manual_review"],
          },
          legalHold: { type: "boolean" },
        },
      },
      PrivacyInventoryEntry: {
        type: "object",
        required: [
          "category",
          "examples",
          "purpose",
          "classification",
          "defaultRetentionDays",
          "defaultDisposition",
        ],
        additionalProperties: false,
        properties: {
          category: {
            type: "string",
            enum: [
              "identity",
              "organization",
              "work",
              "collaboration",
              "audit",
              "operations",
              "integrations",
              "billing",
            ],
          },
          examples: {
            type: "array",
            maxItems: 12,
            items: { type: "string", minLength: 1, maxLength: 120 },
          },
          purpose: { type: "string", minLength: 1, maxLength: 300 },
          classification: {
            type: "string",
            enum: ["personal", "customer_content", "security", "commercial"],
          },
          defaultRetentionDays: {
            type: "integer",
            minimum: 1,
            maximum: 3650,
          },
          defaultDisposition: {
            type: "string",
            enum: ["delete", "anonymize", "archive", "manual_review"],
          },
        },
      },
      PrivacyProgramStatus: {
        type: "object",
        required: [
          "inventoryVersion",
          "policyVersion",
          "legalDocuments",
          "externalProviders",
          "requestsAreReviewedBeforeEffects",
          "inventory",
          "retention",
        ],
        additionalProperties: false,
        properties: {
          inventoryVersion: { type: "string", minLength: 1, maxLength: 64 },
          policyVersion: { type: "string", minLength: 1, maxLength: 64 },
          legalDocuments: {
            type: "object",
            required: ["privacyNotice", "terms"],
            additionalProperties: false,
            properties: {
              privacyNotice: {
                type: "object",
                required: ["version", "reviewStatus"],
                additionalProperties: false,
                properties: {
                  version: { type: "string" },
                  reviewStatus: { type: "string", const: "pending" },
                },
              },
              terms: {
                type: "object",
                required: ["version", "reviewStatus"],
                additionalProperties: false,
                properties: {
                  version: { type: "string" },
                  reviewStatus: { type: "string", const: "pending" },
                },
              },
            },
          },
          externalProviders: {
            type: "object",
            required: ["enabled", "configured", "revocationAutomation"],
            additionalProperties: false,
            properties: {
              enabled: { type: "boolean", const: false },
              configured: {
                type: "array",
                minItems: 0,
                maxItems: 0,
                items: { type: "string" },
              },
              revocationAutomation: {
                type: "string",
                const: "unavailable",
              },
            },
          },
          requestsAreReviewedBeforeEffects: { type: "boolean", const: true },
          inventory: {
            type: "array",
            items: { $ref: "#/components/schemas/PrivacyInventoryEntry" },
          },
          retention: {
            type: "array",
            items: { $ref: "#/components/schemas/RetentionPolicy" },
          },
        },
      },
      WorkspaceInput: {
        type: "object",
        required: ["portfolioId", "name", "type"],
        properties: {
          portfolioId: { type: "string" },
          name: { type: "string", minLength: 1, maxLength: 160 },
          type: {
            type: "string",
            enum: [
              "business",
              "brand",
              "client",
              "product",
              "department",
              "venture",
              "initiative",
              "investment",
              "campaign",
              "program",
              "project",
              "shared_function",
              "journey",
              "other",
            ],
          },
          progressMode: {
            type: "string",
            enum: [
              "none",
              "manual",
              "task_completion",
              "weighted_work_items",
              "milestone_completion",
            ],
          },
        },
      },
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message", "requestId"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              requestId: { type: "string" },
              details: {
                type: "object",
                properties: {
                  currentVersion: {
                    type: "integer",
                    minimum: 0,
                    maximum: 2147483647,
                  },
                },
                additionalProperties: true,
              },
            },
          },
        },
      },
    },
    responses: {
      Unauthenticated: {
        description: "Authentication required",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      Forbidden: {
        description: "Access denied",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      NotFound: {
        description: "Resource unavailable",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      Conflict: {
        description:
          "The resource version is stale, or an idempotency key was reused for a different request.",
        headers: {
          ETag: { $ref: "#/components/headers/ETag" },
        },
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      Validation: {
        description: "Validation failed",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      PreconditionRequired: {
        description: "A current quoted ETag is required in If-Match.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      RateLimited: {
        description:
          "The tenant or identity mutation budget is temporarily exhausted.",
        headers: {
          "Retry-After": {
            description: "Seconds until the request may be retried.",
            schema: { type: "integer", minimum: 1 },
          },
        },
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      RepositoryUnavailable: {
        description: "The live PostgreSQL repository is unavailable.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      CapabilityUnavailable: {
        description:
          "This capability is deliberately unavailable in live mode during Phase 1.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
    },
  },
} as const;
