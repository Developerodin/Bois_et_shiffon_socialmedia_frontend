import { type ReactNode, useRef } from "react";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Camera,
  Clapperboard,
  LayoutGrid,
  Lightbulb,
  Megaphone,
  Menu,
  Plus,
  Settings,
  type LucideIcon,
} from "lucide-react-native";
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { formatNumber } from "@/i18n";
import { Glow } from "@/ui/aura";
import { color, font, layout, radius, space, type } from "@/theme/tokens";
import { brand, photos } from "@/ui/reels/sample";
import { useCredits } from "@/ui/use-credits";

/**
 * Shared pieces of the Reels module (Figma "02 Reels"): module header, bottom navigation,
 * page header, chips, tags, segmented tabs and an icon-capable button.
 */

/** Colours the Reels frames use that the token set doesn't define. */
export const rc = {
  page: "#F5F4F8",
  pageAlt: "#F8F8FA",
  header: "#F8F7FB",
  pageHeader: "#FBFAFD",
  bar: "rgba(250,249,252,0.96)",
  border: "#DED9E6",
  hairline: "#F0EFF4",
  navActive: "#4C40BB",
  navInk: "#64646F",
  tag: "#EEEDF7",
  tagGrey: "#F0EFF4",
  dark: "#211D2A",
  black: "#101014",
  softPanel: "#F5F3F9",
  field: "#FBFBFC",
  fieldBorder: "#EAEAEF",
} as const;

export const ICON = { strokeWidth: 1.75 } as const;

/** 12/18 semibold secondary eyebrow ("Scene direction", "Timing"…). */
export const eyebrow: TextStyle = { ...type.meta, fontFamily: font.semibold, letterSpacing: 0.18 };
export const meta: TextStyle = type.meta;
export const metaInk: TextStyle = { ...type.meta, color: color.ink };
export const bodyMuted: TextStyle = { ...type.body, color: color.inkSecondary };
export const strong14: TextStyle = { ...type.label, fontFamily: font.semibold };

// ───────────────────────────── Screen shell ─────────────────────────────

/** Header + scrolling body + optional sticky footer / bottom nav. Headers handle the top inset. */
export function ReelsScreen({
  header,
  footer,
  children,
  bg = rc.page,
  glow = true,
  contentStyle,
  stickToBottom = false,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  bg?: string;
  glow?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Chat: keep the newest message in view as the content grows. */
  stickToBottom?: boolean;
}) {
  const scroll = useRef<ScrollViewInstance>(null);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={["bottom"]}>
      {header}
      {/* Lifts the footer (R04's message box, R11's editor) above the on-screen keyboard. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          {glow ? <Glow height={520} /> : null}
          <ScrollView
            ref={scroll}
            contentContainerStyle={[styles.body, contentStyle]}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={stickToBottom ? () => scroll.current?.scrollToEnd({ animated: true }) : undefined}
          >
            {children}
          </ScrollView>
        </View>
        {footer}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ───────────────────────────── Module header ─────────────────────────────

type ModuleKey = "reels" | "posts" | "photoshoot" | "marketing";
/** Labels are common:nav.<key>. */
const MODULES: { key: ModuleKey; Icon: LucideIcon; href: Href }[] = [
  { key: "reels", Icon: Clapperboard, href: "/reels" },
  { key: "posts", Icon: LayoutGrid, href: "/posts" },
  { key: "photoshoot", Icon: Camera, href: "/photoshoot" },
  { key: "marketing", Icon: Megaphone, href: "/marketing" },
];

/** "Module header · 160 · Reels · Posts · Photoshoot · Marketing" (390×132). */
export function ModuleHeader({ active = "reels" }: { active?: ModuleKey }) {
  const { top } = useSafeAreaInsets();
  const credits = useCredits();
  const { t } = useTranslation();
  return (
    <View style={[styles.moduleHeader, { paddingTop: top }]}>
      <View style={styles.moduleTop}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("module.openMenu")} onPress={() => router.push("/business/menu")} style={styles.square44}>
          <Menu size={20} color={rc.black} strokeWidth={ICON.strokeWidth} />
        </Pressable>
        <Image source={photos.logo} style={{ width: 112, height: 33 }} contentFit="contain" accessibilityLabel="Espanda" />
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel={t("module.credits", { count: credits ?? 0 })} onPress={() => router.push("/business/billing")} style={styles.credits}>
          <Text style={[type.label, { textAlign: "center" }]}>{credits === null ? "–" : formatNumber(credits)}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t("module.settings")} onPress={() => router.push("/business")} style={styles.square44}>
          <Settings size={20} color={rc.navInk} strokeWidth={ICON.strokeWidth} />
        </Pressable>
      </View>
      <View style={styles.tabList} accessibilityRole="tablist">
        {MODULES.map(({ key, Icon, href }) => {
          const on = key === active;
          const label = t(`nav.${key}`);
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={label}
              onPress={() => !on && router.replace(href)}
              style={[styles.tab, on && styles.tabOn]}
            >
              <Icon size={24} color={on ? color.primary : rc.navInk} strokeWidth={ICON.strokeWidth} />
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.tabLabel, on && { fontFamily: font.semibold, color: rc.black }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ───────────────────────────── Bottom navigation ─────────────────────────────

type NavKey = "create" | "ideas" | "results";
/** Labels are common:nav.<key>. */
const NAV: { key: NavKey; Icon: LucideIcon; href: Href }[] = [
  { key: "create", Icon: Plus, href: "/reels" },
  { key: "ideas", Icon: Lightbulb, href: "/reels/ideas" },
  { key: "results", Icon: Clapperboard, href: "/reels/results" },
];

/** "Bottom navigation · Create · Ideas · Results". The active item is filled in the darker indigo. */
export function BottomNav({ active }: { active: NavKey }) {
  const { t } = useTranslation();
  return (
    <View style={styles.nav}>
      {NAV.map(({ key, Icon, href }) => {
        const on = key === active;
        const label = t(`nav.${key}`);
        const ink = on ? rc.navActive : rc.navInk;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            onPress={() => !on && router.replace(href)}
            style={styles.navItem}
          >
            <Icon
              size={24}
              color={ink}
              strokeWidth={on && key === "create" ? 3 : ICON.strokeWidth}
              fill={on && key !== "create" ? ink : "none"}
            />
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.navLabel, { color: ink }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ───────────────────────────── Page header ─────────────────────────────

/** 64-tall page bar with a hairline (Figma "Header"): left · centre · right slots. */
export function PageHeader({ left, center, right }: { left?: ReactNode; center?: ReactNode; right?: ReactNode }) {
  const { top } = useSafeAreaInsets();
  return (
    <View style={[styles.pageHeader, { paddingTop: top + space[8] }]}>
      <View style={styles.headerSide}>{left}</View>
      {center ? <View style={styles.headerCenter}>{center}</View> : null}
      <View style={[styles.headerSide, { justifyContent: "flex-end" }]}>{right}</View>
    </View>
  );
}

export function BackButton({ label, onPress }: { label?: string; onPress?: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? t("back")}
      onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace("/reels")))}
      style={({ pressed }) => [styles.square44, pressed && { opacity: 0.6 }]}
    >
      <ArrowLeft size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
    </Pressable>
  );
}

export function HeaderTitle({ children, subtitle, center }: { children: string; subtitle?: string; center?: boolean }) {
  return (
    <View style={{ alignItems: center ? "center" : "flex-start", flexShrink: 1 }}>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {children}
      </Text>
      {subtitle ? <Text style={meta}>{subtitle}</Text> : null}
    </View>
  );
}

/** Back arrow + left-aligned title, as on Publish / Choose a presenter / Script & voice. */
export function BackTitle({ title }: { title: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[8], flexShrink: 1 }}>
      <BackButton />
      <HeaderTitle>{title}</HeaderTitle>
    </View>
  );
}

/** "Bois & Chiffons" workspace pill (favicon + name). */
export function BrandPill({ tone = "grey" }: { tone?: "grey" | "white" }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.brandPill, tone === "white" && styles.brandPillWhite]} accessibilityLabel={t("module.workspace", { name: brand.name })}>
      <Image source={photos.bcFavicon} style={{ width: 16, height: 16, borderRadius: 3 }} contentFit="contain" />
      <Text style={metaInk}>{brand.name}</Text>
    </View>
  );
}

// ───────────────────────────── Chips, tags, tabs ─────────────────────────────

/** Filter / option pill: 44 tall, 16 radius; selected = indigo fill. */
export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && { opacity: 0.85 }]}
    >
      {icon}
      <Text style={[metaInk, selected ? { color: color.onPrimary, fontFamily: font.semibold } : { fontFamily: font.medium }]}>{label}</Text>
    </Pressable>
  );
}

/** Horizontally scrolling chip row that bleeds to the screen edges. */
export function ChipRow({ children, bleed = 20, style }: { children: ReactNode; bleed?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[{ marginHorizontal: -bleed }, style]}
      contentContainerStyle={{ gap: space[8], paddingHorizontal: bleed }}
    >
      {children}
    </ScrollView>
  );
}

type TagTone = "soft" | "muted" | "grey" | "dark" | "white";
/** Small 8-radius label ("20 seconds", "Wide shot", "20s"…). */
export function Tag({ label, tone = "muted", style, textStyle }: { label: string; tone?: TagTone; style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle> }) {
  return (
    <View style={[styles.tag, tagTone[tone], style]}>
      <Text style={[meta, (tone === "soft" || tone === "white") && { color: color.ink }, tone === "dark" && { color: color.onPrimary }, textStyle]}>
        {label}
      </Text>
    </View>
  );
}

const tagTone = StyleSheet.create({
  soft: { backgroundColor: rc.page, borderWidth: 1, borderColor: color.divider, paddingVertical: 4, paddingHorizontal: space[12] },
  muted: { backgroundColor: rc.tag },
  grey: { backgroundColor: rc.tagGrey, borderWidth: 1, borderColor: color.divider },
  dark: { backgroundColor: rc.dark },
  white: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.divider, paddingHorizontal: space[12] },
});

/** "Segmented tabs" (e.g. Publish now · Schedule). Options are shown as-is unless getLabel maps them (e.g. a key → t(key)). */
export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  getLabel,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  getLabel?: (option: T) => string;
}) {
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable
            key={o}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o)}
            style={[styles.segmentTab, on && styles.chipOn]}
          >
            <Text style={[meta, on ? { color: color.onPrimary, fontFamily: font.semibold } : { fontFamily: font.medium }]}>{getLabel ? getLabel(o) : o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ───────────────────────────── Buttons & surfaces ─────────────────────────────

/**
 * Button with Lucide icons on either side. The shared Button only takes image sources,
 * so this mirrors its variants (primary / outline / ghost / disabled) for vector icons.
 */
export function ActionButton({
  label,
  onPress,
  variant = "primary",
  disabled,
  leading,
  trailing,
  height = layout.buttonHeight,
  style,
  labelStyle,
  accessibilityLabel,
}: {
  label: ReactNode;
  onPress?: () => void;
  variant?: "primary" | "outline" | "ghost";
  disabled?: boolean;
  leading?: LucideIcon;
  trailing?: LucideIcon;
  height?: number;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}) {
  const ink = disabled ? color.disabledInk : variant === "primary" ? color.onPrimary : color.ink;
  const Lead = leading;
  const Trail = trailing;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (typeof label === "string" ? label : undefined)}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        { minHeight: height },
        disabled ? { backgroundColor: color.disabledBg } : actionVariant[variant],
        pressed && !disabled && { opacity: 0.85 },
        style,
      ]}
    >
      {Lead ? <Lead size={20} color={ink} strokeWidth={ICON.strokeWidth} /> : null}
      {typeof label === "string" ? (
        <Text style={[type.label, { color: ink }, labelStyle]} numberOfLines={1}>
          {label}
        </Text>
      ) : (
        label
      )}
      {Trail ? <Trail size={20} color={ink} strokeWidth={ICON.strokeWidth} /> : null}
    </Pressable>
  );
}

const actionVariant = StyleSheet.create({
  primary: { backgroundColor: color.primary },
  outline: { backgroundColor: color.surface, borderColor: color.controlOutline },
  ghost: { backgroundColor: "transparent", paddingHorizontal: 0 },
});

/** White 24-radius card used across Reels (border #DED9E6). */
export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space[20], paddingTop: space[24], paddingBottom: space[32] },
  square44: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.control },
  moduleHeader: { backgroundColor: rc.header, borderBottomWidth: 1, borderBottomColor: rc.border },
  moduleTop: { height: 64, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: space[16] },
  credits: {
    width: 48,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E4E3E9",
    borderRadius: radius.control,
  },
  tabList: { flexDirection: "row", gap: 7, paddingTop: 4, paddingHorizontal: space[16], paddingBottom: space[8] },
  tab: {
    flex: 1,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 4,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabOn: { backgroundColor: color.surface, borderColor: "#EFEDF3", boxShadow: "0 2px 5px rgba(16,16,20,0.05)" },
  tabLabel: { fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: rc.navInk, textAlign: "center" },
  nav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 4,
    paddingTop: space[12],
    paddingHorizontal: space[16],
    paddingBottom: space[12],
    backgroundColor: rc.bar,
    borderTopWidth: 1,
    borderTopColor: "rgba(232,231,237,0.7)",
    boxShadow: "0 -4px 20px rgba(0,0,0,0.03)",
  },
  navItem: { flex: 1, height: 56, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: space[8], paddingHorizontal: 4 },
  navLabel: { fontFamily: font.regular, fontSize: 12, lineHeight: 16, textAlign: "center" },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[8],
    minHeight: 64,
    paddingBottom: space[8],
    paddingHorizontal: space[16],
    backgroundColor: rc.pageHeader,
    borderBottomWidth: 1,
    borderBottomColor: rc.border,
  },
  headerSide: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.34, color: color.ink },
  brandPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[8],
    paddingVertical: 4,
    paddingHorizontal: space[12],
    borderRadius: radius.control,
    backgroundColor: rc.tagGrey,
    borderWidth: 1,
    borderColor: "#E4E4EB",
  },
  brandPillWhite: { backgroundColor: color.surface, borderColor: rc.border, minHeight: 36 },
  chip: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[8],
    paddingVertical: 10,
    paddingHorizontal: space[12],
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.controlOutline,
    backgroundColor: color.surface,
  },
  chipOn: { backgroundColor: color.primary, borderColor: color.primary },
  tag: { alignSelf: "flex-start", paddingVertical: 2, paddingHorizontal: space[8], borderRadius: radius.badge },
  segment: {
    flexDirection: "row",
    gap: space[16],
    padding: 4,
    borderRadius: radius.control,
    backgroundColor: "#EFECF5",
    borderWidth: 1,
    borderColor: rc.border,
  },
  segmentTab: {
    flex: 1,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: radius.nested,
    borderWidth: 1,
    borderColor: "transparent",
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[8],
    paddingHorizontal: space[16],
    minWidth: layout.minTarget,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: "transparent",
  },
  panel: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: rc.border,
    borderRadius: radius.card,
    padding: space[20],
    boxShadow: "0 2px 8px rgba(35,24,47,0.02)",
  },
});
