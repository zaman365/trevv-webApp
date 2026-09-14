# Account profile and protected login email

Edit profile is available from your own workspace profile, user card, hover
card, account sessions page and the user menu. The account editor is also
available without a selected workspace at `/app/account/profile`.

Personal fields are name, optional public HTTPS photo URL, job title, bio,
phone, location, website and time zone. Empty optional fields can be cleared.
These details are visible only through the existing authorized workspace
directory/profile surfaces. Photos are fetched directly by the browser with
no referrer and fall back to initials; the API does not fetch arbitrary URLs.
The image-only CSP source permits HTTPS photos; script/connect restrictions
remain in place. Workspace dates continue to use the workspace's time zone.

`GET /api/auth/profile` reads only the authenticated person's mapped product
profile. `POST /api/auth/profile` accepts exactly name, details and the last
read version. It rejects email, IDs, roles, memberships and unknown fields.
The account editor retains the draft on errors and version conflicts. Reload
latest profile explicitly discards a stale draft. Profile fields are stored
in `app_users.profile`; name changes update both credential and product
identity in one transaction. Existing profile work/team/activity views,
messaging, email and assignment actions remain available.

Changing the primary login email is separate:

1. `POST /api/auth/change-email` requires a verified signed-in account, trusted
   origin and the current password. Existing shared authentication rate limits
   apply. The password is never stored in browser drafts.
2. A time-limited, single-use confirmation link goes to the current inbox.
3. Confirming the current inbox sends a second link to the new inbox. The old
   login address remains active while either step is pending.
4. Verifying the new inbox updates the credential email and the same product
   user atomically. The user's ID, memberships, roles and work remain intact.
   An occupied address cannot merge accounts.

The editor shows the pending address, stage and expiry, and allows restarting,
cancelling or refreshing its status. Cancellation and restart invalidate the
earlier links. Email transitions are serialized across API replicas with a
database advisory lock. Failed delivery is reported without claiming success.
The public auth proxy returns only explicit profile fields; auth/session tokens
remain private. All other auth response redaction is preserved.

Migration `0027_remarkable_ted_forrester.sql` adds profile storage and an
identity synchronization trigger; it must precede this backend release.
Security checks use disposable PostgreSQL databases and a memory mail sink.
The local sample preview never sends verification email or changes real login
credentials. Profile information belongs to the existing identity inventory
and follows the same privacy request and retention workflow.

Validation: the focused auth integration cases cover ownership, field
validation, stale edits, identity synchronization, password confirmation,
both inboxes, cancellation, expiry, replay and membership preservation.
The profile browser check covers editing, draft recovery, saving, reload,
email-change controls and desktop/mobile layout. Auth proxy and routing
checks preserve existing response redaction and account navigation. Web,
API integration and auth type checks and the changed web files' lint passed.
