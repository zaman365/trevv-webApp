import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const adminUrl = new URL(required("STAGING_DATABASE_ADMIN_URL"));
const databaseName = required("STAGING_UPGRADE_DATABASE");
const previousMigration = required("STAGING_PREVIOUS_MIGRATION");
const failureInjection = process.env.STAGING_UPGRADE_FAILURE_INJECTION?.trim();
if (failureInjection && failureInjection !== "after_previous_fixture")
  throw new Error(
    "STAGING_UPGRADE_FAILURE_INJECTION supports only after_previous_fixture.",
  );
if (!/^trevv_[a-z0-9_]{3,48}_upgrade$/u.test(databaseName))
  throw new Error(
    "STAGING_UPGRADE_DATABASE must be an isolated trevv_*_upgrade database.",
  );

const requireFromDatabasePackage = createRequire(
  new URL("../packages/db/package.json", import.meta.url),
);
const postgresEntry = requireFromDatabasePackage.resolve("postgres");
const drizzleEntry = requireFromDatabasePackage.resolve(
  "drizzle-orm/postgres-js",
);
const migratorEntry = requireFromDatabasePackage.resolve(
  "drizzle-orm/postgres-js/migrator",
);
const [{ default: postgres }, { drizzle }, { migrate }] = await Promise.all([
  import(pathToFileURL(postgresEntry).href),
  import(pathToFileURL(drizzleEntry).href),
  import(pathToFileURL(migratorEntry).href),
]);
const migrationsDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "../packages/db/migrations",
);
const migrationFiles = (await readdir(migrationsDirectory))
  .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
  .sort();
const previousIndex = migrationFiles.indexOf(previousMigration);
if (previousIndex < 0)
  throw new Error(`Previous migration ${previousMigration} does not exist.`);
if (previousIndex === migrationFiles.length - 1)
  throw new Error("The upgrade smoke requires at least one newer migration.");
const journal = JSON.parse(
  await readFile(join(migrationsDirectory, "meta/_journal.json"), "utf8"),
);
const journalTags = journal.entries.map((entry) => `${entry.tag}.sql`);
if (JSON.stringify(journalTags) !== JSON.stringify(migrationFiles))
  throw new Error(
    "The SQL migration files and Drizzle journal are not an exact ordered match.",
  );

const admin = postgres(adminUrl.toString(), { max: 1, prepare: false });
const targetUrl = new URL(adminUrl);
targetUrl.pathname = `/${databaseName}`;
let target;
let previousMigrationsDirectory;
let result;
let primaryError;

try {
  await dropUpgradeDatabase(admin, databaseName);
  await admin.unsafe(`create database "${databaseName}"`);
  target = postgres(targetUrl.toString(), { max: 1, prepare: false });

  previousMigrationsDirectory =
    await createPreviousMigrationsDirectory(previousIndex);
  await migrate(drizzle(target), {
    migrationsFolder: previousMigrationsDirectory,
  });
  await assertMigrationJournalCount(target, previousIndex + 1);
  await seedPreviousReleaseFixture(target);
  if (failureInjection === "after_previous_fixture")
    throw new Error("Injected staging upgrade failure after fixture creation.");
  await migrate(drizzle(target), { migrationsFolder: migrationsDirectory });
  await assertMigrationJournalCount(target, migrationFiles.length);
  const journalBeforeNoop = await migrationJournalRows(target);
  await migrate(drizzle(target), { migrationsFolder: migrationsDirectory });
  const journalAfterNoop = await migrationJournalRows(target);
  if (JSON.stringify(journalAfterNoop) !== JSON.stringify(journalBeforeNoop))
    throw new Error("A second Drizzle migration pass was not a no-op.");

  const [organization] = await target`
    select id, name from organizations where id = 'org-staging-upgrade'
  `;
  const [conversation] = await target`
    select id, workspace_id, portfolio_id, version, retention_days
    from conversations where id = 'conversation-staging-upgrade'
  `;
  const [message] = await target`
    select id, workspace_id, client_message_id, sequence, expires_at, version
    from conversation_messages where id = 'message-staging-upgrade'
  `;
  const [tables] = await target`
    select
      to_regclass('public.teams')::text as teams,
      to_regclass('public.team_rooms')::text as team_rooms,
      to_regclass('public.collaboration_events')::text as collaboration_events,
      to_regclass('public.conversation_message_metadata_quarantine')::text
        as metadata_quarantine,
      to_regclass('public.legacy_collaboration_record_quarantine')::text
        as record_quarantine
  `;
  const [legacyTeam] = await target`
    select team.id, team.name, team.purpose, room.conversation_id,
      count(member.user_id) filter (where member.removed_at is null)::int
        as active_member_count,
      count(member.user_id) filter (
        where member.removed_at is null and member.role = 'lead'
      )::int as active_lead_count
    from teams team
    inner join team_rooms room
      on room.organization_id = team.organization_id
      and room.team_id = team.id
    left join team_members member
      on member.organization_id = team.organization_id
      and member.team_id = team.id
    where team.organization_id = 'org-staging-upgrade'
      and room.conversation_id = 'conversation-staging-team'
    group by team.id, team.name, team.purpose, room.conversation_id
  `;
  const legacyTeamParticipants = await target`
    select user_id, participant_role, source, removed_at
    from conversation_participants
    where organization_id = 'org-staging-upgrade'
      and conversation_id = 'conversation-staging-team'
    order by user_id
  `;
  const legacyTeamMembers = await target`
    select user_id, role, removed_at
    from team_members
    where organization_id = 'org-staging-upgrade'
      and team_id = ${legacyTeam?.id ?? "missing-team"}
    order by user_id
  `;
  const legacyDirects = await target`
    select id, direct_key, created_at
    from conversations
    where organization_id = 'org-staging-upgrade'
      and id in (
        'conversation-staging-direct-a',
        'conversation-staging-direct-b'
      )
    order by created_at, id
  `;
  const [preservedMessages] = await target`
    select count(*)::int as message_count,
      count(*) filter (where body like 'Preserve %')::int as preserved_body_count
    from conversation_messages
    where organization_id = 'org-staging-upgrade'
  `;
  const [normalizedMetadata] = await target`
    select metadata, version
    from conversation_messages
    where id = 'message-staging-team'
  `;
  const [quarantinedMetadata] = await target`
    select original_metadata, original_octet_length, quarantine_reason
    from conversation_message_metadata_quarantine
    where message_id = 'message-staging-team'
  `;
  const [metadataQuarantineCoverage] = await target`
    select count(*)::int as quarantine_count
    from conversation_message_metadata_quarantine
    where organization_id = 'org-staging-upgrade'
  `;
  const [normalizedMetadataCoverage] = await target`
    select count(*) filter (
      where metadata ->> 'legacyMetadataQuarantined' = 'true'
    )::int as normalized_count
    from conversation_messages
    where organization_id = 'org-staging-upgrade'
  `;
  const [normalizedConversation] = await target`
    select title, purpose, version,
      octet_length(convert_to(trim(title), 'UTF8'))::int as title_octets,
      octet_length(convert_to(trim(purpose), 'UTF8'))::int as purpose_octets
    from conversations
    where id = 'conversation-staging-normalize'
  `;
  const normalizedMessages = await target`
    select id, body, linked_entity_type, linked_entity_id,
      response_owner_id, response_due_at, response_state, version
    from conversation_messages
    where id in (
      'message-staging-normalize-empty',
      'message-staging-normalize-large'
    )
    order by id
  `;
  const [normalizedParticipant] = await target`
    select participant_role, notification_level, version
    from conversation_participants
    where organization_id = 'org-staging-upgrade'
      and conversation_id = 'conversation-staging-normalize'
      and user_id = 'user-staging-upgrade'
  `;
  const [senderTombstone] = await target`
    select participant_role, notification_level, source, removed_at
    from conversation_participants
    where organization_id = 'org-staging-upgrade'
      and conversation_id = 'conversation-staging-normalize'
      and user_id = 'user-staging-viewer'
  `;
  const [reactionCoverage] = await target`
    select count(*)::int as reaction_count,
      count(distinct emoji)::int as reaction_kind_count
    from conversation_reactions
    where organization_id = 'org-staging-upgrade'
      and message_id = 'message-staging-normalize-large'
  `;
  const repairedTeamResponses = await target`
    select id, response_owner_id, response_due_at, response_state, version
    from conversation_messages
    where id in (
      'message-staging-team-guest-request',
      'message-staging-team-viewer-request',
      'message-staging-archived-team-request'
    )
    order by id
  `;
  const [recordQuarantineCoverage] = await target`
    select count(*)::int as quarantine_count,
      count(*) filter (
        where quarantine_reason = 'legacy_message_body_contract_bounds'
      )::int as body_count,
      count(*) filter (
        where quarantine_reason = 'legacy_conversation_contract_bounds'
      )::int as conversation_count,
      count(*) filter (
        where quarantine_reason = 'legacy_participant_contract_values'
      )::int as participant_count,
      count(*) filter (
        where quarantine_reason in (
          'legacy_reaction_emoji_invalid',
          'legacy_message_reaction_kind_overflow'
        )
      )::int as reaction_count,
      count(*) filter (
        where quarantine_reason = 'legacy_team_response_owner_ineligible'
      )::int as team_response_count
    from legacy_collaboration_record_quarantine
    where organization_id = 'org-staging-upgrade'
  `;
  const [preservedRawLargeBody] = await target`
    select octet_length(convert_to(original_record ->> 'body', 'UTF8'))::int
      as body_octets
    from legacy_collaboration_record_quarantine
    where organization_id = 'org-staging-upgrade'
      and entity_type = 'message'
      and entity_id = 'message-staging-normalize-large'
      and quarantine_reason = 'legacy_message_body_contract_bounds'
  `;
  const [retentionCoverage] = await target`
    select count(*)::int as event_count,
      count(*) filter (
        where event.available_at = message.expires_at
      )::int as matching_schedule_count
    from conversation_messages message
    inner join outbox_events event
      on event.organization_id = message.organization_id
      and event.event_type = 'message.retention_due'
      and event.aggregate_type = 'message'
      and event.aggregate_id = message.id
    where message.organization_id = 'org-staging-upgrade'
  `;
  const [cancelledResponseState] = await target`
    select enumlabel
    from pg_enum
    where enumtypid = 'message_response_state'::regtype
      and enumlabel = 'cancelled'
  `;

  if (organization?.name !== "Upgrade Sentinel")
    throw new Error("The previous-release organization was not preserved.");
  if (
    conversation?.workspace_id !== "workspace-staging-upgrade" ||
    conversation?.portfolio_id !== "portfolio-staging-upgrade" ||
    conversation?.version !== 1 ||
    conversation?.retention_days !== 365
  )
    throw new Error("The previous-release conversation was not backfilled.");
  if (
    message?.workspace_id !== "workspace-staging-upgrade" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      message?.client_message_id ?? "",
    ) ||
    message?.sequence !== 1 ||
    message?.version !== 1 ||
    !message?.expires_at
  )
    throw new Error("The previous-release message was not backfilled safely.");
  if (
    tables?.teams !== "teams" ||
    tables?.team_rooms !== "team_rooms" ||
    tables?.collaboration_events !== "collaboration_events" ||
    tables?.metadata_quarantine !==
      "conversation_message_metadata_quarantine" ||
    tables?.record_quarantine !== "legacy_collaboration_record_quarantine"
  )
    throw new Error("The current collaboration schema was not created.");
  if (
    legacyTeam?.name !== "Legacy Technology" ||
    legacyTeam?.purpose !== "Preserve this Team room" ||
    legacyTeam?.conversation_id !== "conversation-staging-team" ||
    legacyTeam?.active_member_count !== 2 ||
    legacyTeam?.active_lead_count !== 1
  )
    throw new Error(
      "The legacy Team room was not converted deterministically.",
    );
  if (
    legacyTeamMembers.length !== 2 ||
    legacyTeamMembers.filter((member) => member.removed_at === null).length !==
      2 ||
    legacyTeamMembers.filter((member) => member.role === "lead").length !== 1 ||
    legacyTeamMembers.some((member) =>
      ["user-staging-guest", "user-staging-viewer"].includes(member.user_id),
    )
  )
    throw new Error(
      "The legacy Team member boundary was not preserved safely.",
    );
  const participantById = new Map(
    legacyTeamParticipants.map((participant) => [
      participant.user_id,
      participant,
    ]),
  );
  if (
    participantById.get("user-staging-upgrade")?.participant_role !== "owner" ||
    participantById.get("user-staging-upgrade")?.source !== "team" ||
    participantById.get("user-staging-member")?.participant_role !== "member" ||
    participantById.get("user-staging-member")?.source !== "team" ||
    !participantById.get("user-staging-guest")?.removed_at ||
    !participantById.get("user-staging-viewer")?.removed_at
  )
    throw new Error("Legacy Team participants were not synchronized safely.");
  const canonicalDirectKey = createHash("sha256")
    .update(
      ["user-staging-member", "user-staging-upgrade"].sort().join("\u001f"),
      "utf8",
    )
    .digest("hex");
  if (
    legacyDirects.length !== 2 ||
    legacyDirects[0]?.id !== "conversation-staging-direct-a" ||
    legacyDirects[0]?.direct_key !== canonicalDirectKey ||
    !/^[0-9a-f]{64}$/u.test(legacyDirects[1]?.direct_key ?? "") ||
    legacyDirects[1]?.direct_key === canonicalDirectKey
  )
    throw new Error("Duplicate legacy direct rooms were not preserved safely.");
  if (
    preservedMessages?.message_count !== 13 ||
    preservedMessages?.preserved_body_count !== 11
  )
    throw new Error("Legacy message history was not preserved.");
  if (
    normalizedMetadata?.metadata?.legacyMetadataQuarantined !== true ||
    !/^[0-9a-f]{64}$/u.test(
      normalizedMetadata?.metadata?.legacyMetadataSha256 ?? "",
    ) ||
    normalizedMetadata?.version !== 2 ||
    quarantinedMetadata?.original_metadata?.preserve !== "legacy-secret" ||
    quarantinedMetadata?.original_octet_length <= 8_192 ||
    quarantinedMetadata?.quarantine_reason !==
      "legacy_metadata_outside_phase4_bounds" ||
    metadataQuarantineCoverage?.quarantine_count !== 5 ||
    normalizedMetadataCoverage?.normalized_count !== 5
  )
    throw new Error("Legacy message metadata was not quarantined safely.");
  if (
    normalizedConversation?.title_octets > 160 ||
    normalizedConversation?.purpose_octets > 1_000 ||
    !normalizedConversation?.title?.startsWith("Legacy conversation ") ||
    !normalizedConversation?.purpose?.startsWith(
      "[Legacy purpose quarantined:",
    ) ||
    normalizedConversation?.version !== 2
  )
    throw new Error("Legacy conversation text was not bounded safely.");
  const normalizedMessageById = new Map(
    normalizedMessages.map((candidate) => [candidate.id, candidate]),
  );
  const normalizedEmpty = normalizedMessageById.get(
    "message-staging-normalize-empty",
  );
  const normalizedLarge = normalizedMessageById.get(
    "message-staging-normalize-large",
  );
  if (
    !normalizedEmpty?.body?.startsWith("[Legacy message body quarantined:") ||
    normalizedEmpty?.linked_entity_type !== null ||
    normalizedEmpty?.linked_entity_id !== null ||
    normalizedEmpty?.response_owner_id !== null ||
    normalizedEmpty?.response_due_at !== null ||
    normalizedEmpty?.response_state !== null ||
    normalizedEmpty?.version !== 4 ||
    !normalizedLarge?.body?.startsWith("[Legacy message body quarantined:") ||
    normalizedLarge?.version !== 2
  )
    throw new Error("Legacy Message response data was not bounded safely.");
  if (
    normalizedParticipant?.participant_role !== "owner" ||
    normalizedParticipant?.notification_level !== "none" ||
    normalizedParticipant?.version !== 2 ||
    senderTombstone?.participant_role !== "member" ||
    senderTombstone?.notification_level !== "none" ||
    senderTombstone?.source !== "manual" ||
    !senderTombstone?.removed_at
  )
    throw new Error("Legacy participants were not normalized without access.");
  if (
    reactionCoverage?.reaction_count !== 50 ||
    reactionCoverage?.reaction_kind_count !== 50
  )
    throw new Error("Legacy reaction kinds were not bounded safely.");
  const repairedResponseById = new Map(
    repairedTeamResponses.map((candidate) => [candidate.id, candidate]),
  );
  for (const id of [
    "message-staging-team-guest-request",
    "message-staging-team-viewer-request",
  ]) {
    const repaired = repairedResponseById.get(id);
    if (
      repaired?.response_owner_id !== "user-staging-upgrade" ||
      repaired?.response_state !== "open" ||
      !repaired?.response_due_at ||
      repaired?.version !== 2
    )
      throw new Error("Legacy Team response ownership was not handed off.");
  }
  const archivedResponse = repairedResponseById.get(
    "message-staging-archived-team-request",
  );
  if (
    archivedResponse?.response_owner_id !== null ||
    archivedResponse?.response_state !== null ||
    archivedResponse?.response_due_at !== null ||
    archivedResponse?.version !== 2
  )
    throw new Error(
      "Legacy Team response work without an eligible member was not cleared safely.",
    );
  if (
    recordQuarantineCoverage?.quarantine_count !== 11 ||
    recordQuarantineCoverage?.body_count !== 2 ||
    recordQuarantineCoverage?.conversation_count !== 1 ||
    recordQuarantineCoverage?.participant_count !== 1 ||
    recordQuarantineCoverage?.reaction_count !== 2 ||
    recordQuarantineCoverage?.team_response_count !== 3 ||
    preservedRawLargeBody?.body_octets !== 20_001
  )
    throw new Error(
      "Legacy collaboration records were not quarantined safely.",
    );
  if (
    retentionCoverage?.event_count !== 13 ||
    retentionCoverage?.matching_schedule_count !== 13
  )
    throw new Error(
      "Legacy message retention work was not scheduled exactly once.",
    );
  if (cancelledResponseState?.enumlabel !== "cancelled")
    throw new Error("The cancelled response state was not added.");

  await verifyRejectedParticipantBoundary(
    admin,
    adminUrl,
    previousMigrationsDirectory,
    previousIndex,
  );

  result = {
    schemaVersion: 1,
    classification: "synthetic-non-production",
    releaseDecision: "NO_GO",
    status: "ok",
    previousMigration,
    appliedMigrations: migrationFiles.length - previousIndex - 1,
    drizzleJournalEntries: journalAfterNoop.length,
    secondMigrationPass: "no-op",
    preservedFixture: true,
    legacyTeamConverted: true,
    duplicateDirectRoomsPreserved: true,
    retentionScheduled: retentionCoverage.event_count,
    quarantinedMetadata: true,
    invalidParticipantBoundary: "rejected-atomically",
    rollbackAndForwardFix: {
      migration0009BoundaryFailure: "rolled-back-atomically",
      migrationJournalAfterBoundaryFailure: previousMigration.replace(
        /\.sql$/u,
        "",
      ),
      downMigrationUsed: false,
      expectedProductionResponse:
        "stop promotion and forward-fix; use restore only under a separately authorized corruption decision",
    },
    limitations: [
      "This is synthetic local/CI evidence, not a production backup or restore drill.",
      "This record cannot authorize a production release.",
    ],
  };
} catch (error) {
  primaryError = error;
}

const cleanupErrors = [];
if (target) {
  try {
    await target.end({ timeout: 5 });
  } catch (error) {
    cleanupErrors.push(
      new Error("Could not close the upgrade connection.", {
        cause: error,
      }),
    );
  }
}
try {
  await dropUpgradeDatabase(admin, databaseName);
} catch (error) {
  cleanupErrors.push(
    new Error(`Could not remove upgrade database ${databaseName}.`, {
      cause: error,
    }),
  );
}
try {
  await admin.end({ timeout: 5 });
} catch (error) {
  cleanupErrors.push(
    new Error("Could not close the admin connection.", {
      cause: error,
    }),
  );
}
if (previousMigrationsDirectory) {
  try {
    await rm(previousMigrationsDirectory, { recursive: true, force: true });
  } catch (error) {
    cleanupErrors.push(
      new Error("Could not remove the temporary migration journal.", {
        cause: error,
      }),
    );
  }
}
if (primaryError || cleanupErrors.length > 0) {
  const errors = [primaryError, ...cleanupErrors].filter(Boolean);
  if (errors.length === 1) throw errors[0];
  throw new AggregateError(errors, "Upgrade smoke or cleanup failed.");
}
process.stdout.write(`${JSON.stringify(result)}\n`);

async function createPreviousMigrationsDirectory(lastIndex) {
  const directory = await mkdtemp(join(tmpdir(), "trevv-upgrade-migrations-"));
  try {
    await mkdir(join(directory, "meta"));
    for (const name of migrationFiles.slice(0, lastIndex + 1))
      await copyFile(join(migrationsDirectory, name), join(directory, name));
    await writeFile(
      join(directory, "meta/_journal.json"),
      `${JSON.stringify({ ...journal, entries: journal.entries.slice(0, lastIndex + 1) }, null, 2)}\n`,
      "utf8",
    );
    return directory;
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(
      (cleanupError) => {
        throw new AggregateError(
          [error, cleanupError],
          "Could not construct or clean the previous migration journal.",
        );
      },
    );
    throw error;
  }
}

async function assertMigrationJournalCount(database, expected) {
  const rows = await migrationJournalRows(database);
  if (rows.length !== expected)
    throw new Error(
      `Expected ${expected} Drizzle migration journal entries, received ${rows.length}.`,
    );
}

async function migrationJournalRows(database) {
  return database`
    select id, hash, created_at
    from drizzle.__drizzle_migrations
    order by id
  `;
}

async function verifyRejectedParticipantBoundary(
  adminDatabase,
  baseAdminUrl,
  previousDirectory,
  previousMigrationIndex,
) {
  const boundaryDatabaseName = databaseName.replace(
    /_upgrade$/u,
    "_boundary_upgrade",
  );
  const boundaryUrl = new URL(baseAdminUrl);
  boundaryUrl.pathname = `/${boundaryDatabaseName}`;
  let boundary;
  let primaryBoundaryError;

  try {
    await dropUpgradeDatabase(adminDatabase, boundaryDatabaseName);
    await adminDatabase.unsafe(`create database "${boundaryDatabaseName}"`);
    boundary = postgres(boundaryUrl.toString(), { max: 1, prepare: false });
    await migrate(drizzle(boundary), { migrationsFolder: previousDirectory });
    await assertMigrationJournalCount(boundary, previousMigrationIndex + 1);
    await seedParticipantBoundaryFixture(boundary);

    let migrationError;
    try {
      await migrate(drizzle(boundary), {
        migrationsFolder: migrationsDirectory,
      });
    } catch (error) {
      migrationError = error;
    }
    if (!migrationError)
      throw new Error(
        "The populated >250 participant boundary upgrade unexpectedly succeeded.",
      );
    if (
      !errorChainMessages(migrationError).includes(
        "Cannot upgrade a legacy non-Team conversation with more than 250 active participants",
      )
    )
      throw new Error(
        "The populated participant boundary failed for an unexpected reason.",
        { cause: migrationError },
      );

    await assertMigrationJournalCount(boundary, previousMigrationIndex + 1);
    const [rollback] = await boundary`
      select
        to_regclass('public.legacy_collaboration_record_quarantine')::text
          as quarantine_table,
        to_regclass('public.teams')::text as teams_table,
        (
          select count(*)::int
          from conversation_participants
          where organization_id = 'org-boundary-upgrade'
            and conversation_id = 'conversation-boundary-upgrade'
            and removed_at is null
        ) as active_participant_count
    `;
    if (
      rollback?.quarantine_table !== null ||
      rollback?.teams_table !== null ||
      rollback?.active_participant_count !== 251
    )
      throw new Error(
        "The rejected participant boundary migration did not roll back atomically.",
      );
  } catch (error) {
    primaryBoundaryError = error;
  }

  const cleanupErrors = [];
  if (boundary) {
    try {
      await boundary.end({ timeout: 5 });
    } catch (error) {
      cleanupErrors.push(
        new Error("Could not close the boundary upgrade connection.", {
          cause: error,
        }),
      );
    }
  }
  try {
    await dropUpgradeDatabase(adminDatabase, boundaryDatabaseName);
  } catch (error) {
    cleanupErrors.push(
      new Error(`Could not remove upgrade database ${boundaryDatabaseName}.`, {
        cause: error,
      }),
    );
  }
  const errors = [primaryBoundaryError, ...cleanupErrors].filter(Boolean);
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(errors, "Boundary upgrade or cleanup failed.");
}

async function seedParticipantBoundaryFixture(database) {
  await database.unsafe(`
    insert into organizations (id, name, slug)
    values ('org-boundary-upgrade', 'Boundary Upgrade', 'boundary-upgrade');

    insert into app_users (id, email, name)
    select 'boundary-user-' || lpad(user_index::text, 3, '0'),
      'boundary-' || user_index || '@trevv.test',
      'Boundary User ' || user_index
    from generate_series(1, 251) as users(user_index);

    insert into memberships (organization_id, user_id, role)
    select 'org-boundary-upgrade',
      'boundary-user-' || lpad(user_index::text, 3, '0'),
      case when user_index = 1 then 'owner'::membership_role
        else 'member'::membership_role end
    from generate_series(1, 251) as users(user_index);

    insert into portfolios (id, organization_id, name, slug, is_default)
    values (
      'portfolio-boundary-upgrade', 'org-boundary-upgrade',
      'Boundary Portfolio', 'boundary-portfolio', true
    );

    insert into portfolio_members (
      organization_id, portfolio_id, user_id, role
    )
    select 'org-boundary-upgrade', 'portfolio-boundary-upgrade',
      'boundary-user-' || lpad(user_index::text, 3, '0'),
      case when user_index = 1 then 'owner'::membership_role
        else 'member'::membership_role end
    from generate_series(1, 251) as users(user_index);

    insert into workspaces (
      id, organization_id, portfolio_id, name, slug, type,
      accent_color, icon, lifecycle_stage, health, lead_user_id
    ) values (
      'workspace-boundary-upgrade', 'org-boundary-upgrade',
      'portfolio-boundary-upgrade', 'Boundary Workspace', 'boundary-workspace',
      'business', '#315c75', 'B', 'build', 'on_track', 'boundary-user-001'
    );

    insert into workspace_members (
      organization_id, workspace_id, user_id, can_manage
    )
    select 'org-boundary-upgrade', 'workspace-boundary-upgrade',
      'boundary-user-' || lpad(user_index::text, 3, '0'), user_index = 1
    from generate_series(1, 251) as users(user_index);

    insert into conversations (
      id, organization_id, portfolio_id, workspace_id, title, purpose,
      kind, visibility, created_by
    ) values (
      'conversation-boundary-upgrade', 'org-boundary-upgrade',
      'portfolio-boundary-upgrade', 'workspace-boundary-upgrade',
      'Over-capacity legacy room', 'Must fail closed', 'workspace',
      'organization', 'boundary-user-001'
    );

    insert into conversation_participants (
      organization_id, conversation_id, user_id, participant_role,
      notification_level
    )
    select 'org-boundary-upgrade', 'conversation-boundary-upgrade',
      'boundary-user-' || lpad(user_index::text, 3, '0'),
      case when user_index = 1 then 'owner' else 'member' end, 'all'
    from generate_series(1, 251) as users(user_index);
  `);
}

function errorChainMessages(error) {
  const messages = [];
  let current = error;
  while (current && typeof current === "object") {
    if (typeof current.message === "string") messages.push(current.message);
    current = current.cause;
  }
  return messages.join("\n");
}

async function seedPreviousReleaseFixture(database) {
  await database.unsafe(`
    insert into organizations (id, name, slug)
    values ('org-staging-upgrade', 'Upgrade Sentinel', 'upgrade-sentinel');

    insert into app_users (id, email, name)
    values
      ('user-staging-upgrade', 'upgrade-sentinel@trevv.test', 'Upgrade Owner'),
      ('user-staging-member', 'upgrade-member@trevv.test', 'Upgrade Member'),
      ('user-staging-guest', 'upgrade-guest@trevv.test', 'Upgrade Guest'),
      ('user-staging-viewer', 'upgrade-viewer@trevv.test', 'Upgrade Viewer');

    insert into memberships (organization_id, user_id, role)
    values
      ('org-staging-upgrade', 'user-staging-upgrade', 'owner'),
      ('org-staging-upgrade', 'user-staging-member', 'member'),
      ('org-staging-upgrade', 'user-staging-guest', 'guest'),
      ('org-staging-upgrade', 'user-staging-viewer', 'viewer');

    insert into portfolios (id, organization_id, name, slug, is_default)
    values (
      'portfolio-staging-upgrade', 'org-staging-upgrade',
      'Upgrade Portfolio', 'upgrade-portfolio', true
    );

    insert into portfolio_members (
      organization_id, portfolio_id, user_id, role
    ) values
      (
        'org-staging-upgrade', 'portfolio-staging-upgrade',
        'user-staging-upgrade', 'owner'
      ),
      (
        'org-staging-upgrade', 'portfolio-staging-upgrade',
        'user-staging-member', 'member'
      ),
      (
        'org-staging-upgrade', 'portfolio-staging-upgrade',
        'user-staging-guest', 'guest'
      ),
      (
        'org-staging-upgrade', 'portfolio-staging-upgrade',
        'user-staging-viewer', 'viewer'
      );

    insert into workspaces (
      id, organization_id, portfolio_id, name, slug, type,
      accent_color, icon, lifecycle_stage, health, lead_user_id
    ) values (
      'workspace-staging-upgrade', 'org-staging-upgrade',
      'portfolio-staging-upgrade', 'Upgrade Workspace', 'upgrade-workspace',
      'business', '#315c75', 'U', 'build', 'on_track',
      'user-staging-upgrade'
    );

    insert into workspace_members (
      organization_id, workspace_id, user_id, can_manage
    ) values
      (
        'org-staging-upgrade', 'workspace-staging-upgrade',
        'user-staging-upgrade', true
      ),
      (
        'org-staging-upgrade', 'workspace-staging-upgrade',
        'user-staging-member', false
      ),
      (
        'org-staging-upgrade', 'workspace-staging-upgrade',
        'user-staging-guest', false
      ),
      (
        'org-staging-upgrade', 'workspace-staging-upgrade',
        'user-staging-viewer', false
      );

    insert into conversations (
      id, organization_id, portfolio_id, workspace_id, title, purpose,
      kind, visibility, created_by
    ) values
      (
        'conversation-staging-upgrade', 'org-staging-upgrade',
        'portfolio-staging-upgrade', 'workspace-staging-upgrade',
        'Upgrade room', 'Previous release fixture', 'workspace',
        'organization', 'user-staging-upgrade'
      ),
      (
        'conversation-staging-team', 'org-staging-upgrade',
        'portfolio-staging-upgrade', 'workspace-staging-upgrade',
        'Legacy Technology', 'Preserve this Team room', 'team',
        'private', 'user-staging-upgrade'
      ),
      (
        'conversation-staging-direct-a', 'org-staging-upgrade',
        'portfolio-staging-upgrade', 'workspace-staging-upgrade',
        'Legacy direct A', 'Oldest direct room', 'direct',
        'private', 'user-staging-upgrade'
      ),
      (
        'conversation-staging-direct-b', 'org-staging-upgrade',
        'portfolio-staging-upgrade', 'workspace-staging-upgrade',
        'Legacy direct B', 'Duplicate direct room', 'direct',
        'private', 'user-staging-upgrade'
      ),
      (
        'conversation-staging-normalize', 'org-staging-upgrade',
        'portfolio-staging-upgrade', 'workspace-staging-upgrade',
        '   ', repeat('p', 1001), 'workspace',
        'private', 'user-staging-upgrade'
      ),
      (
        'conversation-staging-archived-team', 'org-staging-upgrade',
        'portfolio-staging-upgrade', 'workspace-staging-upgrade',
        'Legacy archived Team', 'No eligible Team member remains', 'team',
        'private', 'user-staging-guest'
      );

    update conversations
    set created_at = case id
      when 'conversation-staging-upgrade' then '2025-01-01T08:00:00Z'::timestamptz
      when 'conversation-staging-team' then '2025-01-02T08:00:00Z'::timestamptz
      when 'conversation-staging-direct-a' then '2025-01-03T08:00:00Z'::timestamptz
      when 'conversation-staging-direct-b' then '2025-01-04T08:00:00Z'::timestamptz
      when 'conversation-staging-normalize' then '2025-01-05T08:00:00Z'::timestamptz
      when 'conversation-staging-archived-team' then '2025-01-06T08:00:00Z'::timestamptz
    end,
    updated_at = '2025-01-04T08:00:00Z'::timestamptz,
    last_message_at = '2025-01-04T08:00:00Z'::timestamptz
    where organization_id = 'org-staging-upgrade';

    update conversations
    set archived_at = '2025-01-07T08:00:00Z'::timestamptz
    where id = 'conversation-staging-archived-team';

    insert into conversation_participants (
      organization_id, conversation_id, user_id, participant_role,
      notification_level
    ) values
      (
        'org-staging-upgrade', 'conversation-staging-upgrade',
        'user-staging-upgrade', 'owner', 'all'
      ),
      (
        'org-staging-upgrade', 'conversation-staging-team',
        'user-staging-upgrade', 'owner', 'all'
      ),
      (
        'org-staging-upgrade', 'conversation-staging-team',
        'user-staging-member', 'member', 'all'
      ),
      (
        'org-staging-upgrade', 'conversation-staging-team',
        'user-staging-guest', 'member', 'all'
      ),
      (
        'org-staging-upgrade', 'conversation-staging-team',
        'user-staging-viewer', 'member', 'all'
      ),
      (
        'org-staging-upgrade', 'conversation-staging-direct-a',
        'user-staging-upgrade', 'owner', 'all'
      ),
      (
        'org-staging-upgrade', 'conversation-staging-direct-a',
        'user-staging-member', 'member', 'all'
      ),
      (
        'org-staging-upgrade', 'conversation-staging-direct-b',
        'user-staging-upgrade', 'owner', 'all'
      ),
      (
        'org-staging-upgrade', 'conversation-staging-direct-b',
        'user-staging-member', 'member', 'all'
      ),
      (
        'org-staging-upgrade', 'conversation-staging-normalize',
        'user-staging-upgrade', 'captain', 'loud'
      ),
      (
        'org-staging-upgrade', 'conversation-staging-archived-team',
        'user-staging-guest', 'guest', 'all'
      );

    insert into conversation_messages (
      id, organization_id, conversation_id, sender_id, body, intent,
      metadata, created_at, updated_at
    ) values
      (
        'message-staging-upgrade', 'org-staging-upgrade',
        'conversation-staging-upgrade', 'user-staging-upgrade',
        'Preserve this message', 'message', '{}'::jsonb,
        '2025-01-01T09:00:00Z', '2025-01-01T09:00:00Z'
      ),
      (
        'message-staging-team', 'org-staging-upgrade',
        'conversation-staging-team', 'user-staging-upgrade',
        'Preserve this Team message', 'message',
        jsonb_build_object(
          'preserve', 'legacy-secret',
          'oversized', repeat('x', 9000)
        ),
        '2025-01-02T09:00:00Z', '2025-01-02T09:00:00Z'
      ),
      (
        'message-staging-direct-a', 'org-staging-upgrade',
        'conversation-staging-direct-a', 'user-staging-upgrade',
        'Preserve direct history A', 'message', '{}'::jsonb,
        '2025-01-03T09:00:00Z', '2025-01-03T09:00:00Z'
      ),
      (
        'message-staging-direct-b', 'org-staging-upgrade',
        'conversation-staging-direct-b', 'user-staging-member',
        'Preserve direct history B', 'message', '{}'::jsonb,
        '2025-01-04T09:00:00Z', '2025-01-04T09:00:00Z'
      ),
      (
        'message-staging-team-keys', 'org-staging-upgrade',
        'conversation-staging-team', 'user-staging-upgrade',
        'Preserve metadata key limits', 'message',
        (
          select jsonb_object_agg('key-' || key_index, key_index)
          from generate_series(1, 33) as keys(key_index)
        ),
        '2025-01-02T09:01:00Z', '2025-01-02T09:01:00Z'
      ),
      (
        'message-staging-team-depth', 'org-staging-upgrade',
        'conversation-staging-team', 'user-staging-upgrade',
        'Preserve metadata depth limits', 'message',
        '{"a":{"b":{"c":{"d":{"tooDeep":true}}}}}'::jsonb,
        '2025-01-02T09:02:00Z', '2025-01-02T09:02:00Z'
      ),
      (
        'message-staging-team-array', 'org-staging-upgrade',
        'conversation-staging-team', 'user-staging-upgrade',
        'Preserve metadata array limits', 'message',
        jsonb_build_object(
          'items',
          (select jsonb_agg(item_index) from generate_series(1, 51) as items(item_index))
        ),
        '2025-01-02T09:03:00Z', '2025-01-02T09:03:00Z'
      ),
      (
        'message-staging-team-string', 'org-staging-upgrade',
        'conversation-staging-team', 'user-staging-upgrade',
        'Preserve metadata string limits', 'message',
        jsonb_build_object('value', repeat('s', 1001)),
        '2025-01-02T09:04:00Z', '2025-01-02T09:04:00Z'
      ),
      (
        'message-staging-normalize-empty', 'org-staging-upgrade',
        'conversation-staging-normalize', 'user-staging-viewer',
        '   ', 'request', '{}'::jsonb,
        '2025-01-05T09:00:00Z', '2025-01-05T09:00:00Z'
      ),
      (
        'message-staging-normalize-large', 'org-staging-upgrade',
        'conversation-staging-normalize', 'user-staging-upgrade',
        repeat('b', 20001), 'message', '{}'::jsonb,
        '2025-01-05T09:01:00Z', '2025-01-05T09:01:00Z'
      ),
      (
        'message-staging-team-guest-request', 'org-staging-upgrade',
        'conversation-staging-team', 'user-staging-upgrade',
        'Preserve guest-owned Team request', 'request', '{}'::jsonb,
        '2025-01-02T09:05:00Z', '2025-01-02T09:05:00Z'
      ),
      (
        'message-staging-team-viewer-request', 'org-staging-upgrade',
        'conversation-staging-team', 'user-staging-upgrade',
        'Preserve viewer-owned Team request', 'request', '{}'::jsonb,
        '2025-01-02T09:06:00Z', '2025-01-02T09:06:00Z'
      ),
      (
        'message-staging-archived-team-request', 'org-staging-upgrade',
        'conversation-staging-archived-team', 'user-staging-guest',
        'Preserve archived Team request', 'request', '{}'::jsonb,
        '2025-01-06T09:00:00Z', '2025-01-06T09:00:00Z'
      );

    update conversation_messages
    set linked_entity_type = 'work_item',
      response_state = 'open',
      response_due_at = '2025-01-08T09:00:00Z'::timestamptz
    where id = 'message-staging-normalize-empty';

    update conversation_messages
    set response_owner_id = case id
        when 'message-staging-team-guest-request' then 'user-staging-guest'
        when 'message-staging-team-viewer-request' then 'user-staging-viewer'
        when 'message-staging-archived-team-request' then 'user-staging-guest'
      end,
      response_state = 'open',
      response_due_at = '2025-01-08T09:00:00Z'::timestamptz
    where id in (
      'message-staging-team-guest-request',
      'message-staging-team-viewer-request',
      'message-staging-archived-team-request'
    );

    insert into conversation_reactions (
      organization_id, message_id, user_id, emoji, created_at
    )
    select 'org-staging-upgrade', 'message-staging-normalize-large',
      'user-staging-upgrade', 'emoji-' || lpad(reaction_index::text, 2, '0'),
      '2025-01-05T10:00:00Z'::timestamptz
    from generate_series(1, 51) as reactions(reaction_index);

    insert into conversation_reactions (
      organization_id, message_id, user_id, emoji, created_at
    ) values (
      'org-staging-upgrade', 'message-staging-normalize-large',
      'user-staging-upgrade', '   ', '2025-01-05T10:01:00Z'
    );
  `);
}

async function dropUpgradeDatabase(database, name) {
  await database`
    select pg_terminate_backend(pid)
    from pg_stat_activity
    where datname = ${name} and pid <> pg_backend_pid()
  `;
  await database.unsafe(`drop database if exists "${name}"`);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
