/**
 * Espanda design tokens, from Figma "App · 00 Design system" (node 462:222).
 * One light theme: the design defines no dark variant.
 */
export const color = {
  primary: "#5B50D6",
  ink: "#191620",
  inkSecondary: "#5E596B",
  inkMuted: "#6B6477",
  canvas: "#F6F5F9",
  canvasAlt: "#F5F4F8",
  surface: "#FFFFFF",
  selection: "#EEEAFC",
  controlOutline: "#8E879B",
  divider: "#E8E7ED",
  disabledBg: "#E5E4EA",
  disabledInk: "#64646F",
  error: "#B42318",
  onPrimary: "#FFFFFF",
} as const;

export const space = { 4: 4, 8: 8, 12: 12, 16: 16, 20: 20, 24: 24, 32: 32 } as const;

/** Gutters 20 · section 24 · card padding 20 · primary button 48 · min target 44. */
export const layout = { gutter: 20, section: 24, cardPadding: 20, buttonHeight: 48, minTarget: 44 } as const;

export const radius = { card: 24, control: 16, nested: 12, badge: 8, round: 9999 } as const;

export const font = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
} as const;

/** Page title 24/30 · Feature 20/26 · Card title 16/22 · Body 14/21 · Metadata 12/18. */
export const type = {
  pageTitle: { fontFamily: font.semibold, fontSize: 24, lineHeight: 30, letterSpacing: -0.6, color: color.ink },
  feature: { fontFamily: font.semibold, fontSize: 20, lineHeight: 26, color: color.ink },
  cardTitle: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22, color: color.ink },
  body: { fontFamily: font.regular, fontSize: 14, lineHeight: 21, color: color.ink },
  label: { fontFamily: font.medium, fontSize: 14, lineHeight: 20, color: color.ink },
  meta: { fontFamily: font.regular, fontSize: 12, lineHeight: 18, color: color.inkSecondary },
} as const;
