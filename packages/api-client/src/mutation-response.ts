import {
  createItemSchema,
  entityTagSchema,
  versionTagEntityTagSchema,
  type CreateItemInput,
} from "@founderhq/api-contract";
import { TrevvApiError } from "./index.js";

type RawResponse = { body: unknown; response: Response };

/** Loaded for saves, keeping mutation-only validation out of read-only pages. */
export function validateNewItem(input: CreateItemInput) {
  const parsed = createItemSchema.safeParse(input);
  if (!parsed.success)
    throw new TrevvApiError(
      "invalid_input",
      parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "Task"}: ${issue.message}`)
        .join("; "),
      "local-validation",
      422,
    );
  return parsed.data;
}

export function confirmSavedResource<T>(
  result: RawResponse,
  schema: { parse(value: unknown): T },
  version: (value: T) => number | string,
) {
  const data = parseSavedResource(result, schema);
  return { data, etag: confirmedEntityTag(result, version(data)) };
}

function parseSavedResource<T>(
  result: RawResponse,
  schema: { parse(value: unknown): T },
): T {
  try {
    return schema.parse(result.body);
  } catch {
    throw new TrevvApiError(
      "invalid_save_confirmation",
      "The service returned an incomplete save confirmation. The change may already be saved. Your draft is kept; retry the same save to confirm it.",
      result.response.headers.get("x-request-id") ?? "unknown",
      result.response.status,
    );
  }
}

function confirmedEntityTag(
  result: RawResponse,
  version: number | string,
): string {
  // Resource versions are application concurrency tokens, not byte hashes.
  // Compression proxies may weaken or replace HTTP ETags. Prefer the API's
  // explicit receipt, and support matching weak ETags from older deployments.
  const receipt = result.response.headers.get("x-trevv-resource-version");
  const tag =
    receipt === null
      ? result.response.headers.get("etag")?.replace(/^W\//, "")
      : `"${receipt}"`;
  const parsed = (
    typeof version === "number" ? entityTagSchema : versionTagEntityTagSchema
  ).safeParse(tag);
  if (!parsed.success || parsed.data !== `"${version}"`)
    throw new TrevvApiError(
      "invalid_save_confirmation",
      "The service did not return a valid save receipt. The change may already be saved. Your draft is kept; retry the same save to confirm it.",
      result.response.headers.get("x-request-id") ?? "unknown",
      result.response.status,
    );
  return parsed.data;
}

export {
  completeOnboardingSchema,
  createPrivacyRequestSchema,
  weeklyReviewInputSchema,
} from "@founderhq/api-contract";
