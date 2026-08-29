# Integrations

Provider interfaces isolate external services from domain workflows. The core product remains useful with every provider disconnected.

## Current private-beta decision

No provider is approved for implementation or activation because the
repository contains no recorded pilot evidence selecting one. The provider
order in the release plan is a hypothesis to validate, not an enablement
decision. Live runtime gates therefore default every provider to
`disabled_no_pilot_evidence`; no OAuth credential, webhook, synchronization,
or provider write is active.

## Safe preview behavior

- Google Drive: a safe mocked picker/configuration seam is available in the fictional demo. It stores no production OAuth token and cannot claim to revoke provider access.
- Smart links: validated cards for Figma, GitHub, Canva, Google Docs/Sheets, Slack, and Shopify URLs. Embeds use an allowlist and safe sandboxing.
- Files: no upload endpoint or production object-storage adapter is enabled. Private objects, scanning, quarantine, deletion, and signed TTL downloads remain requirements for any approved file workflow.
- Email inbox: a complete safe demo client with Email as the primary Inbox tab and the original Actionable Inbox preserved beside it. The account setup normalizes Gmail/Workspace through the Gmail API, Outlook/Hotmail/Microsoft 365 through Microsoft Graph, Yahoo/AOL through OAuth-capable IMAP/SMTP, and iCloud, Zoho, and custom domains through secure IMAP/SMTP. Demo mode stores account labels and non-secret server metadata only; it never stores mailbox credentials in the browser.

## Production email adapter target (not implemented or approved)

- Google uses OAuth authorization-code flow with offline access, the narrowest Gmail scopes needed for read/organize/send, Gmail history synchronization, and Pub/Sub mailbox watches renewed before expiry.
- Microsoft uses the multi-tenant and personal-account authorization-code flow with PKCE, `offline_access`, delegated `Mail.ReadWrite` and `Mail.Send`, Graph delta synchronization, and renewable Graph change-notification subscriptions.
- Yahoo/AOL is not modeled as a general REST mailbox API. The adapter uses OAuth 2.0 with IMAP/SMTP where Yahoo grants mail scopes; an app-specific-password path can be offered only with explicit user guidance and encrypted secret storage.
- Apple iCloud uses `imap.mail.me.com:993` with TLS and `smtp.mail.me.com:587` with STARTTLS. Users provide an Apple app-specific password, never their primary Apple Account password.
- Zoho defaults are a convenience only because hosts can vary by plan and data region. Custom-domain connections require user-confirmed IMAP/SMTP hosts, ports, and TLS mode.
- Provider tokens and app passwords are envelope-encrypted at rest behind a server credential reference. Clients receive account metadata only. Webhook state values, delivery IDs, subscription expiries, history/delta cursors, sync leases, and outbound idempotency keys are stored server-side.
- MIME is parsed in the API/worker boundary with a maintained parser. Sanitized HTML, normalized text, attachment metadata, and provider identifiers are persisted separately; raw HTML is never rendered unsanitized.
- Push notifications are hints, not the source of truth. Gmail history and Graph delta cursors remain authoritative, and a bounded reconciliation job handles missed or delayed notifications. IMAP accounts use IDLE where infrastructure permits plus periodic cursor-based reconciliation.

## Later releases

Figma OAuth/webhooks, GitHub App, Calendar, live email provider credentials/synchronization, Slack notifications, Canva APIs, and selected Shopify context remain provider-backed backlog items and are not represented as production-complete in V1.

OAuth tokens are encrypted at rest, provider payloads and secrets are never logged, webhook authenticity is verified, and delivery identifiers enforce idempotency.
