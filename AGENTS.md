# Repository working agreement

## Feature-preservation invariant

Existing behavior is part of the product contract. Treat every implemented or
documented feature, function, route, workflow, UI surface, API, data model,
migration, configuration, test, and repository document as intentional unless
the user explicitly says otherwise.

- Never delete, remove, hide, disable, trim, de-scope, or silently replace an
  existing feature or function unless the user explicitly requests that exact
  removal in a plain-language message.
- Requests to fix, refactor, redesign, optimize, simplify, migrate, or implement
  something new do not authorize removal. Improve or compose with the existing
  capability instead.
- Markdown and other documentation are protected product artifacts. Never
  delete, weaken, or rewrite away a documented capability to make the
  documentation match a regression.
- When a new implementation overlaps an existing one, preserve both behavior
  and discoverability. Merge the surfaces, provide a compatibility path, or ask
  the user before choosing between them.
- Before modifying an established area, inspect the current worktree, relevant
  history, routes, call sites, tests, and documentation for capabilities that
  must survive the change.
- Add regression coverage for preserved behavior whenever a route, mode,
  adapter, or UI composition could otherwise bypass it.
- If removal appears technically necessary, stop and ask for explicit approval.
  Name the exact artifacts, behavior, data, and user-visible consequences that
  would be removed.
- Preserve unrelated and in-progress user changes. Never clean up or revert
  work merely because it is outside the current task.

The safe default is additive: restore, repair, extend, integrate, and upgrade.
