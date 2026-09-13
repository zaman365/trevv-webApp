import { createConversationSchema } from "@founderhq/api-contract";
import type { ShareJob } from "./planning-sharing";

// This journal only recovers pending submissions. Rooms and membership are
// canonical server records and are never inferred from the local journal.
export function recoverShareJobs(value: unknown): ShareJob[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof entry.key !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(entry.key) ||
      typeof entry.title !== "string" ||
      entry.title.length > 500 ||
      (entry.roomId !== undefined && typeof entry.roomId !== "string")
    )
      return [];
    const parsed = createConversationSchema.safeParse(entry.input);
    if (!parsed.success || !parsed.data.context || !parsed.data.openingMessage)
      return [];
    return [
      {
        key: entry.key,
        title: entry.title,
        input: parsed.data,
        ...(entry.roomId ? { roomId: entry.roomId } : {}),
      },
    ];
  });
}
