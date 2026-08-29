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
    { name: "Items" },
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
        operationId: "events",
        responses: {
          "200": {
            description: "Demo server-sent event stream",
            content: {
              "text/event-stream": {
                schema: { type: "string" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
          "501": { $ref: "#/components/responses/CapabilityUnavailable" },
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
      Session: {
        type: "object",
        required: [
          "user",
          "organizationId",
          "organization",
          "availableOrganizations",
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
            $ref: "#/components/schemas/OrganizationSummary",
          },
          availableOrganizations: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            items: { $ref: "#/components/schemas/OrganizationSummary" },
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
          "icon",
          "accent",
          "type",
          "stage",
          "health",
          "healthNote",
          "priority",
          "metrics",
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 3, maxLength: 128 },
          portfolioId: { type: "string", minLength: 3, maxLength: 128 },
          slug: { type: "string", minLength: 1, maxLength: 120 },
          name: { type: "string", minLength: 1, maxLength: 160 },
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
          "type",
          "priority",
          "status",
          "assignees",
          "version",
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
          "reason",
          "createdAt",
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
          reason: { type: "string", minLength: 1, maxLength: 2000 },
          recommendedAction: { type: "string", maxLength: 2000 },
          createdAt: { type: "string", format: "date-time" },
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
