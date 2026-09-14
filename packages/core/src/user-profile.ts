export const profileFieldLimits = {
  jobTitle: 120,
  bio: 1200,
  phone: 40,
  location: 160,
  website: 2048,
  avatarUrl: 2048,
  timezone: 100,
} as const;

export type UserProfileDetails = Partial<
  Record<keyof typeof profileFieldLimits, string>
>;
export interface AccountProfile {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  details: UserProfileDetails;
  version: string;
  pendingEmail?: {
    email: string;
    stage: "confirm-current" | "verify-new";
    expiresAt: string;
  };
}

export function parseProfileUpdate(value: unknown): {
  name: string;
  details: UserProfileDetails;
  version: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Enter your profile details.");
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !["name", "details", "version"].includes(key),
    )
  )
    throw new Error("Only personal profile fields can be changed here.");
  if (
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.trim().length > 160
  )
    throw new Error("Your name must contain between 1 and 160 characters.");
  if (
    typeof input.version !== "string" ||
    !input.version ||
    input.version.length > 100
  )
    throw new Error("Reload your profile before saving.");
  if (
    !input.details ||
    typeof input.details !== "object" ||
    Array.isArray(input.details)
  )
    throw new Error("Enter valid profile details.");
  const details: UserProfileDetails = {};
  for (const [key, raw] of Object.entries(input.details)) {
    if (!Object.hasOwn(profileFieldLimits, key) || typeof raw !== "string")
      throw new Error("An unsupported profile field was provided.");
    const field = key as keyof UserProfileDetails;
    const text = raw.trim();
    if (text.length > profileFieldLimits[field])
      throw new Error(`${key} is too long.`);
    if (!text) continue;
    if (field === "website" || field === "avatarUrl") {
      let url: URL;
      try {
        url = new URL(text);
      } catch {
        throw new Error("Use a complete HTTPS URL for your website or photo.");
      }
      if (url.protocol !== "https:" || url.username || url.password)
        throw new Error("Use a complete HTTPS URL without credentials.");
    }
    if (field === "timezone") {
      try {
        new Intl.DateTimeFormat("en", { timeZone: text });
      } catch {
        throw new Error("Choose a valid time zone.");
      }
    }
    details[field] = text;
  }
  return { name: input.name.trim(), details, version: input.version };
}
