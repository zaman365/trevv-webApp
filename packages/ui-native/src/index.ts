import { tokens } from "@founderhq/design-tokens";
export const nativeTheme = {
  colors: tokens.color,
  radius: tokens.radius,
  space: (step: number) => step * 4,
} as const;
