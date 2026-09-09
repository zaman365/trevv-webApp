# Stable feedback for background refreshes — September 9, 2026

The earlier Overview fix separated worker-status loading from a failed worker
request. A separate shared refresh path still displayed a warning on any failed
background read, including a single timeout, and removed it as soon as the next
read succeeded. Workspace pages and the navigation shell could display the same
condition twice. Inserting and removing those panels moved the content below them.

The live shell now owns one connection indicator inside the existing header badge,
preserving the visible preview disclosure and workspace height. Dashboard,
boards, Portfolio, My Work and other workspace views use this shared surface;
standalone views retain their own compatible status bar. Connection details and a
manual refresh remain available through the header badge. Expanding details
overlays the page instead of moving the user's work.

When a usable snapshot exists, a short interruption says “Checking for updates…”
without announcing a warning. A continuous interruption lasting ten seconds says
“Updates delayed.” Explicit offline state, an initial failed connection and lost
access are reported immediately. Hidden tabs do not accumulate warning timers;
returning to the tab gives its existing focus refresh time to complete.

This changes feedback, not data or authorization policy. The five-second access
checks, 4.5-second request deadline, fifteen-second freshness threshold, raw error
and stale flags, permission-loss latch and cache restrictions remain intact. Save
failures and version conflicts keep their existing immediate feedback. Connection
details describe failed reads without claiming that a task save failed.

The final header implementation passed all 40 local browser performance/workflow
cases and 330 web unit tests, plus web type checking and linting. Seven connection
cases also passed in Safari. The added browser cases cover
alternating failures and recovery without layout movement, sustained outages with
retry, immediate revocation during the warning grace period, hidden-tab recovery,
initial failure, and connection details at 320 pixels in both themes. Unchanged
polls still produce zero record/workspace commits in the profiling fixture.

The connection component has zero Axe A/AA violations in both themes. Axe 4.11
cannot determine the wrapped popup paragraph's contrast when its lines cover
different underlying elements (`elmPartiallyObscuring`). The test permits only
that specific paragraph finding, then independently requires opaque colors,
contrast of at least 4.5:1 and an unobscured painted text position on every line.
The existing application-wide incomplete-review policy is unchanged.

The full live workflow suite then caught the added status row pushing the second
row of team cards below the viewport. The indicator now shares the existing
header badge instead of adding that row. The same six browser cases exercise
this header mode, with a separate case preserving standalone status and retry.
Invitation assertions also select their specific confirmation message so that
the independent connection announcement cannot make those selectors ambiguous.

All fourteen signed-in scenarios were verified in Chromium and Safari across a
full run and a focused Dashboard recheck. Mobile accessibility setup exposes a
date-filter row if scrolling clipped it behind the sticky header. Dashboard
measurements wait for chart, select-focus and resize scrolling to settle. All
accessibility rules remain enabled, and release CI must pass the complete suite.

At inspection, trevv.de was running commit `5158eb6`. The release containing this
follow-up must be deployed before these changes are available there.
