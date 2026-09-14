# Visual consistency review — September 14, 2026

Reviewed the current local frontend with sample records at 1280px and 390px.
The initial survey covered Dashboard, Portfolio, Sprints, Ideas, My Work,
Teams, People, person/team profiles, Attention, Decisions, Approvals, Waiting,
Messages and the Calendar shell. These checks do not represent a production
deployment or a complete populated-data audit: the local Calendar API was
unavailable. Its wide month grid remains intentionally scrollable within its
own canvas.

## Corrections

- Planning headings keep their bulb icon beside the title in compact and full
  views, retaining whole-card navigation and independent actions.
- People cards keep names beside their avatars. Filter labels sit above their
  fields, and profile panels align within each row.
- Restored the missing strong-border compatibility token used by inputs,
  profile actions and floating cards, including the dark theme.
- My Work completion bars use the shared rounded track and primary color while
  retaining their native progress semantics and actual values.
- Lowered the Team page's general font-reset specificity so shared tabs and
  embedded controls retain their own typography.
- Planning badges, card borders and controls use theme colors instead of
  fixed light colors.

## Validation

Twenty-four existing browser checks passed across compact page headers,
planning layouts, sharing, task filters, People/profile actions, Team sections,
keyboard navigation and accessibility in both themes. Follow-up layout scans
covered eight affected page contexts at both widths in light and dark themes;
no horizontal page overflow or stacked heading icons remained in those scans.
Formatting and whitespace checks passed. Existing actions, data and routes
were preserved. The updated frontend is available in the local preview;
these changes have not been committed or deployed.
