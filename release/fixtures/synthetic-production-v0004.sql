-- TREVV deterministic synthetic release-rehearsal fixture.
--
-- Classification: synthetic non-production data. Every identity, organization,
-- and business record below is fictional. This file must only be loaded after
-- migration 0004 into a disposable database whose name matches the guard.

DO $$
DECLARE
	migration_count integer;
BEGIN
	IF current_database() !~ '^trevv_[a-z0-9_]{3,48}_synthetic_rehearsal$' THEN
		RAISE EXCEPTION
			'Synthetic fixture refused database %; expected trevv_*_synthetic_rehearsal',
			current_database();
	END IF;

	SELECT count(*)::integer
	INTO migration_count
	FROM drizzle.__drizzle_migrations;

	IF migration_count <> 5 THEN
		RAISE EXCEPTION
			'Synthetic fixture requires exactly migrations 0000-0004; found % entries',
			migration_count;
	END IF;
END
$$;

INSERT INTO organizations (
	id, name, slug, locale, timezone, created_at, updated_at
) VALUES
	(
		'org-synthetic-alpha', 'Synthetic Alpha Labs', 'synthetic-alpha',
		'en', 'Europe/Berlin', '2025-01-01T08:00:00Z', '2025-01-01T08:00:00Z'
	),
	(
		'org-synthetic-beta', 'Synthetic Beta Works', 'synthetic-beta',
		'en', 'America/New_York', '2025-01-01T08:00:00Z', '2025-01-01T08:00:00Z'
	);

INSERT INTO app_users (id, email, name, locale, created_at, updated_at) VALUES
	(
		'user-synthetic-alpha-owner', 'alpha-owner@trevv.test',
		'Synthetic Alpha Owner', 'en', '2025-01-01T08:01:00Z',
		'2025-01-01T08:01:00Z'
	),
	(
		'user-synthetic-alpha-member', 'alpha-member@trevv.test',
		'Synthetic Alpha Member', 'en', '2025-01-01T08:02:00Z',
		'2025-01-01T08:02:00Z'
	),
	(
		'user-synthetic-beta-owner', 'beta-owner@trevv.test',
		'Synthetic Beta Owner', 'en', '2025-01-01T08:03:00Z',
		'2025-01-01T08:03:00Z'
	),
	(
		'user-synthetic-beta-member', 'beta-member@trevv.test',
		'Synthetic Beta Member', 'en', '2025-01-01T08:04:00Z',
		'2025-01-01T08:04:00Z'
	);

INSERT INTO memberships (
	organization_id, user_id, role, created_at, updated_at
) VALUES
	(
		'org-synthetic-alpha', 'user-synthetic-alpha-owner', 'owner',
		'2025-01-01T08:10:00Z', '2025-01-01T08:10:00Z'
	),
	(
		'org-synthetic-alpha', 'user-synthetic-alpha-member', 'member',
		'2025-01-01T08:11:00Z', '2025-01-01T08:11:00Z'
	),
	(
		'org-synthetic-beta', 'user-synthetic-beta-owner', 'owner',
		'2025-01-01T08:12:00Z', '2025-01-01T08:12:00Z'
	),
	(
		'org-synthetic-beta', 'user-synthetic-beta-member', 'member',
		'2025-01-01T08:13:00Z', '2025-01-01T08:13:00Z'
	);

INSERT INTO portfolios (
	id, organization_id, name, slug, description, is_default, ordering,
	created_at, updated_at
) VALUES
	(
		'portfolio-synthetic-alpha', 'org-synthetic-alpha', 'Founder Portfolio',
		'founder', 'Fictional Alpha portfolio', true, 0,
		'2025-01-01T08:20:00Z', '2025-01-01T08:20:00Z'
	),
	(
		'portfolio-synthetic-beta', 'org-synthetic-beta', 'Founder Portfolio',
		'founder', 'Fictional Beta portfolio', true, 0,
		'2025-01-01T08:21:00Z', '2025-01-01T08:21:00Z'
	);

INSERT INTO portfolio_members (
	organization_id, portfolio_id, user_id, role, created_at, updated_at
) VALUES
	(
		'org-synthetic-alpha', 'portfolio-synthetic-alpha',
		'user-synthetic-alpha-owner', 'owner', '2025-01-01T08:22:00Z',
		'2025-01-01T08:22:00Z'
	),
	(
		'org-synthetic-alpha', 'portfolio-synthetic-alpha',
		'user-synthetic-alpha-member', 'member', '2025-01-01T08:23:00Z',
		'2025-01-01T08:23:00Z'
	),
	(
		'org-synthetic-beta', 'portfolio-synthetic-beta',
		'user-synthetic-beta-owner', 'owner', '2025-01-01T08:24:00Z',
		'2025-01-01T08:24:00Z'
	),
	(
		'org-synthetic-beta', 'portfolio-synthetic-beta',
		'user-synthetic-beta-member', 'member', '2025-01-01T08:25:00Z',
		'2025-01-01T08:25:00Z'
	);

INSERT INTO workspaces (
	id, organization_id, portfolio_id, name, slug, description, type,
	accent_color, icon, visibility, lifecycle_stage, health, health_note,
	lead_user_id, current_priority, next_milestone_summary, primary_blocker,
	founder_help_summary, review_cadence, progress_mode, ordering,
	created_at, updated_at
) VALUES
	(
		'workspace-synthetic-alpha', 'org-synthetic-alpha',
		'portfolio-synthetic-alpha', 'Launch', 'launch',
		'Fictional launch workspace', 'business', '#315c75', 'A', 'private',
		'build', 'watch', 'Synthetic schedule risk',
		'user-synthetic-alpha-owner', 'Validate launch plan', 'Synthetic launch',
		'Synthetic approval pending', 'Review the fictional decision', 'weekly',
		'task_completion', 0, '2025-01-01T08:30:00Z',
		'2025-01-01T08:30:00Z'
	),
	(
		'workspace-synthetic-beta', 'org-synthetic-beta',
		'portfolio-synthetic-beta', 'Launch', 'launch',
		'Fictional launch workspace', 'business', '#7a4f75', 'B', 'private',
		'build', 'on_track', '', 'user-synthetic-beta-owner',
		'Validate launch plan', 'Synthetic launch', '', '', 'weekly',
		'task_completion', 0, '2025-01-01T08:31:00Z',
		'2025-01-01T08:31:00Z'
	);

INSERT INTO workspace_members (
	organization_id, workspace_id, user_id, can_manage, created_at, updated_at
) VALUES
	(
		'org-synthetic-alpha', 'workspace-synthetic-alpha',
		'user-synthetic-alpha-owner', true, '2025-01-01T08:32:00Z',
		'2025-01-01T08:32:00Z'
	),
	(
		'org-synthetic-alpha', 'workspace-synthetic-alpha',
		'user-synthetic-alpha-member', false, '2025-01-01T08:33:00Z',
		'2025-01-01T08:33:00Z'
	),
	(
		'org-synthetic-beta', 'workspace-synthetic-beta',
		'user-synthetic-beta-owner', true, '2025-01-01T08:34:00Z',
		'2025-01-01T08:34:00Z'
	),
	(
		'org-synthetic-beta', 'workspace-synthetic-beta',
		'user-synthetic-beta-member', false, '2025-01-01T08:35:00Z',
		'2025-01-01T08:35:00Z'
	);

INSERT INTO boards (
	id, organization_id, workspace_id, name, description, visibility,
	progress_mode, ordering, created_at, updated_at
) VALUES
	(
		'board-synthetic-alpha', 'org-synthetic-alpha',
		'workspace-synthetic-alpha', 'Launch Board', 'Fictional Alpha board',
		'private', 'task_completion', 0, '2025-01-01T08:40:00Z',
		'2025-01-01T08:40:00Z'
	),
	(
		'board-synthetic-beta', 'org-synthetic-beta',
		'workspace-synthetic-beta', 'Launch Board', 'Fictional Beta board',
		'private', 'task_completion', 0, '2025-01-01T08:41:00Z',
		'2025-01-01T08:41:00Z'
	);

INSERT INTO board_groups (
	id, organization_id, board_id, name, color, ordering, created_at, updated_at
) VALUES
	(
		'group-synthetic-alpha', 'org-synthetic-alpha',
		'board-synthetic-alpha', 'Current', '#315c75', 0,
		'2025-01-01T08:42:00Z', '2025-01-01T08:42:00Z'
	),
	(
		'group-synthetic-beta', 'org-synthetic-beta',
		'board-synthetic-beta', 'Current', '#7a4f75', 0,
		'2025-01-01T08:43:00Z', '2025-01-01T08:43:00Z'
	);

INSERT INTO statuses (
	id, organization_id, board_id, name, color, category, ordering,
	created_at, updated_at
) VALUES
	(
		'status-synthetic-alpha', 'org-synthetic-alpha',
		'board-synthetic-alpha', 'Working', '#315c75', 'working', 0,
		'2025-01-01T08:44:00Z', '2025-01-01T08:44:00Z'
	),
	(
		'status-synthetic-beta', 'org-synthetic-beta',
		'board-synthetic-beta', 'Working', '#7a4f75', 'working', 0,
		'2025-01-01T08:45:00Z', '2025-01-01T08:45:00Z'
	);

INSERT INTO work_items (
	id, organization_id, workspace_id, board_id, group_id, title, description,
	item_type, status, status_id, priority, due_date, creator_id, ordering,
	version, type_data, created_at, updated_at
) VALUES
	(
		'item-synthetic-alpha-task', 'org-synthetic-alpha',
		'workspace-synthetic-alpha', 'board-synthetic-alpha',
		'group-synthetic-alpha', 'Prepare launch', 'Fictional task', 'task',
		'working', 'status-synthetic-alpha', 'high', '2025-02-01',
		'user-synthetic-alpha-owner', 0, 3, '{"fixture":"synthetic"}',
		'2025-01-01T09:00:00Z', '2025-01-02T09:00:00Z'
	),
	(
		'item-synthetic-alpha-decision', 'org-synthetic-alpha',
		'workspace-synthetic-alpha', 'board-synthetic-alpha',
		'group-synthetic-alpha', 'Choose fictional launch channel',
		'Fictional decision', 'decision', 'working', 'status-synthetic-alpha',
		'urgent', '2025-01-31', 'user-synthetic-alpha-owner', 1, 2,
		'{"fixture":"synthetic"}', '2025-01-01T09:01:00Z',
		'2025-01-02T09:01:00Z'
	),
	(
		'item-synthetic-alpha-milestone', 'org-synthetic-alpha',
		'workspace-synthetic-alpha', 'board-synthetic-alpha',
		'group-synthetic-alpha', 'Fictional launch', 'Fictional milestone',
		'milestone', 'not_started', 'status-synthetic-alpha', 'normal',
		'2025-02-14', 'user-synthetic-alpha-member', 2, 1,
		'{"fixture":"synthetic"}', '2025-01-01T09:02:00Z',
		'2025-01-02T09:02:00Z'
	),
	(
		'item-synthetic-beta-task', 'org-synthetic-beta',
		'workspace-synthetic-beta', 'board-synthetic-beta',
		'group-synthetic-beta', 'Prepare launch', 'Fictional task', 'task',
		'working', 'status-synthetic-beta', 'high', '2025-02-01',
		'user-synthetic-beta-owner', 0, 3, '{"fixture":"synthetic"}',
		'2025-01-01T09:03:00Z', '2025-01-02T09:03:00Z'
	),
	(
		'item-synthetic-beta-decision', 'org-synthetic-beta',
		'workspace-synthetic-beta', 'board-synthetic-beta',
		'group-synthetic-beta', 'Choose fictional launch channel',
		'Fictional decision', 'decision', 'working', 'status-synthetic-beta',
		'urgent', '2025-01-31', 'user-synthetic-beta-owner', 1, 2,
		'{"fixture":"synthetic"}', '2025-01-01T09:04:00Z',
		'2025-01-02T09:04:00Z'
	),
	(
		'item-synthetic-beta-milestone', 'org-synthetic-beta',
		'workspace-synthetic-beta', 'board-synthetic-beta',
		'group-synthetic-beta', 'Fictional launch', 'Fictional milestone',
		'milestone', 'not_started', 'status-synthetic-beta', 'normal',
		'2025-02-14', 'user-synthetic-beta-member', 2, 1,
		'{"fixture":"synthetic"}', '2025-01-01T09:05:00Z',
		'2025-01-02T09:05:00Z'
	);

INSERT INTO item_assignees (organization_id, item_id, user_id, assigned_at)
VALUES
	(
		'org-synthetic-alpha', 'item-synthetic-alpha-task',
		'user-synthetic-alpha-member', '2025-01-01T09:10:00Z'
	),
	(
		'org-synthetic-beta', 'item-synthetic-beta-task',
		'user-synthetic-beta-member', '2025-01-01T09:11:00Z'
	);

INSERT INTO item_dependencies (
	organization_id, item_id, depends_on_item_id, relation
) VALUES
	(
		'org-synthetic-alpha', 'item-synthetic-alpha-milestone',
		'item-synthetic-alpha-task', 'depends_on'
	),
	(
		'org-synthetic-beta', 'item-synthetic-beta-milestone',
		'item-synthetic-beta-task', 'depends_on'
	);

INSERT INTO comments (
	id, organization_id, item_id, author_id, body, created_at, updated_at
) VALUES
	(
		'comment-synthetic-alpha', 'org-synthetic-alpha',
		'item-synthetic-alpha-task', 'user-synthetic-alpha-member',
		'Fictional progress evidence.', '2025-01-02T10:00:00Z',
		'2025-01-02T10:00:00Z'
	),
	(
		'comment-synthetic-beta', 'org-synthetic-beta',
		'item-synthetic-beta-task', 'user-synthetic-beta-member',
		'Fictional progress evidence.', '2025-01-02T10:01:00Z',
		'2025-01-02T10:01:00Z'
	);

INSERT INTO activity_events (
	id, organization_id, actor_id, event_type, aggregate_type, aggregate_id,
	payload, occurred_at
) VALUES
	(
		'activity-synthetic-alpha', 'org-synthetic-alpha',
		'user-synthetic-alpha-owner', 'work_item.updated', 'work_item',
		'item-synthetic-alpha-task', '{"fixture":"synthetic"}',
		'2025-01-02T10:10:00Z'
	),
	(
		'activity-synthetic-beta', 'org-synthetic-beta',
		'user-synthetic-beta-owner', 'work_item.updated', 'work_item',
		'item-synthetic-beta-task', '{"fixture":"synthetic"}',
		'2025-01-02T10:11:00Z'
	);

INSERT INTO audit_logs (
	id, organization_id, actor_id, action, target_type, target_id, payload,
	created_at
) VALUES
	(
		'audit-synthetic-alpha', 'org-synthetic-alpha',
		'user-synthetic-alpha-owner', 'work_item.update', 'work_item',
		'item-synthetic-alpha-task', '{"fixture":"synthetic"}',
		'2025-01-02T10:20:00Z'
	),
	(
		'audit-synthetic-beta', 'org-synthetic-beta',
		'user-synthetic-beta-owner', 'work_item.update', 'work_item',
		'item-synthetic-beta-task', '{"fixture":"synthetic"}',
		'2025-01-02T10:21:00Z'
	);

INSERT INTO outbox_events (
	id, organization_id, event_type, aggregate_type, aggregate_id, payload,
	attempts, available_at, created_at
) VALUES
	(
		'outbox-synthetic-alpha', 'org-synthetic-alpha', 'attention.recompute',
		'organization', 'org-synthetic-alpha', '{"fixture":"synthetic"}', 0,
		'2025-01-02T10:30:00Z', '2025-01-02T10:30:00Z'
	),
	(
		'outbox-synthetic-beta', 'org-synthetic-beta', 'attention.recompute',
		'organization', 'org-synthetic-beta', '{"fixture":"synthetic"}', 0,
		'2025-01-02T10:31:00Z', '2025-01-02T10:31:00Z'
	);

INSERT INTO inbox_items (
	id, organization_id, user_id, category, title, body, resource, created_at
) VALUES
	(
		'inbox-synthetic-alpha', 'org-synthetic-alpha',
		'user-synthetic-alpha-owner', 'capture', 'Fictional Alpha capture',
		'Explicitly synthetic inbox content.', '{"fixture":"synthetic"}',
		'2025-01-02T10:40:00Z'
	),
	(
		'inbox-synthetic-beta', 'org-synthetic-beta',
		'user-synthetic-beta-owner', 'capture', 'Fictional Beta capture',
		'Explicitly synthetic inbox content.', '{"fixture":"synthetic"}',
		'2025-01-02T10:41:00Z'
	);

INSERT INTO attention_signals (
	id, organization_id, portfolio_id, workspace_id, entity_type, entity_id,
	signal_type, severity, impact, urgency, responsibility, reason,
	recommended_action, metadata, created_at, updated_at
) VALUES
	(
		'attention-synthetic-alpha', 'org-synthetic-alpha',
		'portfolio-synthetic-alpha', 'workspace-synthetic-alpha', 'work_item',
		'item-synthetic-alpha-task', 'overdue', 'high', 4, 4, 1,
		'Fictional due-date signal', 'Review the fictional task',
		'{"fixture":"synthetic"}', '2025-01-02T10:50:00Z',
		'2025-01-02T10:50:00Z'
	),
	(
		'attention-synthetic-beta', 'org-synthetic-beta',
		'portfolio-synthetic-beta', 'workspace-synthetic-beta', 'work_item',
		'item-synthetic-beta-task', 'overdue', 'high', 4, 4, 1,
		'Fictional due-date signal', 'Review the fictional task',
		'{"fixture":"synthetic"}', '2025-01-02T10:51:00Z',
		'2025-01-02T10:51:00Z'
	);

INSERT INTO waiting_states (
	id, organization_id, portfolio_id, workspace_id, entity_type, entity_id,
	waiting_type, waiting_label, waiting_since, expected_by,
	follow_up_owner_id, next_follow_up, waiting_note, created_at, updated_at
) VALUES
	(
		'waiting-synthetic-alpha', 'org-synthetic-alpha',
		'portfolio-synthetic-alpha', 'workspace-synthetic-alpha', 'work_item',
		'item-synthetic-alpha-task', 'approval', 'Synthetic stakeholder',
		'2025-01-02T11:00:00Z', '2025-01-10',
		'user-synthetic-alpha-owner', '2025-01-08', 'Fictional waiting state',
		'2025-01-02T11:00:00Z', '2025-01-02T11:00:00Z'
	),
	(
		'waiting-synthetic-beta', 'org-synthetic-beta',
		'portfolio-synthetic-beta', 'workspace-synthetic-beta', 'work_item',
		'item-synthetic-beta-task', 'approval', 'Synthetic stakeholder',
		'2025-01-02T11:01:00Z', '2025-01-10',
		'user-synthetic-beta-owner', '2025-01-08', 'Fictional waiting state',
		'2025-01-02T11:01:00Z', '2025-01-02T11:01:00Z'
	);

INSERT INTO decision_outcomes (
	id, organization_id, portfolio_id, decision_item_id, outcome, learning,
	would_repeat, recorded_by, recorded_at, created_at
) VALUES
	(
		'decision-outcome-synthetic-alpha', 'org-synthetic-alpha',
		'portfolio-synthetic-alpha', 'item-synthetic-alpha-decision',
		'Use the fictional direct channel', 'Synthetic learning only', true,
		'user-synthetic-alpha-owner', '2025-01-02T11:10:00Z',
		'2025-01-02T11:10:00Z'
	),
	(
		'decision-outcome-synthetic-beta', 'org-synthetic-beta',
		'portfolio-synthetic-beta', 'item-synthetic-beta-decision',
		'Use the fictional partner channel', 'Synthetic learning only', false,
		'user-synthetic-beta-owner', '2025-01-02T11:11:00Z',
		'2025-01-02T11:11:00Z'
	);

INSERT INTO workspace_snapshots (
	id, organization_id, portfolio_id, workspace_id, captured_at, health,
	progress, open_count, overdue_count, blocked_count, decision_count,
	attention_count, next_milestone_id, next_milestone_status,
	latest_update_at, source, created_at
) VALUES
	(
		'snapshot-synthetic-alpha', 'org-synthetic-alpha',
		'portfolio-synthetic-alpha', 'workspace-synthetic-alpha',
		'2025-01-03T08:00:00Z', 'watch', 0.35, 3, 1, 0, 1, 1,
		'item-synthetic-alpha-milestone', 'not_started',
		'2025-01-02T09:02:00Z', 'synthetic-rehearsal',
		'2025-01-03T08:00:00Z'
	),
	(
		'snapshot-synthetic-beta', 'org-synthetic-beta',
		'portfolio-synthetic-beta', 'workspace-synthetic-beta',
		'2025-01-03T08:01:00Z', 'on_track', 0.4, 3, 1, 0, 1, 1,
		'item-synthetic-beta-milestone', 'not_started',
		'2025-01-02T09:05:00Z', 'synthetic-rehearsal',
		'2025-01-03T08:01:00Z'
	);

INSERT INTO workspace_updates (
	id, organization_id, workspace_id, author_id, wins, current_priority,
	blocker, next_milestone, help_needed, note, published_at, created_at,
	updated_at
) VALUES
	(
		'update-synthetic-alpha', 'org-synthetic-alpha',
		'workspace-synthetic-alpha', 'user-synthetic-alpha-owner',
		'Fictional validation complete', 'Prepare launch',
		'Fictional approval pending', 'Fictional launch',
		'Review the fictional decision', 'Synthetic update only',
		'2025-01-03T09:00:00Z', '2025-01-03T09:00:00Z',
		'2025-01-03T09:00:00Z'
	),
	(
		'update-synthetic-beta', 'org-synthetic-beta',
		'workspace-synthetic-beta', 'user-synthetic-beta-owner',
		'Fictional validation complete', 'Prepare launch', '',
		'Fictional launch', '', 'Synthetic update only',
		'2025-01-03T09:01:00Z', '2025-01-03T09:01:00Z',
		'2025-01-03T09:01:00Z'
	);

INSERT INTO review_rituals (
	id, organization_id, portfolio_id, workspace_id, type, cadence, enabled,
	next_due_at, reminder_enabled, created_at, updated_at
) VALUES
	(
		'review-synthetic-alpha', 'org-synthetic-alpha',
		'portfolio-synthetic-alpha', 'workspace-synthetic-alpha', 'weekly',
		'weekly', true, '2025-01-10T09:00:00Z', true,
		'2025-01-03T09:10:00Z', '2025-01-03T09:10:00Z'
	),
	(
		'review-synthetic-beta', 'org-synthetic-beta',
		'portfolio-synthetic-beta', 'workspace-synthetic-beta', 'weekly',
		'weekly', true, '2025-01-10T09:00:00Z', true,
		'2025-01-03T09:11:00Z', '2025-01-03T09:11:00Z'
	);

INSERT INTO conversations (
	id, organization_id, portfolio_id, workspace_id, title, purpose, kind,
	visibility, created_by, last_message_at, created_at, updated_at
) VALUES
	(
		'conversation-synthetic-alpha', 'org-synthetic-alpha',
		'portfolio-synthetic-alpha', 'workspace-synthetic-alpha', 'Launch room',
		'Fictional Alpha coordination', 'workspace', 'organization',
		'user-synthetic-alpha-owner', '2025-01-03T10:00:00Z',
		'2025-01-03T09:50:00Z', '2025-01-03T10:00:00Z'
	),
	(
		'conversation-synthetic-beta', 'org-synthetic-beta',
		'portfolio-synthetic-beta', 'workspace-synthetic-beta', 'Launch room',
		'Fictional Beta coordination', 'workspace', 'organization',
		'user-synthetic-beta-owner', '2025-01-03T10:01:00Z',
		'2025-01-03T09:51:00Z', '2025-01-03T10:01:00Z'
	);

INSERT INTO conversation_participants (
	organization_id, conversation_id, user_id, participant_role,
	notification_level, joined_at
) VALUES
	(
		'org-synthetic-alpha', 'conversation-synthetic-alpha',
		'user-synthetic-alpha-owner', 'owner', 'all', '2025-01-03T09:52:00Z'
	),
	(
		'org-synthetic-alpha', 'conversation-synthetic-alpha',
		'user-synthetic-alpha-member', 'member', 'all', '2025-01-03T09:53:00Z'
	),
	(
		'org-synthetic-beta', 'conversation-synthetic-beta',
		'user-synthetic-beta-owner', 'owner', 'all', '2025-01-03T09:54:00Z'
	),
	(
		'org-synthetic-beta', 'conversation-synthetic-beta',
		'user-synthetic-beta-member', 'member', 'all', '2025-01-03T09:55:00Z'
	);

INSERT INTO conversation_messages (
	id, organization_id, conversation_id, sender_id, body, intent, metadata,
	created_at, updated_at
) VALUES
	(
		'message-synthetic-alpha', 'org-synthetic-alpha',
		'conversation-synthetic-alpha', 'user-synthetic-alpha-owner',
		'Synthetic Alpha coordination message.', 'update',
		'{"fixture":"synthetic"}', '2025-01-03T10:00:00Z',
		'2025-01-03T10:00:00Z'
	),
	(
		'message-synthetic-beta', 'org-synthetic-beta',
		'conversation-synthetic-beta', 'user-synthetic-beta-owner',
		'Synthetic Beta coordination message.', 'update',
		'{"fixture":"synthetic"}', '2025-01-03T10:01:00Z',
		'2025-01-03T10:01:00Z'
	);
