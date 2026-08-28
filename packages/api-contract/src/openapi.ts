export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "TREVV API",
    version: "2.0.0",
    description:
      "Versioned, permission-scoped contracts shared by the TREVV Web, Mobile, and Desktop clients.",
  },
  servers: [{ url: "http://localhost:8787", description: "Local API" }],
  tags: [
    { name: "System" },
    { name: "Portfolio" },
    { name: "Attention" },
    { name: "Waiting" },
    { name: "Management Memory" },
    { name: "Insights" },
    { name: "Blueprints" },
    { name: "Commercial" },
    { name: "Workspaces" },
    { name: "Hubs", description: "Legacy Workspace route aliases" },
    { name: "Items" },
    { name: "Search" },
    { name: "Exports" },
    { name: "Events" },
  ],
  paths: {
    "/api/v1/health": {
      get: {
        tags: ["System"],
        operationId: "health",
        responses: { "200": { description: "Service health" } },
      },
    },
    "/api/v1/session": {
      get: {
        tags: ["System"],
        operationId: "getSession",
        responses: {
          "200": { description: "Current session" },
          "401": { $ref: "#/components/responses/Unauthenticated" },
        },
      },
    },
    "/api/v1/portfolio": {
      get: {
        tags: ["Portfolio"],
        operationId: "getPortfolio",
        responses: {
          "200": { description: "Accessible Portfolio roll-up" },
          "401": { $ref: "#/components/responses/Unauthenticated" },
        },
      },
    },
    "/api/v1/portfolios": {
      get: {
        tags: ["Portfolio"],
        operationId: "listPortfolios",
        responses: { "200": { description: "Accessible Portfolios" } },
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
          "200": { description: "Active explainable Attention signals" },
        },
      },
    },
    "/api/v1/attention/{id}": {
      patch: {
        tags: ["Attention"],
        operationId: "actOnAttentionSignal",
        parameters: [{ $ref: "#/components/parameters/ItemId" }],
        responses: {
          "200": { description: "Resolved, dismissed, or snoozed signal" },
          "422": { $ref: "#/components/responses/Validation" },
        },
      },
    },
    "/api/v1/waiting": {
      get: {
        tags: ["Waiting"],
        operationId: "listWaitingStates",
        responses: {
          "200": { description: "Accessible active waiting states" },
        },
      },
    },
    "/api/v1/waiting/{id}": {
      patch: {
        tags: ["Waiting"],
        operationId: "updateWaitingState",
        parameters: [{ $ref: "#/components/parameters/ItemId" }],
        responses: { "200": { description: "Updated waiting state" } },
      },
    },
    "/api/v1/change-radar": {
      get: {
        tags: ["Management Memory"],
        operationId: "getChangeRadar",
        responses: {
          "200": {
            description: "Meaningful changes since the user checkpoint",
          },
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
          },
        },
      },
    },
    "/api/v1/insights": {
      get: {
        tags: ["Insights"],
        operationId: "listInsights",
        responses: {
          "200": { description: "Permission-filtered operational evidence" },
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
              "Blueprint versions, instances, and safe update preview",
          },
        },
      },
    },
    "/api/v1/team/pressure": {
      get: {
        tags: ["Attention"],
        operationId: "getTeamPressure",
        responses: { "200": { description: "Cross-Hub capacity evidence" } },
      },
    },
    "/api/v1/entitlements": {
      get: {
        tags: ["Commercial"],
        operationId: "getEntitlements",
        responses: {
          "200": { description: "Central capability entitlement set" },
        },
      },
    },
    "/api/v1/import/preview": {
      post: {
        tags: ["Commercial"],
        operationId: "previewImport",
        responses: {
          "200": { description: "Dry-run mapping and unsupported-data report" },
        },
      },
    },
    "/api/v1/hubs": {
      get: {
        tags: ["Hubs"],
        operationId: "listHubs",
        deprecated: true,
        responses: { "200": { description: "Accessible Hubs" } },
      },
    },
    "/api/v1/hubs/{slug}": {
      get: {
        tags: ["Hubs"],
        operationId: "getHub",
        deprecated: true,
        parameters: [{ $ref: "#/components/parameters/HubSlug" }],
        responses: {
          "200": { description: "Hub overview and accessible work" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/v1/workspaces": {
      get: {
        tags: ["Workspaces"],
        operationId: "listWorkspaces",
        responses: { "200": { description: "Accessible Workspaces" } },
      },
    },
    "/api/v1/workspaces/{slug}": {
      get: {
        tags: ["Workspaces"],
        operationId: "getWorkspace",
        parameters: [{ $ref: "#/components/parameters/HubSlug" }],
        responses: {
          "200": { description: "Workspace overview and accessible work" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/v1/items": {
      get: {
        tags: ["Items"],
        operationId: "listItems",
        parameters: [
          { name: "cursor", in: "query", schema: { type: "string" } },
          { name: "hubId", in: "query", schema: { type: "string" } },
          {
            name: "workspaceId",
            in: "query",
            schema: { type: "string" },
          },
          { name: "assignee", in: "query", schema: { type: "string" } },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
          },
        ],
        responses: {
          "200": {
            description: "Permission-filtered, cursor-paginated work items",
          },
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
          "201": { description: "Created work item" },
          "422": { $ref: "#/components/responses/Validation" },
        },
      },
    },
    "/api/v1/items/{id}": {
      patch: {
        tags: ["Items"],
        operationId: "updateItem",
        parameters: [
          { $ref: "#/components/parameters/ItemId" },
          {
            name: "If-Match",
            in: "header",
            required: true,
            schema: { type: "integer", minimum: 0 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: false },
            },
          },
        },
        responses: {
          "200": { description: "Updated work item" },
          "409": { description: "Version conflict" },
          "422": { $ref: "#/components/responses/Validation" },
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
          "200": { description: "Permission-filtered Hub and item results" },
        },
      },
    },
    "/api/v1/export/organization.json": {
      get: {
        tags: ["Exports"],
        operationId: "exportOrganization",
        responses: {
          "200": { description: "Organization JSON export" },
          "403": { $ref: "#/components/responses/Forbidden" },
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
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Board CSV export",
            content: { "text/csv": {} },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/v1/events": {
      get: {
        tags: ["Events"],
        operationId: "events",
        responses: {
          "200": {
            description: "Server-sent event stream",
            content: { "text/event-stream": {} },
          },
        },
      },
    },
  },
  components: {
    parameters: {
      HubSlug: {
        name: "slug",
        in: "path",
        required: true,
        schema: { type: "string" },
      },
      ItemId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string" },
      },
      IdempotencyKey: {
        name: "Idempotency-Key",
        in: "header",
        required: false,
        schema: { type: "string", format: "uuid" },
      },
    },
    schemas: {
      WorkItemInput: {
        type: "object",
        required: ["hubId", "boardId", "title", "type", "priority", "status"],
        additionalProperties: false,
        properties: {
          hubId: { type: "string" },
          boardId: { type: "string" },
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
          assignee: { type: "string" },
        },
      },
      HubInput: {
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
              details: { type: "object" },
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
      Validation: {
        description: "Validation failed",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
    },
  },
} as const;
