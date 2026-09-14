import {
  createItemSchema,
  entityTagSchema,
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
  version: (value: T) => number,
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

function confirmedEntityTag(result: RawResponse, version: number): string {
  const parsed = entityTagSchema.safeParse(result.response.headers.get("etag"));
  if (
    !parsed.success ||
    Number.parseInt(parsed.data.slice(1, -1), 10) !== version
  )
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
