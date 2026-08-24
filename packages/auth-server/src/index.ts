import { betterAuth } from "better-auth";
import { Pool } from "pg";

export interface AuthEnvironment {
  databaseUrl: string;
  baseUrl: string;
  secret: string;
  trustedOrigins: string[];
}

export function createFounderAuth(environment: AuthEnvironment) {
  return betterAuth({
    appName: process.env.APP_NAME ?? "FounderHQ",
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

export type FounderAuth = ReturnType<typeof createFounderAuth>;
