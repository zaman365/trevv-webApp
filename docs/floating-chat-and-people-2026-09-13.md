# Floating chat and people workspaces

## Functionality plan

The floating messenger is a persistent, bottom-right companion in the signed-in
workspace. It opens without leaving the current page. Threads, People and Teams
are its primary tabs, with independently closable conversation tabs underneath.
People can search conversations, start a private direct conversation or a group
thread, open a team room, minimize, expand, and open the full Messages page.
Changing pages does not discard open conversations; switching a conversation or
closing the window retains its existing recoverable draft.

The conversation view reuses the full live messenger: confirmed delivery, retry
identity, recovered drafts, earlier messages, threaded replies, reactions,
response completion/reopening, contextual work links, unread acknowledgement,
participant removal and ownership transfer. The existing full-page and embedded
dashboard messenger keep their layout and navigation. Floating selection must
not overwrite the underlying page's hash or mark hidden conversations as read.
Only one visible conversation is active in the floating window at a time.

People receive an addressable workspace profile and a searchable directory.
Profiles have Overview, Work, Projects, Teams and Activity sections. They show
the person's recorded contact details and workspace role, team memberships and
team roles, open/completed/blocked/overdue work, upcoming deadlines, projects
associated with their work, and recent changes to those accessible work items.
Actions open a private chat, prepare an email in the user's mail app, create
assigned work, open task details, visit team/project pages and copy a profile
link. Existing account and membership management remain available through their
current permission-controlled pages. Activity is explicitly work activity;
there is no invented online presence, biography or private conversation history.

Names and avatars in relevant team, workload, message and people surfaces gain
hover/focus cards. A card can be reached by keyboard or tap, stays open while its
actions are in use, closes on Escape/outside interaction and fits the viewport.
It provides contact, shared teams, role, a full-profile link and communication
actions. Hovering never creates a conversation or sends a message.

## Scope and preservation

- Use existing workspace-scoped directory, conversation, task and project APIs.
  Server authorization remains authoritative. Clear stale details on access
  loss; scope UI state and drafts to the signed-in person and organization.
- Reuse existing direct conversations, and retain a creation idempotency key for
  uncertain responses. Opening a profile or launcher is read-only. Sending,
  creating, assigning and participant management are explicit user actions.
- Lazy-load the floating window and rich profile/card content. Keep the compact
  launcher in the persistent shell; avoid adding message timelines or directory
  queries until opened. Preserve the existing SSE/event bridge and query cache.
- Preserve the demo messenger and all existing routes/actions. Demo surfaces
  continue to identify local demonstration data and do not claim live delivery.
- Keep desktop/light, dark, narrow-screen and keyboard behavior usable. Dialog
  layering must retain composer/context controls, accessible names and unique
  element IDs even when a page and the floating messenger coexist.

## Implementation and verification sequence

1. Add shared navigation/state helpers and the lazy persistent floating host.
2. Compose Threads/People/Teams navigation and conversation tabs around the live
   messenger, including direct-chat reuse, creation and recoverable drafts.
3. Add guarded People/profile routes, detailed sections and real work/contact
   actions; integrate hover cards and directory/profile entry points.
4. Verify sending/retry, tabs, navigation persistence, replies/reactions/context,
   permissions, stale access, profile/task actions, hover/focus, mobile sizing
   and preserved standalone messaging against isolated fixture APIs.
5. Run relevant unit/browser checks, lint/types and production loading budgets.
   Real user messages and emails are not used as test traffic.

## Implementation and validation

Implemented the persistent floating messenger, scoped conversation-tab recovery,
searchable directory, guarded profile routes and actionable person cards. The
messenger uses the browser's top layer so chat started from a card inside an
existing team dialog remains usable. Existing full-page messaging, dashboard
messaging and recoverable drafts remain available. Email actions prepare an
addressed mail-app draft; they do not send automatically.

Validation completed locally:

- Web lint, route generation and TypeScript checks passed.
- All 386 web unit tests passed, including directory/profile scoping, direct
  conversation reuse, tab recovery and protected route coverage.
- All 10 floating-chat/profile workflows passed in Chromium and WebKit. Coverage
  includes sending and retry identity, replies, reactions, context actions,
  direct/group creation, tabs, draft handoff to the full Messages page, access
  loss, hover/keyboard cards and chat opened from inside a team dialog.
- Affected team, communication, sharing and dashboard browser workflows passed
  across targeted runs. The complete 10-test dashboard suite passed after
  reserving space for the floating launcher above its message composer.
- Profile and chat accessibility checks passed in light/dark themes and narrow
  viewports. Browser screenshots use portable test-output paths.
- Next.js and Cloudflare production builds passed, along with their existing
  JavaScript/CSS loading budgets and the public stylesheet budget. Rich chat,
  person cards and dashboard widgets load on demand.

A local preview at `http://127.0.0.1:4178/?view=person` uses isolated sample data
and supports exercising chat and profile interactions without contacting real
users. These checks do not establish production deployment; release status is
tracked separately.

The mobile launcher and its window reserve space above the bottom navigation.
The release regression checks keep every navigation target clickable at narrow
phone widths and retain access to the message composer after opening chats.
