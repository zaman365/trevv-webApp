# Design system

TREVV uses a calm, premium, data-dense visual language distinct from monday.com. Light mode is primary; dark mode shares semantic tokens.

## Foundations

- System-friendly sans typography using Geist/Inter fallbacks
- Neutral canvas, white/raised surfaces, charcoal text, indigo-violet primary
- Semantic success, watch, critical, parked, information, and neutral families
- 4 px base spacing with an 8 px rhythm
- Corner radii: 4 px controls, 6 px cards and page panels, 8 px floating surfaces;
  border-first elevation
- 120–200 ms transitions with reduced-motion fallbacks

### Corners

Use `--fh-radius-control` for inputs, buttons and individual tabs;
`--fh-radius-card` for cards, tab groups and content panels; and
`--fh-radius-overlay` for dialogs, popovers and floating windows.
`--fh-radius-panel` aliases the card radius for existing panel components.
The shared scale applies to public pages, workspace pages and administration,
including mobile layouts and both themes.

The 6 px card radius gives a 300 px card a corner equal to 2% of its width.
Controls use 4 px so nested edges stay proportional. Floating surfaces use
8 px to distinguish their outer boundary without the previous large curves.
Keep border widths and layout dimensions independent of this scale. Whole-card
click targets and hover outlines must use the same radius as their card.
Joined surfaces retain their square interior corners. Circular avatars,
identity artwork, pills, switches and chart geometry keep their intended shapes.

## Interaction principles

The first viewport prioritizes portfolio meaning over generic dashboard chrome. Common fields support one-click editing. Item detail opens beside a board and becomes a full-screen sheet on mobile. There is one dominant action per region, visible keyboard focus, named icon controls, undo for optimistic changes, strong empty/error/permission states, and keyboard alternatives for drag operations.

Status is always conveyed by label/icon as well as color. Layouts target WCAG 2.2 AA and remain useful at desktop, tablet, and mobile widths.
