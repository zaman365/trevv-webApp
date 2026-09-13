# Dashboard sections — September 13, 2026

The live Dashboard's top shortcuts now select in-page sections. Summary retains
the complete dashboard, including charts, filters, source tasks, worker status,
operational counts, creation controls, and underlying board/item links.

The additional sections are My Work, Projects, Teams and people, Messages, Inbox,
Attention, Decisions, Approvals, and Waiting. Each includes an explicit full-page
link. The existing routes remain available through navigation and these links.
Operating-loop cards select their matching dashboard section as well.

Sections reuse the same live components, permissions, mutations, recovery and
error states as their full pages. Teams and Messages expose their content without
nesting a second workspace frame or main landmark. Their existing route exports
still provide the original full-page layout and controls.

Panels load when first selected. Previously visited panels preserve their state
using React's [Activity boundary](https://react.dev/reference/react/Activity),
which stops effects while hidden and restores them when shown. This retains
filters and drafts without keeping hidden conversation subscriptions active.
Panel identities include the workspace, preventing reuse across workspaces.

The `section` search parameter preserves the selected section across reloads and
browser history. Other search parameters are retained, and detail hashes are
cleared when switching to a different section. Unknown sections show Summary.
Tabs support arrow keys, Home/End, selected states, and linked tab panels.

No backend, data model, permission policy, or demo Dashboard capabilities change.

Validation passed: 372 web unit tests, 50 Chromium workflow checks, 10 Safari
engine checks for the new sections, lint, type checking, and the production
build. Browser coverage includes full-page destinations, independent filters,
message and decision draft retention, inline updates, team/project controls,
Attention details, history/reload restoration, the standalone Messages route,
and desktop/mobile light and dark layouts.

The subsequent shared-planning extension adds a Plans and ideas tab and compact
cards to Summary and My Work. Its optional collaboration fields and database
migration are described in [Shared plans and ideas](shared-planning-2026-09-13.md).
All sections and full-page destinations described above remain available.
