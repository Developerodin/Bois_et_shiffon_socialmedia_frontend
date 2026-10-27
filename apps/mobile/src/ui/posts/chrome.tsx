import type { ReactNode } from "react";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { ArrowLeft, ChevronDown, House, LayoutGrid, PanelsTopLeft, Plus, SlidersHorizontal } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { images } from "@/ui/icons";
import { Footer } from "@/ui/layout";
import { color, radius, space, type } from "@/theme/tokens";
import { BUSINESS } from "@/ui/posts/sample";

/** Colours the module chrome uses that aren't in the design-system tokens. */
export const chrome = { headerBg: "#F8F7FB", pageHeaderBg: "#FBFAFD", rule: "#DED9E6", navActive: "#4C40BB", navIdle: "#64646F" } as const;

const A = {
  menu: require("../../../assets/figma/posts/icon-menu.svg"),
  settings: require("../../../assets/figma/posts/icon-settings.svg"),
  reels: require("../../../assets/figma/posts/tab-reels.svg"),
  posts: require("../../../assets/figma/posts/tab-posts-active.svg"),
  photoshoot: require("../../../assets/figma/posts/tab-photoshoot.svg"),
  marketing: require("../../../assets/figma/posts/tab-marketing.svg"),
  todayActive: require("../../../assets/figma/posts/nav-today-active.svg"),
};

/**
 * Page scaffold: optional header, scrolling body, optional sticky footer (shared Footer) and bottom nav.
 * Without a bottom nav the safe area's bottom edge is padded here instead.
 */
export function PostsScreen({
  header,
  nav,
  footer,
  children,
  contentStyle,
  background = color.canvas,
}: {
  header?: ReactNode;
  nav?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  background?: string;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: background }} edges={nav ? ["top"] : ["top", "bottom"]}>
      {header}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.body, contentStyle]} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <Footer>{footer}</Footer> : null}
      {nav}
    </SafeAreaView>
  );
}

const MODULES = [
  { key: "reels", href: "/reels", icon: A.reels },
  { key: "posts", href: "/posts", icon: A.posts },
  { key: "photoshoot", href: "/photoshoot", icon: A.photoshoot },
  { key: "marketing", href: "/marketing", icon: A.marketing },
] as const;

/** "≡ Espanda · 160 · ⚙" bar + Reels · Posts · Photoshoot · Marketing tabs (Figma "Module header"). */
export function ModuleHeader() {
  const { t } = useTranslation("posts");
  return (
    <View style={styles.module}>
      <View style={styles.moduleBar}>
        <HeaderIcon label={t("chrome.openMenu")} onPress={() => router.push("/business/menu")}>
          <Image source={A.menu} style={styles.i20} contentFit="contain" />
        </HeaderIcon>
        <Image source={images.logo} style={{ width: 112, height: 33 }} contentFit="contain" accessibilityLabel={t("chrome.logo")} />
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel={t("chrome.credits", { count: BUSINESS.credits })} onPress={() => router.push("/business/billing")} style={styles.credits}>
          <Text style={[type.label, { textAlign: "center" }]}>{BUSINESS.credits}</Text>
        </Pressable>
        <HeaderIcon label={t("chrome.settings")} onPress={() => router.navigate("/posts/planner")}>
          <Image source={A.settings} style={styles.i20} contentFit="contain" />
        </HeaderIcon>
      </View>
      <View style={styles.tabs} accessibilityRole="tablist" accessibilityLabel={t("chrome.modulesLabel")}>
        {MODULES.map((m) => {
          const on = m.key === "posts";
          return (
            <Pressable
              key={m.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => !on && router.navigate(m.href as Href)}
              style={[styles.tab, on && styles.tabOn]}
            >
              <Image source={m.icon} style={{ width: 24, height: 24 }} contentFit="contain" />
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.tabLabel, on && styles.tabLabelOn]}>{t(`chrome.modules.${m.key}`)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function HeaderIcon({ label, onPress, children }: { label: string; onPress?: () => void; children: ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.headerIcon, pressed && { opacity: 0.6 }]}>
      {children}
    </Pressable>
  );
}

export type NavKey = "today" | "posts" | "create" | "stories" | "settings";

/** Today · Posts · Create · Stories · Settings (Figma "Bottom navigation"). */
export function BottomNav({ active }: { active: NavKey }) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("posts");
  const items: { key: NavKey; href: Href; icon: (c: string, on: boolean) => ReactNode }[] = [
    {
      key: "today",
      href: "/posts",
      icon: (c, on) => (on ? <Image source={A.todayActive} style={styles.i24} contentFit="contain" /> : <House size={24} color={c} strokeWidth={1.75} />),
    },
    { key: "posts", href: "/posts/calendar", icon: (c, on) => <LayoutGrid size={24} color={c} strokeWidth={1.75} fill={on ? c : "none"} /> },
    { key: "create", href: "/posts/brief", icon: (c, on) => <Plus size={24} color={c} strokeWidth={on ? 2.5 : 1.75} /> },
    { key: "stories", href: "/posts/stories", icon: (c, on) => <PanelsTopLeft size={24} color={c} strokeWidth={on ? 2.25 : 1.75} /> },
    { key: "settings", href: "/posts/planner", icon: (c) => <SlidersHorizontal size={24} color={c} strokeWidth={1.75} /> },
  ];
  return (
    <View style={[styles.nav, { paddingBottom: Math.max(12, insets.bottom) }]} accessibilityRole="tablist" accessibilityLabel={t("chrome.navLabel")}>
      {items.map((it) => {
        const on = it.key === active;
        const c = on ? chrome.navActive : chrome.navIdle;
        const label = t(`chrome.nav.${it.key}`);
        return (
          <Pressable
            key={it.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            onPress={() => !on && router.navigate(it.href)}
            style={styles.navItem}
          >
            {it.icon(c, on)}
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.navLabel, { color: c }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** "← Title ····· right" bar used by detail/edit screens (Figma "Header", 64 tall). */
export function PageHeader({ title, right }: { title?: string; right?: ReactNode }) {
  const { t } = useTranslation("posts");
  return (
    <View style={styles.pageHeader}>
      <View style={styles.row8}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("chrome.back")}
          onPress={() => (router.canGoBack() ? router.back() : router.navigate("/posts"))}
          style={({ pressed }) => [styles.headerIcon, pressed && { opacity: 0.6 }]}
        >
          <ArrowLeft size={20} color={color.ink} strokeWidth={1.75} />
        </Pressable>
        {title ? <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]}>{title}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** 44-tall "favicon · Bois & Chiffons ⌄" switcher (Figma "Button · Bois & Chiffons"). */
export function BusinessSwitcher() {
  const { t } = useTranslation("posts");
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t("chrome.switchBusiness", { name: BUSINESS.name })} onPress={() => router.push("/business/menu")} style={({ pressed }) => [styles.switcher, pressed && { opacity: 0.85 }]}>
      <Image source={BUSINESS.favicon} style={{ width: 20, height: 20, borderRadius: 4 }} contentFit="contain" />
      <Text style={type.label}>{BUSINESS.name}</Text>
      <ChevronDown size={16} color={color.ink} strokeWidth={1.75} />
    </Pressable>
  );
}

/** 36-tall business pill in page headers; `dark` is the glass variant on the story editor. */
export function BusinessChip({ dark }: { dark?: boolean }) {
  const { t } = useTranslation("posts");
  return (
    <View style={[styles.chip, dark && styles.glass]} accessibilityLabel={t("chrome.business", { name: BUSINESS.name })}>
      <Image source={BUSINESS.favicon} style={{ width: 16, height: 16, borderRadius: 3 }} contentFit="contain" />
      <Text style={[type.meta, { color: dark ? color.onPrimary : color.ink }]}>{BUSINESS.name}</Text>
    </View>
  );
}

export const glass = { backgroundColor: "rgba(33,29,42,0.94)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" } as const;

const styles = StyleSheet.create({
  body: { paddingHorizontal: space[20], paddingTop: space[24], paddingBottom: space[32] },
  module: { backgroundColor: chrome.headerBg, borderBottomWidth: 1, borderBottomColor: chrome.rule },
  moduleBar: { height: 64, flexDirection: "row", alignItems: "center", gap: space[4], paddingHorizontal: space[16] },
  headerIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.control },
  credits: { width: 48, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#E4E3E9", borderRadius: radius.control },
  tabs: { flexDirection: "row", gap: space[8], paddingTop: 4, paddingHorizontal: space[16], paddingBottom: space[8] },
  tab: { flex: 1, height: 56, gap: 6, padding: 4, alignItems: "center", justifyContent: "center", borderRadius: radius.control, borderWidth: 1, borderColor: "transparent" },
  tabOn: {
    backgroundColor: color.surface,
    borderColor: "#EFEDF3",
    shadowColor: "#101014",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  tabLabel: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 16, color: chrome.navIdle, textAlign: "center" },
  tabLabelOn: { fontFamily: "Inter_600SemiBold", color: "#101014" },
  i20: { width: 20, height: 20 },
  i24: { width: 24, height: 24 },
  nav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space[4],
    paddingTop: space[12],
    paddingHorizontal: space[16],
    backgroundColor: "rgba(250,249,252,0.96)",
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  navItem: { width: 68, height: 56, gap: 6, paddingHorizontal: space[4], alignItems: "center", justifyContent: "center" },
  navLabel: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 16, textAlign: "center" },
  pageHeader: {
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[8],
    paddingVertical: space[8],
    paddingHorizontal: space[16],
    backgroundColor: chrome.pageHeaderBg,
    borderBottomWidth: 1,
    borderBottomColor: chrome.rule,
  },
  row8: { flexDirection: "row", alignItems: "center", gap: space[8] },
  switcher: {
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
  chip: {
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: space[8],
    paddingHorizontal: space[12],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: chrome.rule,
    borderRadius: radius.control,
  },
  glass,
});
