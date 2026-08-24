# Accessibility evidence

FounderHQ targets WCAG 2.2 AA. The UI uses semantic headings, native buttons/links/tables, screen-reader labels for icon controls, visible focus rings, keyboard-operable status controls, non-color status icons/text, and reduced-motion rules.

CI runs axe against sign-in, Portfolio, Hub Overview, Board, item panel, and Decision Center at desktop and mobile breakpoints. Serious and critical WCAG A/AA violations fail the build. Playwright also exercises the item panel and key navigation paths.

## Manual release checklist

- complete sign-in → Portfolio → Hub → Board → item update using keyboard only
- confirm focus remains visible and moves into/returns from the item panel and Quick Capture
- at 200% zoom, check reflow without hidden actions or two-dimensional page scrolling
- verify table headers and control names with VoiceOver/NVDA
- confirm status, priority, health, and errors remain understandable without color
- enable reduced motion, high contrast, and dark mode
- check mobile bottom navigation, full-screen item treatment, and 44px touch targets

Automated results are necessary but not a substitute for assistive-technology and cognitive walkthroughs. Record manual tester, platform, browser, findings, and fixes in each release ticket.
