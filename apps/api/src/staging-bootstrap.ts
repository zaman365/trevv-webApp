import { completeOnboardingSchema } from "@founderhq/api-contract";
import {
  createMemoryMailSink,
  createTrevvAuthRuntime,
} from "@founderhq/auth-server";
import {
  createDatabase,
  createIdentityRepositories,
  createIdentityScope,
  withEmptyMarkedStagingDatabase,
} from "@founderhq/db";
import { pathToFileURL } from "node:url";
import { readRuntimeConfiguration } from "./runtime-config.js";

type Environment = Readonly<Record<string, string | undefined>>;

export interface StagingBootstrapConfiguration {
  databaseUrl: string;
  authBaseUrl: string;
  authSecret: string;
  webOrigin: string;
  mailFrom: string;
  releaseId: string;
  owner: { name: string; email: string; password: string };
  onboarding: ReturnType<typeof completeOnboardingSchema.parse>;
  confirmation: string;
}

export function readStagingBootstrapConfiguration(
  environment: Environment = process.env,
): StagingBootstrapConfiguration {
  if (environment.TREV_RUNTIME_ENVIRONMENT?.trim() !== "staging")
    throw new Error(
      "TREV_RUNTIME_ENVIRONMENT must explicitly equal staging for initial-owner bootstrap.",
    );
  if (environment.NODE_ENV?.trim() !== "production")
    throw new Error(
      "Initial-owner bootstrap must run the production-mode artifact.",
    );
  const runtime = readRuntimeConfiguration(environment);
  if (runtime.mode !== "live")
    throw new Error("Initial-owner bootstrap requires DEMO_MODE=false.");
  if (runtime.registrationMode !== "invite_only")
    throw new Error(
      "Initial-owner bootstrap requires REGISTRATION_MODE=invite_only.",
    );
  if (!runtime.releaseMetadata)
    throw new Error(
      "Initial-owner bootstrap requires immutable release metadata.",
    );

  const owner = {
    name: required(environment, "TREV_BOOTSTRAP_OWNER_NAME"),
    email: normalizedEmail(required(environment, "TREV_BOOTSTRAP_OWNER_EMAIL")),
    password: requiredSecret(environment, "TREV_BOOTSTRAP_OWNER_PASSWORD"),
  };
  if (owner.password.length < 12 || owner.password.length > 128)
    throw new Error(
      "TREV_BOOTSTRAP_OWNER_PASSWORD must contain 12-128 characters.",
    );

  return {
    databaseUrl: runtime.databaseUrl,
    authBaseUrl: runtime.authBaseUrl,
    authSecret: runtime.authSecret,
    webOrigin: runtime.webOrigin,
    mailFrom: runtime.mailFrom,
    releaseId: runtime.releaseMetadata.releaseId,
    owner,
    onboarding: completeOnboardingSchema.parse({
      step: 5,
      organizationName: required(
        environment,
        "TREV_BOOTSTRAP_ORGANIZATION_NAME",
      ),
      organizationSlug: required(
        environment,
        "TREV_BOOTSTRAP_ORGANIZATION_SLUG",
      ),
      workspaceName: required(environment, "TREV_BOOTSTRAP_WORKSPACE_NAME"),
      workspaceSlug: required(environment, "TREV_BOOTSTRAP_WORKSPACE_SLUG"),
      workspaceType:
        environment.TREV_BOOTSTRAP_WORKSPACE_TYPE?.trim() || "business",
      workspaceColor:
        environment.TREV_BOOTSTRAP_WORKSPACE_COLOR?.trim() || "#315c75",
      blueprintKey: environment.TREV_BOOTSTRAP_BLUEPRINT_KEY?.trim() || "blank",
    }),
    confirmation: required(environment, "TREV_STAGING_BOOTSTRAP_CONFIRM"),
  };
}

export async function bootstrapRemoteStagingOwner(
  configuration: StagingBootstrapConfiguration,
) {
  return withEmptyMarkedStagingDatabase(
    configuration.databaseUrl,
    {
      ownerEmail: configuration.owner.email,
      confirmation: configuration.confirmation,
    },
    async (inspection) => {
      const mail = createMemoryMailSink();
      const auth = createTrevvAuthRuntime({
        databaseUrl: configuration.databaseUrl,
        baseUrl: configuration.authBaseUrl,
        secret: configuration.authSecret,
        trustedOrigins: [configuration.webOrigin],
        // This handler is process-local and has no listening socket. Public
        // registration remains invite-only in the deployed API.
        registrationMode: "public",
        mailDelivery: mail,
        mailFrom: configuration.mailFrom,
      });
      const database = createDatabase(configuration.databaseUrl);
      try {
        await createAndVerifyOwner(auth, mail, configuration);
        const identity = await signInAndResolveOwner(auth, configuration);
        const requestId = `staging-bootstrap:${crypto.randomUUID()}`;
        const result = await createIdentityRepositories(
          database.db,
          createIdentityScope({ authUserId: identity.authUserId, requestId }),
        ).onboarding.complete(configuration.onboarding, {
          idempotencyKey: requestId,
        });
        return {
          status: "bootstrapped" as const,
          environment: "staging" as const,
          databaseName: inspection.databaseName,
          releaseId: configuration.releaseId,
          organizationId: result.organizationId,
          portfolioId: result.portfolioId,
          workspaceId: result.workspaceId,
          boardId: result.boardId,
        };
      } finally {
        await Promise.all([database.close(), auth.close()]);
      }
    },
  );
}

async function createAndVerifyOwner(
  auth: ReturnType<typeof createTrevvAuthRuntime>,
  mail: ReturnType<typeof createMemoryMailSink>,
  configuration: StagingBootstrapConfiguration,
): Promise<void> {
  const signup = await auth.handler(
    jsonRequest(
      new URL("/api/auth/sign-up/email", configuration.authBaseUrl),
      configuration.webOrigin,
      {
        name: configuration.owner.name,
        email: configuration.owner.email,
        password: configuration.owner.password,
        callbackURL: new URL("/onboarding", configuration.webOrigin).toString(),
      },
    ),
  );
  if (!signup.ok)
    throw new Error(
      `The process-local staging owner sign-up failed with HTTP ${signup.status}.`,
    );

  const message = mail
    .messages()
    .find(
      (candidate) =>
        candidate.to === configuration.owner.email &&
        candidate.subject === "Verify your TREVV email",
    );
  const deliveryUrl = message?.text.match(/https?:\/\/\S+/u)?.[0];
  const token = deliveryUrl
    ? new URL(deliveryUrl).searchParams.get("token")
    : null;
  if (!token)
    throw new Error(
      "The process-local staging bootstrap did not receive a verification token.",
    );

  const verification = new URL(
    "/api/auth/verify-email",
    configuration.authBaseUrl,
  );
  verification.searchParams.set("token", token);
  verification.searchParams.set(
    "callbackURL",
    new URL("/onboarding", configuration.webOrigin).toString(),
  );
  const response = await auth.handler(
    new Request(verification, {
      method: "GET",
      headers: { origin: configuration.webOrigin },
      redirect: "manual",
    }),
  );
  if (response.status < 200 || response.status >= 400)
    throw new Error(
      `The process-local staging owner verification failed with HTTP ${response.status}.`,
    );
}

async function signInAndResolveOwner(
  auth: ReturnType<typeof createTrevvAuthRuntime>,
  configuration: StagingBootstrapConfiguration,
) {
  const response = await auth.handler(
    jsonRequest(
      new URL("/api/auth/sign-in/email", configuration.authBaseUrl),
      configuration.webOrigin,
      {
        email: configuration.owner.email,
        password: configuration.owner.password,
        rememberMe: false,
      },
    ),
  );
  if (!response.ok)
    throw new Error(
      `The process-local staging owner sign-in failed with HTTP ${response.status}.`,
    );
  const cookie = setCookieValues(response.headers)
    .map((value) => value.split(";", 1)[0])
    .filter(Boolean)
    .join("; ");
  if (!cookie)
    throw new Error("Staging owner sign-in returned no session cookie.");
  const identity = await auth.identityResolver.resolve(
    new Request(new URL("/api/v1/session", configuration.authBaseUrl), {
      headers: { cookie },
    }),
  );
  if (!identity?.emailVerified)
    throw new Error("The staging owner identity is not verified.");
  return identity;
}

function jsonRequest(url: URL, origin: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

function setCookieValues(headers: Headers): string[] {
  return typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [headers.get("set-cookie")].filter(
        (value): value is string => value !== null,
      );
}

function normalizedEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/u.test(normalized) || normalized.length > 320)
    throw new Error(
      "TREV_BOOTSTRAP_OWNER_EMAIL must be a valid email address.",
    );
  return normalized;
}

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requiredSecret(environment: Environment, name: string): string {
  const value = environment[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const result = await bootstrapRemoteStagingOwner(
    readStagingBootstrapConfiguration(),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const isExecutable =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isExecutable)
  main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        status: "failed",
        operation: "remote-staging-initial-owner-bootstrap",
        error:
          error instanceof Error ? error.message : "Unknown bootstrap error.",
      })}\n`,
    );
    process.exitCode = 1;
  });
