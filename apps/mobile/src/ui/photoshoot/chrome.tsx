import type { ReactNode } from "react";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { ArrowLeft, Camera, ChevronDown, Clapperboard, Images, LayoutGrid, Megaphone, Menu, Plus, Settings, type LucideIcon } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { images } from "@/ui/icons";
import { color, font, layout, radius, space, type } from "@/theme/tokens";
import { business } from "./sample";

/** Colours the Photoshoot frames use that the token set doesn't name. */
export const ps = {
  headerBg: "#FBFAFD",
  moduleHeaderBg: "#F8F7FB",
  border: "#DED9E6",
  hairline: "#E8E7ED",
  track: "#EFECF5",
  chip: "#EEEDF7",
  navActive: "#4C40BB",
  navIdle: "#64646F",
  dark: "#211D2A",
  black: "#101014",
  dot: "#797983",
} as const;

export const STROKE = 1.75;

/** `id` is also the label key: chrome.modules.<id>. */
const MODULES: { id: string; href: Href; icon: LucideIcon }[] = [
  { id: "reels", href: "/reels", icon: Clapperboard },
  { id: "posts", href: "/posts", icon: LayoutGrid },
  { id: "photoshoot", href: "/photoshoot", icon: Camera },
  { id: "marketing", href: "/marketing", icon: Megaphone },
];

/** Logo row + Reels · Posts · Photoshoot · Marketing tabs (Figma "Module header"). */
export function ModuleHeader({ credits, active = "photoshoot" }: { credits: number; active?: string }) {
  const { t } = useTranslation("photoshoot");
  return (
    <View style={styles.moduleHeader}>
      <View style={styles.logoRow}>
        <HeaderIcon icon={Menu} label={t("chrome.openMenu")} onPress={() => router.push("/business/menu")} />
        <Image source={images.logo} style={{ width: 112, height: 33 }} contentFit="contain" accessibilityLabel="Espanda" />
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel={t("chrome.creditsAvailable", { count: credits })} onPress={() => router.push("/business/billing")} style={styles.credits}>
          <Text style={[type.label, { textAlign: "center" }]}>{credits}</Text>
        </Pressable>
        <HeaderIcon icon={Settings} label={t("chrome.settings")} onPress={() => router.push("/business")} />
      </View>
      <View style={styles.tabs} accessibilityRole="tablist" accessibilityLabel={t("chrome.appModules")}>
        {MODULES.map((m) => {
          const on = m.id === active;
          const Icon = m.icon;
          const label = t(`chrome.modules.${m.id}`);
          return (
            <Pressable
              key={m.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={label}
              onPress={() => !on && router.navigate(m.href)}
              style={[styles.tab, on && styles.tabOn]}
            >
              <Icon size={24} color={on ? color.primary : ps.navIdle} strokeWidth={STROKE} />
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.tabLabel, on && styles.tabLabelOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Create · Results bar at the bottom of the module (Figma "Bottom navigation"). */
export function BottomNav({ active }: { active: "create" | "results" }) {
  const { t } = useTranslation("photoshoot");
  const items = [
    { key: "create", label: t("chrome.create"), icon: Plus, href: "/photoshoot" },
    { key: "results", label: t("chrome.results"), icon: Images, href: "/photoshoot/results" },
  ] as const;
  return (
    <View style={styles.bottomNav} accessibilityRole="tablist" accessibilityLabel={t("chrome.moduleNavigation")}>
      {items.map((it) => {
        const on = it.key === active;
        const Icon = it.icon;
        return (
          <Pressable
            key={it.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={it.label}
            onPress={() => !on && router.replace(it.href)}
            style={styles.navItem}
          >
            <Icon size={24} color={on ? ps.navActive : ps.navIdle} strokeWidth={on ? 2.5 : STROKE} />
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.navLabel, { color: on ? ps.navActive : ps.navIdle }]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 44×44 ghost icon button used in headers and image overlays. */
export function HeaderIcon({ icon: Icon, label, onPress, tint = color.ink }: { icon: LucideIcon; label: string; onPress?: () => void; tint?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.headerIcon, pressed && { opacity: 0.6 }]}>
      <Icon size={20} color={tint} strokeWidth={STROKE} />
    </Pressable>
  );
}

/** 64-tall sub-page header: leading button, title, optional accessory beside the title, trailing slot. */
export function TopBar({ leading, title, accessory, trailing, gap = space[12] }: { leading: ReactNode; title?: string; accessory?: ReactNode; trailing?: ReactNode; gap?: number }) {
  return (
    <View style={styles.topBar}>
      <View style={[styles.topBarLead, { gap }]}>
        {leading}
        {title ? (
          <Text style={styles.topBarTitle} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        {accessory}
      </View>
      {trailing}
    </View>
  );
}

export function BackButton({ label, icon = ArrowLeft }: { label?: string; icon?: LucideIcon }) {
  const { t } = useTranslation("photoshoot");
  return <HeaderIcon icon={icon} label={label ?? t("chrome.goBack")} onPress={() => (router.canGoBack() ? router.back() : router.replace("/photoshoot"))} />;
}

/** Business favicon chip; with `label` it also names the business. */
export function BrandChip({ label }: { label?: boolean }) {
  return (
    <View accessible accessibilityLabel={business.name} style={[styles.brandChip, label ? styles.brandChipWide : styles.brandChipIcon]}>
      <Image source={business.favicon} style={{ width: 16, height: 16 }} contentFit="contain" />
      {label ? <Text style={[type.meta, { color: color.ink }]}>{business.name}</Text> : null}
    </View>
  );
}

/** "Bois & Chiffons ⌄" business switcher (44 tall, outline). */
export function BusinessSwitch({ chevron = 20 }: { chevron?: number }) {
  const { t } = useTranslation("photoshoot");
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t("chrome.switchBusiness", { name: business.name })} onPress={() => router.push("/business/menu")} style={styles.switch}>
      <Image source={business.favicon} style={{ width: 20, height: 20, borderRadius: 4 }} contentFit="contain" />
      <Text style={type.label}>{business.name}</Text>
      <ChevronDown size={chevron} color={color.ink} strokeWidth={STROKE} />
    </Pressable>
  );
}

type Blob = { x: number; y: number; size: number; color: string; opacity?: number };

/**
 * Soft coloured light behind the page. Figma blurs flat circles by 128px; a radial gradient
 * that fades to transparent gives the same look without a blur pass (same approach as Aura).
 */
export function Glow({ blobs, height = 844 }: { blobs: Blob[]; height?: number }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height={height} viewBox={`0 0 390 ${height}`} preserveAspectRatio="xMidYMin slice">
        <Defs>
          {blobs.map((b, i) => (
            <RadialGradient key={i} id={`psglow${i}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={b.color} stopOpacity={b.opacity ?? 1} />
              <Stop offset="0.45" stopColor={b.color} stopOpacity={(b.opacity ?? 1) * 0.6} />
              <Stop offset="1" stopColor={b.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {blobs.map((b, i) => (
          <Circle key={i} cx={b.x} cy={b.y} r={b.size / 2 + 96} fill={`url(#psglow${i})`} />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  moduleHeader: { backgroundColor: ps.moduleHeaderBg, borderBottomWidth: 1, borderBottomColor: ps.border },
  logoRow: { height: 64, flexDirection: "row", alignItems: "center", gap: space[4], paddingHorizontal: space[16] },
  credits: { width: 48, height: 44, borderWidth: 1, borderColor: "#E4E3E9", borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  tabs: { flexDirection: "row", gap: 7, paddingTop: space[4], paddingHorizontal: space[16], paddingBottom: space[8] },
  tab: { flex: 1, height: 56, alignItems: "center", justifyContent: "center", gap: 6, padding: space[4], borderRadius: radius.control, borderWidth: 1, borderColor: "transparent" },
  tabOn: {
    backgroundColor: color.surface,
    borderColor: "#EFEDF3",
    shadowColor: ps.black,
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  tabLabel: { fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: ps.navIdle, textAlign: "center" },
  tabLabelOn: { fontFamily: font.semibold, color: ps.black },
  bottomNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space[4],
    paddingTop: space[12],
    paddingHorizontal: space[16],
    paddingBottom: space[20],
    backgroundColor: "rgba(255,255,255,0.95)",
    borderTopWidth: 1,
    borderTopColor: ps.hairline,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
  },
  navItem: { flex: 1, height: 56, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: space[8], paddingHorizontal: space[4] },
  navLabel: { fontFamily: font.regular, fontSize: 12, lineHeight: 16, textAlign: "center" },
  headerIcon: { width: layout.minTarget, height: layout.minTarget, alignItems: "center", justifyContent: "center", borderRadius: radius.control },
  topBar: {
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[8],
    paddingVertical: space[8],
    paddingHorizontal: space[16],
    backgroundColor: ps.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: ps.border,
  },
  topBarLead: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  topBarTitle: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.34, color: color.ink, flexShrink: 1 },
  brandChip: { height: 36, flexDirection: "row", alignItems: "center", gap: space[8], backgroundColor: color.surface, borderWidth: 1, borderColor: ps.border },
  brandChipIcon: { paddingHorizontal: space[8], borderRadius: radius.nested },
  brandChipWide: { paddingLeft: space[12], paddingRight: space[12], borderRadius: radius.control },
  switch: {
    alignSelf: "flex-start",
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space[8],
    paddingHorizontal: space[12],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.controlOutline,
    borderRadius: radius.control,
  },
});
