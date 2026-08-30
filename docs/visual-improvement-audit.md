# TREVV visual improvement audit

**Audit date:** 2026-08-29<br>
**Repository state:** `main` at `89e7ade`<br>
**Scope:** Web/PWA shell, authentication, onboarding, Portfolio, Workspace overview, Teams, Messages, board/item detail, responsive behavior, visual system, and state design<br>
**Method:** live inspection of the local application, existing browser suites and screenshots, plus targeted CSS/component review

## Executive verdict

TREVV already has a coherent visual identity and an unusually complete-looking operating-system interface. The strongest screens feel calm, credible, and purposeful. The design is not yet release-ready, however, because one onboarding control defect blocks legibility, the desktop navigation can hide an item at ordinary laptop heights, and the densest three-pane and portfolio surfaces do not adapt early enough as available space falls.

The immediate order is:

1. Fix onboarding controls and add visual coverage for every onboarding step.
2. Make the sidebar's navigation region the only scrollable middle section.
3. Add a responsive two-pane mode for Messages before its columns become cramped.
4. Establish a clearer information-priority system for Portfolio, Workspace, Teams, and detail rails.
5. Add explicit loading, empty, error, offline, permission, and success states before replacing demo data with live data.

This audit distinguishes visual defects from product truth problems. For example, Sign in is visually polished, but the current form is not authentication. The production interface must not present it as “Secure workspace access” until the underlying flow is real.

## What is already working well

- A consistent restrained palette, rounded geometry, icon family, and spacing language make the product recognizable.
- The hierarchy from Portfolio to Workspace to work item is visually understandable on the strongest paths.
- Status colors are generally subtle rather than alarmist; the recent information-token contrast correction is a good precedent.
- Sign in has a clear split composition, useful product framing, and a focused form.
- Board tables and item detail keep operational context close to the work.
- Teams and Messages now follow the Workspace mental model and share a consistent shell.
- Keyboard-visible controls, Chromium/mobile-Chromium browser tests, and automated accessibility checks provide a much stronger base than visual-only QA.

## Priority summary

| ID      | Severity | Surface                 | Finding                                                                                          | Release target  |
| ------- | -------- | ----------------------- | ------------------------------------------------------------------------------------------------ | --------------- |
| VIS-001 | P0       | Onboarding              | Radio and checkbox controls inherit full text-input dimensions and cover their labels            | Now / pre-alpha |
| VIS-002 | P1       | App shell               | The last Workspace navigation item can be clipped behind the fixed System/footer region          | Now / pre-alpha |
| VIS-003 | P1       | Messages                | Three panes remain visible after the context rail becomes too narrow to scan comfortably         | Alpha           |
| VIS-004 | P1       | Portfolio and Workspace | Too many cards, chips, and secondary values compete at equal visual weight                       | Alpha           |
| VIS-005 | P1       | Portfolio               | Selected Workspace context can be mistaken for the scope of portfolio-wide metrics               | Alpha           |
| VIS-006 | P1       | Live-data transition    | Loading, stale, error, empty, offline, conflict, and permission states are incomplete            | Alpha           |
| VIS-007 | P2       | Teams                   | Cards use substantial height for little information; capabilities are too visually quiet         | Alpha           |
| VIS-008 | P2       | Messages                | Conversation navigation needs a compact/collapsed option and clearer empty-room guidance         | Alpha           |
| VIS-009 | P2       | Type system             | Dense metadata frequently approaches the smallest comfortable reading size                       | Alpha           |
| VIS-010 | P2       | Responsive QA           | Existing screenshots are stale and do not form a visual-regression baseline                      | Pre-alpha       |
| VIS-011 | P2       | Internationalization    | German and longer content have not been validated throughout the responsive shell                | Beta            |
| VIS-012 | P2       | Preferences             | Dark theme, reduced motion, high contrast, zoom, and persisted theme behavior need systematic QA | Beta            |

## Detailed findings and resolution plans

### VIS-001 — onboarding choice controls obscure their labels

**Severity:** P0 release blocker<br>
**Observed:** On onboarding step 1, every unselected radio appears as a large white circle over the option copy. The selected radio is also oversized and interrupts the title. The same cascade can affect later radio/checkbox choices.

**Root cause:** `apps/web/app/workspace.css:1792-1803` applies `width: 100%`, `height: 40px`, margin, padding, surface, and border rules to every input inside `.onboarding-form`. The later selector at `apps/web/app/workspace.css:2024-2030` positions choice controls but does not reset their inherited dimensions.

**Implement:**

1. Scope field styling to text-like controls, for example `input:not([type="radio"]):not([type="checkbox"]):not([type="color"])`, `select`, and `textarea`.
2. Give radio/checkbox controls an explicit 16–18 px logical size, zero padding/margin, and a stable absolute inset.
3. Ensure the entire option card remains the click target and the native input retains a visible focus indicator.
4. Check steps 1, 3, and 4 at desktop, 320 px, 390 px, 768 px, 200% zoom, and high-contrast mode.
5. Add screenshot assertions for every onboarding step; the current test only verifies headings.

**Definition of done:** No choice control overlaps text at any supported width or 200% zoom; every card is keyboard operable; focus is visible; the visual baseline catches a return of 40 px radios.

### VIS-002 — sidebar navigation is clipped at laptop heights

**Severity:** P1<br>
**Observed:** At a common 945 px-high desktop viewport, the Waiting navigation row is partially hidden where the Workspace list meets the fixed System region. Shorter laptop windows will lose more items.

**Root cause:** `.sidebar nav` at `apps/web/app/globals.css:103-107` has overflow but is not defined as the flexible, shrinkable middle region. `.sidebar-foot` at `apps/web/app/globals.css:190-194` uses `margin-top: auto`; without `flex: 1` and `min-height: 0` on the navigation section, layout pressure can produce overlap/clipping.

**Implement:**

1. Set the sidebar to a three-region layout: fixed header, `nav { flex: 1 1 auto; min-height: 0; overflow-y: auto; }`, fixed footer.
2. Set the footer to `flex: 0 0 auto` and preserve a visible divider.
3. Add bottom scroll padding so the last row clears the divider and focus ring.
4. Show a subtle scroll affordance only when content actually overflows.
5. Test 768, 820, 900, and 945 px viewport heights with all navigation groups expanded.

**Definition of done:** Every item can be reached by pointer and keyboard; the active item is never covered; the footer never scrolls away; there is no double scrollbar.

### VIS-003 — Messages needs an earlier responsive mode

**Severity:** P1<br>
**Observed:** Messages combines global sidebar, conversation rail, thread, and context rail. It works on a wide display, but at ordinary laptop widths the right rail truncates labels and the thread becomes an unnecessarily narrow reading column. The context is useful; displaying all three panes continuously is not.

**Evidence:** The fixed three-column shell begins at `apps/web/app/workspace.css:11193`; context styles begin at `:11961`; responsive overrides do not remove the rail until selectors around `:12386-12607`.

**Implement:**

1. Preserve the two essential panes—conversation list and active thread—at medium desktop widths.
2. Move Room context to a sheet/drawer below approximately 1280 px, opened by the existing information action.
3. At narrow tablet widths, make the conversation rail collapsible and remember the preference locally.
4. Give the thread a readable minimum width and cap message-line length near 70 characters.
5. Allow the conversation rail to be resized within safe minimum/maximum bounds on large desktops.
6. Keep context state, keyboard focus, and scroll position when the drawer opens/closes.

**Definition of done:** At 1024, 1180, 1280, and 1440 px, no meaningful label is ellipsized by default, the composer remains fully visible, and the active thread has a comfortable reading width. Drawer focus is trapped and returned correctly.

### VIS-004 — strengthen the information-priority system

**Severity:** P1<br>
**Observed:** Portfolio and Workspace pages contain many borders, chips, percentages, counts, captions, and cards with similar emphasis. The content is rich, but the founder must scan the whole surface before knowing which action matters most.

**Implement:**

1. Define four presentation tiers:
   - **Act now:** at most 3–7 evidence-backed interventions, high contrast, direct action.
   - **Monitor:** compact status summaries and deltas.
   - **Understand:** charts, roll-ups, supporting evidence.
   - **Explore:** links, history, secondary modules.
2. Reserve filled status treatments for actionable or selected states. Use quiet text/border treatments for descriptive metadata.
3. Reduce the number of simultaneous card containers by grouping related metrics under one section heading.
4. Apply progressive disclosure to secondary evidence and history.
5. Use consistent locations for primary action, overflow menu, status, owner, and last-updated data.
6. Let Attention/Founder Brief lead the first viewport; do not turn every metric into an alert.

**Definition of done:** In a five-second test, a new founder can identify scope, health, the top issue, its owner, and the next action without scrolling.

### VIS-005 — make Portfolio reporting scope explicit

**Severity:** P1<br>
**Observed:** Portfolio content intentionally reports across all Workspaces while the switcher can still show a selected Workspace such as CentralOps. The code documents this distinction in `apps/web/lib/workspace-context.tsx:145-156`, but the interface can imply that the metrics are CentralOps-only.

**Implement:**

1. Show an explicit “Portfolio-wide” scope label beside the page title or filter row.
2. Treat the selected Workspace in the shell as navigation context, not the reporting filter, while on Portfolio.
3. If users can filter the Portfolio later, use a separate clearly named filter control and show active-filter chips.
4. Include scope in export, share, and timestamp copy.

**Definition of done:** Users correctly answer “which Workspaces contribute to these numbers?” without opening a tooltip.

### VIS-006 — design the full live-data state model

**Severity:** P1<br>
**Observed:** Seed data makes most surfaces look populated and successful. A real system will spend time loading, syncing, retrying, resolving concurrent edits, handling revoked access, and showing empty organizations. Those states are not yet consistently designed, and the app has no route-level `loading.tsx`, `error.tsx`, or general `not-found.tsx` boundaries.

**Implement a shared state kit:**

- Skeletons that preserve the final layout without fabricating counts.
- “No data yet” states with one primary next step, distinct from “No results”.
- Inline retry for recoverable section failures and route-level recovery for fatal failures.
- Stale/offline banners with last-synced time and clear capability limits.
- Optimistic saving, saved, failed, and conflict states near the edited object.
- Permission-denied and no-longer-available states that do not leak resource existence.
- Background-job progress for imports, exports, sync, and automation.
- Success feedback that confirms what actually happened rather than merely closing a dialog.

**Definition of done:** Each release-scope route has documented loading, empty, partial-error, fatal-error, offline/stale, unauthorized, and success behavior; browser tests exercise the critical variants.

### VIS-007 — make Teams more compact and operational

**Severity:** P2<br>
**Observed:** Team cards communicate name, lead, members, and capabilities, but large card heights leave unused space while capability chips and supporting text are small. The directory can become slow to scan as Marketing, Tech, Sales, Operations, and more teams are added.

**Evidence:** Team grid/card rules are concentrated at `apps/web/app/workspace.css:8301-8409`; the rendered cards begin in `apps/web/components/team-workflow.tsx:288`.

**Implement:**

1. Default to a compact card or row: team name, lead, member count, active work/rooms, top 2–3 capabilities, and an overflow action.
2. Put the complete capability bundle in the detail view, not every card.
3. Use member avatars only when they add recognition; otherwise show a count plus lead.
4. Add explicit empty states for no teams, no members, and no capabilities.
5. Make inherited options legible as “available to 6 members” and separate them from security permissions.
6. Add list/grid density preference only if usage evidence supports both.

**Definition of done:** At least six teams are scannable in one laptop viewport; lead, size, purpose, and health are distinguishable without opening each card.

### VIS-008 — clarify empty and mixed conversation navigation

**Severity:** P2<br>
**Observed:** The Conversations rail correctly groups Teams, Rooms, and People. In a new Workspace it can show several zero-count sections and “No team rooms”, producing a sparse but busy rail.

**Implement:**

1. Explain that creating a Team automatically creates its Team room; link directly to Teams when none exist.
2. Collapse empty groups after showing one contextual onboarding prompt.
3. Distinguish Team rooms from manually created Rooms using stable icon/label treatment, not color alone.
4. Surface unread and needs-response state above chronology; keep empty numeric badges out of the default view.
5. Give “Create Team”, “Create Room”, and “New message” distinct jobs and prevent competing primary actions.

**Definition of done:** A new user understands the difference between Teams, Rooms, and People and knows what to create next without documentation.

### VIS-009 — increase readability of secondary information

**Severity:** P2<br>
**Observed:** Many timestamps, labels, badges, descriptions, table cells, and context-rail values use very small type. Automated contrast can pass while the interface remains tiring on dense pages.

**Implement:**

1. Set 12 px as an exceptional metadata size rather than the general secondary size; prefer 13–14 px for operational content.
2. Maintain at least 1.35 line-height for compact labels and 1.5 for prose.
3. Increase contrast of essential metadata; de-emphasize by placement/weight before reducing opacity.
4. Test 125% OS/browser scaling and 200% zoom before accepting dense layouts.
5. Avoid putting two low-emphasis values beside one another when one is operationally important.

**Definition of done:** Essential owners, dates, blockers, unread status, and action labels remain easily readable at 125% scaling and 200% zoom.

### VIS-010 — replace stale screenshots with a visual baseline

**Severity:** P2<br>
**Observed:** `docs/screenshots/portfolio-mobile.png` still contains the retired “Hubs” vocabulary. Existing screenshots therefore cannot be trusted as a current release baseline.

**Implement:**

1. Generate deterministic screenshots from CI seed data for Sign in, all onboarding steps, Portfolio, Workspace, Attention, My Work, Inbox, Messages, Teams, board/item, and Settings.
2. Capture desktop, laptop-short, tablet, and mobile viewports.
3. Add focused component snapshots for navigation overflow, radio/checkbox cards, tables, drawers, dialogs, toasts, and status tokens.
4. Review image diffs as a required PR artifact; establish a deliberate baseline-update process.
5. Regenerate documentation screenshots after IA or brand vocabulary changes.

**Definition of done:** A visual change that recreates VIS-001 or VIS-002 fails CI before merge.

### VIS-011 — validate German and variable-length content

**Severity:** P2<br>
**Observed:** The interface exposes an EN/DE foundation, but substantial copy is hard-coded in English and compact controls have not been validated with longer translations, long names, or large counts.

**Implement:**

1. Either complete German for the release scope or remove/label the switch until it is complete.
2. Test pseudolocalized copy at 30–50% expansion.
3. Test long Workspace/team/person names, 4-digit counts, missing avatars, and unbroken tokens.
4. Use wrapping for meaning; reserve ellipsis for content that is available on focus/hover or in detail.

**Definition of done:** No release-scope control clips or loses meaning under pseudolocalization; locale persists across sessions.

### VIS-012 — complete preference and inclusive-mode QA

**Severity:** P2<br>
**Observed:** Theme and locale currently live in React state (`apps/web/lib/workspace-context.tsx:69-80`, `:132-143`). Automated accessibility coverage does not replace manual testing of dark theme, forced colors, reduced motion, screen readers, touch targets, or zoom.

**Implement:**

1. Persist theme and respect `prefers-color-scheme` until a user chooses.
2. Respect `prefers-reduced-motion` for every transition and animated status.
3. Review dark theme token-by-token; avoid one-off component overrides.
4. Add manual NVDA/VoiceOver, keyboard-only, 200% zoom, forced-colors, and touch-target checks to release gates.
5. Validate focus order when sidebars/drawers collapse.

**Definition of done:** The manual accessibility checklist in `docs/accessibility.md` is completed for every release-scope route with recorded evidence.

## Page-by-page recommendations

| Surface                       | Keep                                                            | Improve next                                                                                                                           |
| ----------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Sign in / sign up             | Split composition, clear form focus, restrained product preview | Until auth is real, identify it as demo access; add honest errors, recovery, verification, SSO placeholder states only when functional |
| Onboarding                    | Five-step rhythm, minimal conceptual setup, visible progress    | Fix controls; persist progress; validate/skippable states; reduce the final claim until backend creation succeeds                      |
| Portfolio                     | Cross-workspace narrative, health and attention concepts        | Make scope explicit; lead with 3–7 interventions; group monitoring data; reduce equal-weight cards                                     |
| Workspace overview            | Strong operational summary and consistent shell                 | Prioritize next action; move less-used modules below fold; clarify last-updated/source evidence                                        |
| Attention / My Work / Waiting | Differentiated founder operating loop                           | Standardize evidence, owner, urgency, confidence, next action, undo, and false-positive feedback                                       |
| Inbox                         | Capture/promotion concept                                       | Distinguish source, suggested classification, confidence, and confirmation; design sync/error states                                   |
| Messages                      | Context-linked collaboration rather than generic chat           | Collapse context earlier; clarify Team/Room/People groups; preserve reading width and focus behavior                                   |
| Teams                         | Team inheritance concept and clean cards                        | Increase density; distinguish capabilities from authorization; show real operational counts                                            |
| Boards / item panel           | Rich, close-to-work detail                                      | Audit horizontal overflow; use sticky action hierarchy; design optimistic/error/conflict states                                        |
| Settings                      | Broadly organized settings concepts                             | Hide simulated security/audit/integration actions; use real saved/pending/error feedback; require destructive confirmations            |
| Mobile Web                    | Existing responsive intent and bottom navigation                | Rebuild current screenshots; test real device safe areas, keyboards, touch targets, tables, drawers, and offline state                 |

## Recommended execution sequence

### Sprint 0 — visual safety, 2–4 days

- Fix VIS-001 and VIS-002.
- Add onboarding-step and short-height sidebar screenshots.
- Relabel fake auth/demo behavior so visual copy matches reality.
- Regenerate stale documentation screenshots.

### Alpha design pass — 1–2 weeks alongside persistence work

- Implement the shared live-data state kit.
- Establish Act now / Monitor / Understand / Explore hierarchy.
- Clarify Portfolio scope.
- Implement medium-width Messages drawer/collapse behavior.
- Compact Teams.
- Add real save, error, undo, and conflict feedback to the founder golden path.

### Beta design-system hardening — 1–2 weeks plus continuous QA

- Consolidate recurring cards, action bars, badges, empty states, and drawers into documented components.
- Complete responsive, long-content, pseudolocale, dark-theme, reduced-motion, zoom, and manual screen-reader matrices.
- Add image-diff review to CI and measure production Core Web Vitals.
- Run moderated usability sessions with solo founders, a 5–15-person startup, and a portfolio operator.

## Visual release gates

Before closed alpha:

- VIS-001 and VIS-002 are closed with regression coverage.
- Every golden-path action has truthful pending/success/error behavior.
- No production control claims to send, publish, secure, connect, or import unless the backend completes it.
- Keyboard, focus, zoom, and mobile checks pass on the golden path.

Before public beta:

- No unresolved P0/P1 visual or accessibility defects.
- All paid/onboarding routes have loading, empty, error, offline, and permission states.
- Responsive QA passes at 320, 360, 390, 768, 1024, 1180, 1280, 1440, and a short 768 px-high laptop viewport.
- Long names, pseudolocale, 200% zoom, dark theme, reduced motion, and forced colors pass.
- Production Core Web Vitals and error-state analytics are observable.

Before GA:

- Independent accessibility/usability review is complete.
- The last 30 days show no open Sev-1 visual/accessibility issue.
- Visual regression baselines represent every supported critical route and state.
- Five-second comprehension tests consistently identify scope, top intervention, owner, and next action.

## Design principles to protect

1. **Clarity over coverage.** A founder should see fewer, better-supported interventions—not every possible metric at once.
2. **Evidence beside urgency.** Any alert, recommendation, or automated suggestion must show why it exists.
3. **One dominant action per decision point.** Secondary options can remain available without competing visually.
4. **Progressive disclosure, not tiny text.** Compress by hierarchy and interaction before shrinking typography.
5. **Context follows the work.** Team, room, decision, update, and evidence should remain linked without forcing permanent extra panes.
6. **States must tell the truth.** “Sent”, “saved”, “secure”, and “connected” are outcomes, not decorative copy.
7. **Responsive means reprioritized.** Mobile and medium desktop layouts should change information order, not merely squeeze columns.

## Audit limitations

- The live preview uses seeded/browser-local data, so real network latency, large data volumes, permission differences, concurrent edits, and provider failures could not be assessed visually.
- Automated axe coverage is valuable but does not replace manual assistive-technology testing.
- Native mobile and desktop shells were reviewed from source/status documentation, not fully packaged devices.
- Final typography/rendering can vary across Windows, Android, and browser engines; representative-device QA remains required.
