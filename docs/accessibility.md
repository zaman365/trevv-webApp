# Accessibility evidence

TREVV targets WCAG 2.2 AA. The UI uses semantic headings, native buttons/links/tables, screen-reader labels for icon controls, visible focus rings, keyboard-operable status controls, non-color status icons/text, and reduced-motion rules.

CI runs Axe against sign-in, Portfolio, Workspace Overview, Board, item panel, and Decision Center at desktop and mobile breakpoints. Every automated WCAG A/AA violation fails the build. Demo- and live-mode `incomplete` results fail unless they match separate exact, owned, expiring review fingerprints. The live inventory was measured against isolated PostgreSQL state and is additionally bound to the semantic surface and browser engine; it cannot reuse demo selectors. Playwright also exercises the item panel and key navigation paths. These temporary fingerprints remain a GA blocker until the manual measurements below replace them.

## Manual release checklist

- complete sign-in → Portfolio → Workspace → Board → item update using keyboard only
- confirm focus remains visible and moves into/returns from the item panel and Quick Capture
- at 200% zoom, check reflow without hidden actions or two-dimensional page scrolling
- verify table headers and control names with VoiceOver/NVDA
- confirm status, priority, health, and errors remain understandable without color
- enable reduced motion, high contrast, and dark mode
- check mobile bottom navigation, full-screen item treatment, and 44px touch targets

Automated results are necessary but not a substitute for assistive-technology and cognitive walkthroughs. Record manual tester, platform, browser, findings, and fixes in each release ticket.
