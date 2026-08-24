import { betterAuth } from "better-auth";
import { Pool } from "pg";

export interface AuthEnvironment {
  databaseUrl: string;
  baseUrl: string;
  secret: string;
  trustedOrigins: string[];
}

export function createTrevvAuth(environment: AuthEnvironment) {
  return betterAuth({
    appName: process.env.APP_NAME ?? "TREVV",
    baseURL: environment.baseUrl,
    secret: environment.secret,
    database: new Pool({ connectionString: environment.databaseUrl, max: 10 }),
    emailAndPassword: { enabled: true, requireEmailVerification: false },
    trustedOrigins: environment.trustedOrigins,
    advanced: {
      database: { joins: true },
      useSecureCookies: environment.baseUrl.startsWith("https://"),
    },
  });
}

export type TrevvAuth = ReturnType<typeof createTrevvAuth>;
/** @deprecated Compatibility alias for pre-TREVV integrations. */
export const createFounderAuth = createTrevvAuth;
/** @deprecated Use TrevvAuth. */
export type FounderAuth = TrevvAuth;
