import { SKYARC_BRAND } from "@skyarc/shared";

/** SkyArc brand theme — shared with web Tailwind tokens. */
export const colors = {
  background: SKYARC_BRAND.surface,
  card: SKYARC_BRAND.card,
  cardBorder: SKYARC_BRAND.border,
  primary: SKYARC_BRAND.purple,
  primaryPressed: SKYARC_BRAND.purpleDark,
  text: SKYARC_BRAND.text,
  muted: SKYARC_BRAND.textMuted,
  placeholder: "#9CA3AF",
  success: SKYARC_BRAND.success,
  warning: SKYARC_BRAND.warning,
  error: SKYARC_BRAND.danger,
  secondary: SKYARC_BRAND.purpleMuted,
  black: SKYARC_BRAND.black,
  onDark: SKYARC_BRAND.onDark,
  onDarkMuted: SKYARC_BRAND.onDarkMuted,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;

export const brandAssets = {
  logoLight: require("../assets/brand/skyarc-logo-light.png"),
  logoDark: require("../assets/brand/skyarc-logo-dark.png"),
} as const;
