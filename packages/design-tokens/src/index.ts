export const tokens = {
  color: {
    ink: "#172033",
    muted: "#687086",
    canvas: "#f5f6fa",
    surface: "#ffffff",
    primary: "#5b5bd6",
    primaryStrong: "#4747bd",
    success: "#1f8a68",
    warning: "#b97818",
    danger: "#c8485a",
    parked: "#72798a",
  },
  radius: { control: 11, card: 17, panel: 20 },
  motion: { fast: 120, normal: 180 },
} as const;

export type DesignTokens = typeof tokens;
