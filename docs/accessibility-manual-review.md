# Accessibility manual-review register

Status: **accepted deferral; GA blocker**

Review date: 30 August 2026
Owner: Accessibility QA
Expiry: 15 September 2026

The browser accessibility gate fails every Axe WCAG A/AA violation. It also
fails every `incomplete` rule unless a bounded, owned, unexpired review appears
in `config/axe-incomplete-reviews.json`.

The fictional-data and PostgreSQL-backed live suites use separate inventories.
Live fingerprints in `config/live-axe-incomplete-reviews.json` were measured by
local Chromium and WebKit executions against an isolated migrated PostgreSQL
database. They are additionally bound to a semantic surface and browser engine;
every violation, new surface/rule/selector, changed count/hash, unlisted browser,
or expired record still fails. This is bounded diagnostic acceptance, not
completed assistive-technology or numerical-contrast evidence.

## AXE-MANUAL-001 — computed color contrast

Axe reports `color-contrast` as incomplete where CSS custom properties,
`color-mix()`, gradients, or layered backgrounds prevent it from computing the
effective colors. The current automated scans report no contrast violations,
and targeted light/dark visual inspection found no illegible text. That is not
the same as a recorded numerical contrast review.

The 30 August browser-gate review also corrected product defects instead of
allowlisting them: mobile navigation and text-action backgrounds are now
opaque theme surfaces, navigation items declare their background explicitly,
Board header and summary text use the stronger `--fh-ink-soft` token, and
compact Blueprint and Attention tabs no longer shrink into overlapping labels.
The remaining Board-table fingerprints are limited to horizontally clipped,
off-screen header/summary cells. Their declared pair is `--fh-ink-soft` on
`--fh-surface-subtle`; the exact selector sets are recorded separately for the
platform layouts CI and local browsers produce. This source review explains
why Axe cannot measure the cells, but it is not independent manual contrast or
assistive-technology evidence.

WebKit additionally reports the item-panel status and priority native selects
as partially obscured, so it cannot determine their effective backgrounds. The
declared light-theme pairs are `--fh-primary-strong` on
`--fh-primary-soft` (6.30:1) and `--fh-danger` on
`--fh-surface-subtle` (6.12:1). This calculation is useful diagnostic evidence,
but native-control rendering still requires the recorded assistive-technology
and visual review below before the deferral can close.

The live inventory covers the measured sign-in/sign-up, Portfolio, Board,
Attention, weekly-review, and password-recovery surfaces. Its current
`color-contrast` incompletes are caused by native/partially obscured controls or
layered gradients whose effective background Axe cannot calculate. No live Axe
violation is accepted. Privacy and invitation screens produced no separate
incomplete fingerprint in the measured run. The final Messages path completed
in Chromium and WebKit without an unreviewed result after its text surface was
changed from a layered gradient to a solid theme surface.

Every temporarily accepted demo finding is bound to its Axe rule, route, theme,
browser project, node count, and SHA-256 of the sorted selector set. Live
findings are bound to rule, semantic surface, browser engine, node count, and
selector hash. A new rule, selector, missing selector, changed count, unlisted
surface/engine, or expired review fails CI. Before GA, Accessibility QA must
replace this deferral with recorded
foreground/background measurements for every remaining selector, including
normal and large text thresholds, then remove the fingerprint entries.

The mobile-Chromium demo inventory was remeasured on 30 August 2026 after the
self-hosted font and compact-navigation changes. All 18 mobile accessibility
scenarios passed with no Axe A/AA violation after the exact selector counts and
hashes were refreshed. Those refreshed `incomplete` fingerprints remain a
temporary diagnostic deferral under the same 15 September expiry; they are not
GA contrast evidence.

The Ubuntu runner and local macOS browser compositor do not always return the
same `incomplete` selector set for layered mobile surfaces. Both measured sets
are recorded as separate exact fingerprints for the affected route, theme, and
browser project. The Ubuntu results were identical across the initial run and
both retries, and the recurring Quick capture and Blueprint findings also match
the preceding Ubuntu run. This is bounded cross-platform diagnostic evidence;
it does not relax the zero-violation rule or replace the independent review
required before GA.

The shell follow-up replaced translucent Workspace and Portfolio marks with
token-backed opaque surfaces, gave badges a theme-aware foreground, and removed
the obsolete larger dark-theme fingerprints. Where Axe still returns
`incomplete`, dark mode is accepted only under the new reduced exact fingerprint
or the identical already-reviewed light fingerprint. Reintroducing the removed
layered styles therefore fails rather than matching an old allowance.

The sign-in follow-up also replaced the decorative authentication-panel
gradient with an opaque, contrast-safe surface after removing its fictional
portfolio cards. Desktop and mobile now produce the same single reviewed
separator fingerprint; the obsolete larger desktop fingerprint is no longer
accepted.

The first Linux run after that follow-up reduced mobile Attention from its
obsolete 13-node compositor sets to the same single Quick Capture label already
observed on other mobile routes. It also returned the Board's reviewed
three-node light set unchanged in dark Chromium. Both repeated identically on
the initial attempt and two retries; the policy records those exact reduced
sets and no longer accepts the larger Attention sets.

This register does not satisfy the required keyboard, VoiceOver/NVDA, 200%
zoom, reduced-motion, high-contrast, or touch-target evidence. Those remain
separate release gates.
