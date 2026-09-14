# TREVV page sections

## Analysis and interaction contract

The Dashboard already provides the right interaction: a stable page heading,
useful local sections, working embedded tools and explicit full-page links.
Other main routes vary between long undivided pages and links that leave the
current context. Portfolio currently has a summary and workspace cards, but no
way to work within a selected workspace without leaving the portfolio.

Extend the pattern as a shared component, rather than copying the complete
Dashboard navigation everywhere. Each page keeps its own purpose and original
content as the first section. Related sections embed existing live tools and
their permission, confirmation, retry, empty and error states. Do not invent
backend capabilities, display fake counts or substitute demo records in live
mode. Keep existing creation, editing, filters, dialogs, management and routes.

Tabs change content below the header. They support arrow keys, Home/End, visible
focus, accessible tab/panel relationships and a compact wrapping layout on small
screens. URL state supports reload and back/forward navigation; unrelated query
parameters survive, and a detail hash is retained only with its originating
section. Previously opened panels preserve drafts/filters while their effects
pause when hidden. Related sections load on demand. Nested embedded tools do not
render another top-level tab bar, page frame or main landmark.

## Page map

| Page            | Local sections                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Portfolio       | Overview, Workspaces, My Work, Projects, Plans and ideas, Teams, People, Messages, Attention, Decisions, Approvals, Waiting |
| My Work         | Tasks, Plans and ideas, Inbox, Waiting, Attention                                                                           |
| Projects        | Projects and sprints, Plans and ideas, My Work, Teams, Decisions                                                            |
| Inbox           | Inbox, My Work, Messages, Waiting                                                                                           |
| Attention       | Issues, Waiting, Decisions, Approvals, Weekly review                                                                        |
| Decisions       | Decisions, Approvals, Attention, Messages                                                                                   |
| Approvals       | Approvals, Decisions, My Work, Messages                                                                                     |
| Waiting         | Follow-ups, My Work, Messages, Attention                                                                                    |
| Plans and ideas | Plans and ideas, Projects, Decisions, Teams                                                                                 |
| People          | Directory, Teams, Messages, My Work                                                                                         |
| Teams           | Teams, People, Messages, My Work, Projects                                                                                  |
| Messages        | Conversations, People, Teams, Inbox, Waiting                                                                                |
| Weekly review   | Review, Attention, My Work, Decisions, Approvals                                                                            |
| Calendar        | Schedule, My Work, Projects, Waiting                                                                                        |
| Search          | Search, My Work, Projects, People                                                                                           |

Portfolio retains the complete current overview and workspace-creation flow.
Workspaces gains name/description/type search and health/type filters. Operational
tabs have an explicit workspace selector constrained to the current portfolio;
they load only that authorized workspace's records, reuse the main query cache,
and expose a full-page destination. Empty portfolios and lost access receive
honest empty/recovery states. No cross-portfolio counts are presented as personal
counts. The organization-wide My Work route retains all-workspace assignments
and shared planning, with separately scoped companion tools.

Team and person detail pages already have purposeful local sections; align their
navigation visuals with the shared style while preserving deep links. Specialized
board, mail, account, settings and guide workflows retain their existing view
controls and actions; do not add irrelevant duplicate Dashboard menus. Demo
routes remain available with their existing local behavior and can reuse the
visual component without acquiring live mutations.

## Implementation and verification

1. Build shared tabs, section state, panels and the context-specific page map.
2. Adopt it in Dashboard and main workspace pages with original content intact.
3. Add Portfolio workspace browsing and scoped embedded workflows; preserve the
   summary-loading performance boundary and shared mutation/event cache.
4. Align existing team/person detail navigation and organize personal work.
5. Test first-section preservation, real fixture mutations, retained drafts,
   URL history/deep links, workspace/portfolio boundaries, keyboard/mobile/dark
   accessibility and unchanged standalone routes. Run lint/types/unit checks,
   affected browser suites and production build/loading budgets.

Local preview and any browser mutations use isolated example records. Email or
messages to real people are not test traffic. Publication is tracked separately.

## Completed implementation

The shared navigation is active on Portfolio, organization-wide My Work, the
workspace pages in the map, and the existing team/person detail navigation.
Original first panels and standalone destinations remain available. Portfolio
adds searchable workspace cards, health/type filters, explicit workspace scope,
and actionable embedded tools. The shared canonical query cache handles updates;
access loss hides scoped records and provides access recovery.

Dashboard plan creation now loads its editor after the first New plan click.
Closing and reopening preserves the draft; successful creation still updates the
board cache and supports sharing with selected people. Chat profile previews
continue to open with hover, click and keyboard; focus restoration after pointer
actions no longer reopens a dismissed card. Sender buttons stay within their
labels so long names cannot overlap the message type at medium widths.

## Validation evidence

### Compact page headers (September 14)

The workspace name stays in the persistent switcher. Main page headers now use
one compact topic/action row without repeating workspace labels or introductory
paragraphs. Existing tabs, filters, contextual help, creation controls and
full-page links remain available. Connection freshness and refresh stay in the
shell's connection control. Entity profiles retain their actionable details.

### Earlier page-sections validation

- Web lint, TypeScript, and all 389 unit tests across 72 files pass.
- Browser checks exercise Portfolio creation and workspace filters; isolated
  workspace reads/mutations, selection history/reload, access loss/recovery;
  embedded People, Projects, Messages, Inbox and issue workflows; retained
  drafts; keyboard navigation; mobile light/dark accessibility.
- Dashboard and team workflow regressions pass, including task changes,
  project/team dialogs, plan creation and preserved dismissed plan drafts.
- Floating chat/profile regressions pass, including replies, reactions,
  participants, conversation reuse, retries, draft handoff and profile actions.
- Calendar retains schedule controls and the selected view after visiting a
  related tab. Organization-wide My Work retains its task view and offers
  separately scoped communication.
- Chromium and WebKit checks pass for the new page flows and the medium-width
  message layout. Local fixtures perform no communication with real people.
- Next and Cloudflare production builds pass their existing JavaScript/CSS
  budgets; public-style coverage also passes. No thresholds were increased.

The local preview uses sample data at `http://127.0.0.1:4179/?view=portfolio`.
Production publication remains a separate release step; passing local checks is
not evidence of a completed deployment or a successful remote CI run.

## Teams directory release correction

The Teams route composes its page tabs below the existing workspace heading and
actions. It uses one heading area, retains Create Team, People directory and
invitations, and keeps the same summary dialogs, cards, workload and management
flows. Feature labels use the full card width. A six-team browser regression
includes the production sidebar/topbar space and owner actions so extra header
height cannot silently push the second row off screen again.
