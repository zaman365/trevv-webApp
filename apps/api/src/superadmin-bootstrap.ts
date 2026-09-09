import {
  bootstrapSuperadminOwner,
  createDatabase,
  recordSuperadminInvitationDelivery,
} from "@founderhq/db";
import {
  createFileMailSink,
  createSmtpMailDelivery,
} from "@founderhq/auth-server";
import { readRuntimeConfiguration } from "./runtime-config.js";
import { deliverAdministratorInvitation } from "./superadmin.js";

async function main() {
  const configuration = readRuntimeConfiguration();
  if (configuration.mode !== "live" || !configuration.superadmin)
    throw new Error(
      "Enable the isolated Superadmin runtime before creating the initial invitation.",
    );
  const database = createDatabase(configuration.databaseUrl);
  const mailDelivery =
    configuration.mailTransport.kind === "test_file"
      ? createFileMailSink(configuration.mailTransport.filePath)
      : createSmtpMailDelivery(configuration.mailTransport.configuration);
  try {
    const invitation = await bootstrapSuperadminOwner(database.db);
    const sent = await deliverAdministratorInvitation(
      {
        webOrigin: configuration.webOrigin,
        mailDelivery,
        mailFrom: configuration.mailFrom,
        recordDelivery: (kind, id, token, success) =>
          recordSuperadminInvitationDelivery(
            database.db,
            kind,
            id,
            token,
            success,
          ),
      },
      invitation,
    );
    process.stdout.write(
      `${JSON.stringify({ status: sent ? "invitation_sent" : "delivery_failed", email: invitation.email })}\n`,
    );
    if (!sent) process.exitCode = 1;
  } finally {
    await Promise.all([database.close(), mailDelivery.close?.()]);
  }
}
main().catch(() => {
  process.stderr.write(
    "Superadmin bootstrap did not complete. Verify configuration, migration and existing administrator status.\n",
  );
  process.exitCode = 1;
});
