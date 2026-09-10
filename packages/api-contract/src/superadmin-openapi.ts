import { z } from "zod";
import {
  createSuperadminOrganizationSchema,
  inviteSuperadminSchema,
  superadminDirectorySchema,
  superadminDirectoryFilters,
  superadminOrganizationDetailSchema,
  superadminOrganizationUpdateSchema,
  superadminContactInputSchema,
  superadminContactDeleteSchema,
  superadminContactSchema,
  superadminOverviewSchema,
  superadminPhoneSchema,
  superadminReasonInputSchema,
  superadminSessionSchema,
  updateSuperadminSchema,
} from "./superadmin.js";

function operation(
  id: string,
  summary: string,
  response: object = { type: "object" },
  input?: object,
  parameters: object[] = [],
) {
  return {
    operationId: id,
    summary,
    tags: ["Superadmin"],
    security: [{ SuperadminCookie: [] }],
    parameters,
    ...(input
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: input } },
          },
        }
      : {}),
    responses: {
      "200": {
        description: "Authorised administrator response",
        content: { "application/json": { schema: response } },
      },
      "401": { description: "Separate administrator session required" },
      "403": {
        description: "Role, verified factor or recent authentication required",
      },
      "409": { description: "Conflict or last-owner protection" },
      "429": { description: "Administrator rate limit exceeded" },
    },
  };
}
const target = [
  {
    name: "id",
    in: "path",
    required: true,
    schema: { type: "string", minLength: 1, maxLength: 128 },
  },
];
const contactTarget = [
  ...target,
  {
    name: "contactId",
    in: "path",
    required: true,
    schema: { type: "string", minLength: 1, maxLength: 128 },
  },
];
const reason = z.toJSONSchema(superadminReasonInputSchema);
const mutation = (id: string, summary: string) =>
  operation(id, summary, undefined, reason, target);
export const superadminOpenApiPaths = {
  "/api/superadmin/session": {
    get: operation(
      "superadminSession",
      "Resolve the separate administrator identity, including enrollment state",
      z.toJSONSchema(superadminSessionSchema),
    ),
  },
  "/api/superadmin/overview": {
    get: operation(
      "superadminOverview",
      "Read audited operational totals without customer content",
      z.toJSONSchema(superadminOverviewSchema),
    ),
  },
  "/api/superadmin/directory/{kind}": {
    get: operation(
      "superadminDirectory",
      "Read a masked, paginated operational directory",
      z.toJSONSchema(superadminDirectorySchema),
      undefined,
      [
        {
          name: "kind",
          in: "path",
          required: true,
          schema: {
            type: "string",
            enum: [
              "organizations",
              "people",
              "invitations",
              "administrators",
              "audit",
            ],
          },
        },
        {
          name: "page",
          in: "query",
          schema: { type: "integer", minimum: 0, maximum: 40000, default: 0 },
        },
        {
          name: "q",
          in: "query",
          schema: { type: "string", maxLength: 100 },
          description:
            "People search matches account IDs; no undisclosed search of personal contact details.",
        },
        {
          name: "filter",
          in: "query",
          schema: {
            type: "string",
            enum: [
              ...new Set(Object.values(superadminDirectoryFilters).flat()),
            ],
            default: "all",
          },
          description: "Filter must be supported by the selected directory.",
        },
        {
          name: "organizationId",
          in: "query",
          schema: { type: "string", minLength: 1, maxLength: 128 },
          description: "Scope people or invitations to one organisation.",
        },
      ],
    ),
  },
  "/api/superadmin/organizations": {
    post: {
      ...operation(
        "superadminCreateOrganization",
        "Create an organisation and invite its first owner; operator/owner and recent authentication required",
        undefined,
        z.toJSONSchema(createSuperadminOrganizationSchema),
      ),
      responses: {
        "201": {
          description:
            "Organisation created; deliveryStatus reports sent or failed independently",
        },
        "403": { description: "Not authorised or verification too old" },
        "409": { description: "Organisation address already exists" },
      },
    },
  },
  "/api/superadmin/organizations/{id}": {
    get: operation(
      "superadminOrganization",
      "Read an audited organisation profile with masked business contacts",
      z.toJSONSchema(superadminOrganizationDetailSchema),
      undefined,
      target,
    ),
    patch: operation(
      "superadminUpdateOrganization",
      "Update operational profile with recent verification, reason and optimistic version",
      undefined,
      z.toJSONSchema(superadminOrganizationUpdateSchema),
      target,
    ),
  },
  "/api/superadmin/organizations/{id}/contacts": {
    post: {
      ...operation(
        "superadminCreateOrganizationContact",
        "Add a business contact; at most 12 contacts and one primary per organisation",
        undefined,
        z.toJSONSchema(superadminContactInputSchema),
        target,
      ),
      responses: {
        "201": { description: "Contact created" },
        "403": {
          description: "Recent operator or owner verification required",
        },
        "409": { description: "Primary contact or limit conflict" },
      },
    },
  },
  "/api/superadmin/organizations/{id}/contacts/{contactId}": {
    patch: operation(
      "superadminUpdateOrganizationContact",
      "Update a contact without overwriting concurrent changes",
      undefined,
      z.toJSONSchema(superadminContactInputSchema),
      contactTarget,
    ),
    delete: operation(
      "superadminDeleteOrganizationContact",
      "Remove an outdated business contact, retaining only action context in audit",
      undefined,
      z.toJSONSchema(superadminContactDeleteSchema),
      contactTarget,
    ),
  },
  "/api/superadmin/organizations/{id}/contacts/{contactId}/reveal": {
    post: operation(
      "superadminRevealOrganizationContact",
      "Audit purpose before revealing one business contact; operator or owner and recent verification required",
      z.toJSONSchema(superadminContactSchema),
      reason,
      contactTarget,
    ),
  },
  "/api/superadmin/people/{id}/reveal": {
    post: mutation(
      "superadminRevealContact",
      "Audit the purpose before revealing one account's name and email",
    ),
  },
  "/api/superadmin/people/{id}/revoke-sessions": {
    post: mutation(
      "superadminRevokeCustomerSessions",
      "Revoke customer sessions for a documented operational reason",
    ),
  },
  "/api/superadmin/invitations/{id}/resend": {
    post: mutation(
      "superadminResendInvitation",
      "Rotate and resend an unclaimed organisation invitation",
    ),
  },
  "/api/superadmin/invitations/{id}/revoke": {
    post: mutation(
      "superadminRevokeInvitation",
      "Withdraw an unaccepted organisation invitation",
    ),
  },
  "/api/superadmin/administrator-invitations": {
    get: operation(
      "superadminListAdministratorInvitations",
      "Owner-only view of outstanding administrator invitations",
    ),
    post: {
      ...operation(
        "superadminInviteAdministrator",
        "Owner-only invitation with an explicit role; recent verification required",
        undefined,
        z.toJSONSchema(inviteSuperadminSchema),
      ),
      responses: {
        "201": {
          description: "Administrator invitation created with delivery status",
        },
        "403": { description: "Owner with recent authentication required" },
        "409": { description: "Administrator already exists" },
      },
    },
  },
  "/api/superadmin/administrator-invitations/{id}/revoke": {
    post: mutation(
      "superadminRevokeAdministratorInvitation",
      "Owner withdraws an administrator invitation",
    ),
  },
  "/api/superadmin/administrators/{id}": {
    patch: operation(
      "superadminUpdateAdministrator",
      "Owner changes administrator role/access; self-revocation and final-owner removal are blocked",
      undefined,
      z.toJSONSchema(updateSuperadminSchema),
      target,
    ),
  },
  "/api/superadmin/security/phone": {
    patch: operation(
      "superadminUpdatePhone",
      "Update own optional, unverified contact phone; never an authentication factor",
      undefined,
      z.toJSONSchema(superadminPhoneSchema),
    ),
  },
  "/api/superadmin/security/sessions": {
    get: operation(
      "superadminListOwnSessions",
      "List own administrator session times without IPs or user agents",
    ),
  },
  "/api/superadmin/security/revoke-sessions": {
    post: operation(
      "superadminRevokeOwnSessions",
      "Revoke other administrator sessions after recent verification",
    ),
  },
};
