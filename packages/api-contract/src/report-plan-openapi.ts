import { z } from "zod";
import {
  reportPlanFieldsSchema,
  reportPlanSchema,
  reportPlanListSchema,
} from "./report-plan.js";

const pathParameter = (name: string) => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string" },
});
const writeHeaders = [
  {
    name: "Idempotency-Key",
    in: "header",
    required: true,
    schema: { type: "string" },
  },
];
const versionHeader = {
  name: "If-Match",
  in: "header",
  required: true,
  description: 'Quoted record version, for example "0".',
  schema: { type: "string" },
};
function operation(
  id: string,
  summary: string,
  parameters: object[],
  schema: object,
  input?: object,
  status = "200",
) {
  return {
    operationId: id,
    summary,
    tags: ["Report and plan"],
    parameters,
    description:
      "Requires access to the workspace. Only the author can read private drafts or edit/archive their own updates. Published records are visible to people with workspace read access. Publishing requires work completed or in progress for reports, and a goal plus actions for plans. Daily records cover one date; end dates must not precede start dates. Published records cannot be reverted to drafts.",
    ...(input
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: input } },
          },
        }
      : {}),
    responses: {
      [status]: {
        description: "Scoped report and plan response",
        content: { "application/json": { schema } },
      },
      "422": { description: "Invalid fields, dates or mutation headers" },
      "428": { description: "Current record version required" },
      "401": { description: "Authentication required" },
      "403": { description: "Workspace access or writing permission required" },
      "404": { description: "Record not available to this user" },
      "409": {
        description:
          "Version conflict, invalid state change, or reused idempotency key",
      },
    },
  };
}
export const reportPlanOpenApiPaths = {
  "/api/v1/workspaces/{workspaceId}/report-plans": {
    get: operation(
      "listReportPlans",
      "List published workspace updates and your private drafts",
      [
        pathParameter("workspaceId"),
        ...["kind", "authorId", "state", "attention", "from", "to"].map(
          (name) => ({ name, in: "query", schema: { type: "string" } }),
        ),
        {
          name: "page",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 10000, default: 1 },
          description:
            "24 records per page, filtered before pagination. Date ranges match overlapping report/plan periods.",
        },
      ],
      z.toJSONSchema(reportPlanListSchema),
    ),
    post: operation(
      "createReportPlan",
      "Save a private draft or publish a member report or plan",
      [pathParameter("workspaceId"), ...writeHeaders],
      z.toJSONSchema(reportPlanSchema),
      z.toJSONSchema(reportPlanFieldsSchema),
      "201",
    ),
  },
  "/api/v1/report-plans/{id}": {
    get: operation(
      "getReportPlan",
      "Read an accessible report or plan",
      [pathParameter("id")],
      z.toJSONSchema(reportPlanSchema),
    ),
    patch: operation(
      "updateReportPlan",
      "Update your own report or plan",
      [pathParameter("id"), ...writeHeaders, versionHeader],
      z.toJSONSchema(reportPlanSchema),
      z.toJSONSchema(reportPlanFieldsSchema),
    ),
    delete: operation(
      "archiveReportPlan",
      "Archive your own report or plan without deleting its history",
      [pathParameter("id"), ...writeHeaders, versionHeader],
      z.toJSONSchema(reportPlanSchema),
    ),
  },
};
