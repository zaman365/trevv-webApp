# TREVV observability assets

This directory is a vendor-neutral Prometheus contract plus an importable
Grafana dashboard. It contains no customer identifiers, payloads, URLs, query
strings, auth material, message text, or error messages.

Scrape each private API instance at `/internal/metrics` with the Prometheus job
name `trevv-api`, and each private worker instance at `/metrics` with the job
name `trevv-worker`. Do not publish either endpoint at the edge. Load
`prometheus-rules.yaml` into the selected Prometheus-compatible collector, route
`severity=page` to the on-call destination, route `severity=ticket` to the
operations backlog, and import `grafana-dashboard.json` into the selected
dashboard service.

The repository defines the metrics, thresholds, and panels but deliberately
does not claim that a collector, alert destination, error tracker, or source-map
uploader has been provisioned. Those external services require a reviewed EU
region, retention period, subprocessors entry, access policy, and secret-manager
configuration before private-beta traffic. Until then, this is a testable
runtime foundation, not an active monitoring system.
