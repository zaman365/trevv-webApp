# Floating workspace search

The top-bar search and `/` shortcut open a floating panel over the current page.
Typing searches after a short debounce. Category buttons show counts and filter
results within the panel. The input and categories stay visible while results
scroll. Close with Escape, the close button, or a click outside; keyboard focus
returns to the previous control.

Result links open the relevant task, board item, person, team, conversation or
workspace. “Open full search page” carries the query to the existing addressable
search page. Modified clicks on the launcher retain normal link behavior.

Live search uses the existing authorized work search, team directory and paged
conversation APIs. Work items are scoped to the current workspace. People and
team names, email addresses, team purposes, and conversation titles/purposes are
matched from authorized responses. This does not add message-body or external
file-content indexing. Partial source failures remain visible and can be retried;
late responses cannot replace results for a newer query.

Demo search retains its existing work, people, workspaces, updates and resource
categories, suggested searches, messaging links and resource links. Both modes
share the floating layout and retain their full-page search route.

Focused browser coverage: `tests/performance/floating-search.spec.ts`.
