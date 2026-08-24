# Integrations

Provider interfaces isolate external services from domain workflows. The core product remains useful with every provider disconnected.

## V1

- Google Drive: optional OAuth/Picker, least-privilege scope, references rather than copied Drive files, encrypted credentials, explicit disconnect. A safe mocked picker is available in development and CI.
- Smart links: validated cards for Figma, GitHub, Canva, Google Docs/Sheets, Slack, and Shopify URLs. Embeds use an allowlist and safe sandboxing.
- Files: a storage interface with local development and S3-compatible production adapters; private objects and signed URLs.

## Later releases

Figma OAuth/webhooks, GitHub App, Calendar, Gmail, Slack notifications, Canva APIs, and selected Shopify context remain provider-backed backlog items and are not represented as complete in V1.

OAuth tokens are encrypted at rest, provider payloads and secrets are never logged, webhook authenticity is verified, and delivery identifiers enforce idempotency.

