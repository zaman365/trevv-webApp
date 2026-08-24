import { createAuthClient } from "better-auth/client";

export interface SecureSessionStore {
  get(key: "trevv.session" | "founderhq.session"): Promise<string | null>;
  set(key: "trevv.session" | "founderhq.session", value: string): Promise<void>;
  remove(key: "trevv.session" | "founderhq.session"): Promise<void>;
}

export function createTrevvAuthClient(baseURL: string) {
  return createAuthClient({ baseURL, basePath: "/api/auth" });
}
/** @deprecated Use createTrevvAuthClient. */
export const createFounderAuthClient = createTrevvAuthClient;

export function createMemorySessionStore(): SecureSessionStore {
  let value: string | null = null;
  return {
    get: async () => value,
    set: async (_key, next) => {
      value = next;
    },
    remove: async () => {
      value = null;
    },
  };
}
