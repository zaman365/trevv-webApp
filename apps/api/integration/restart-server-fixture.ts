import { serve } from "@hono/node-server";
import { createMemoryMailSink } from "@founderhq/auth-server";
import { createDatabase, createPostgresRepositories } from "@founderhq/db";
import { createApiApp } from "../src/app.js";
import { createPostgresAdapter } from "../src/postgres-adapter.js";

const databaseUrl = requiredEnvironment("DATABASE_URL");
const userId = requiredEnvironment("RESTART_TEST_USER_ID");
const port = Number.parseInt(requiredEnvironment("PORT"), 10);
if (!Number.isInteger(port) || port < 1 || port > 65_535)
  throw new Error("PORT must be a valid TCP port.");

const connection = createDatabase(databaseUrl);
const repositories = createPostgresRepositories(connection.db);
const resolveIdentity = async (request: Request) => {
  const authUserId = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/u)?.[1];
  return authUserId
    ? {
        authUserId,
        expiresAt: new Date(Date.now() + 3_600_000),
      }
    : null;
};
const adapter = createPostgresAdapter({ repositories, resolveIdentity });
const app = createApiApp({
  mode: "live",
  ...adapter,
  authIdentityResolver: {
    resolve: async (request) => {
      const identity = await resolveIdentity(request);
      return identity
        ? {
            authUserId: identity.authUserId,
            email: `${identity.authUserId}@identity.test`,
            name: identity.authUserId,
            emailVerified: true,
            sessionId: `restart-session-${identity.authUserId}`,
            expiresAt: identity.expiresAt,
          }
        : null;
    },
  },
  repositories,
  mailDelivery: createMemoryMailSink(),
  mailFrom: "no-reply@trevv.test",
  webOrigin: "http://web.trevv.test",
});

const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port }, () => {
  process.stdout.write(`${JSON.stringify({ event: "ready", port, userId })}\n`);
});

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await connection.close();
}

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void stop().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
