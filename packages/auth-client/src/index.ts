import { createAuthClient } from "better-auth/client";

export interface SecureSessionStore {
  get(key: "founderhq.session"): Promise<string | null>;
  set(key: "founderhq.session", value: string): Promise<void>;
  remove(key: "founderhq.session"): Promise<void>;
}

export function createFounderAuthClient(baseURL: string) {
  return createAuthClient({ baseURL, basePath: "/api/auth" });
}

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
