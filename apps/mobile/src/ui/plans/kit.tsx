import type { ReactNode } from "react";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { Camera, Clapperboard, LayoutGrid, Lock, Megaphone, Menu, Settings, X, type LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, font, radius, space, type } from "@/theme/tokens";
import { ICON, meta, rc } from "@/ui/reels/kit";
import { photos as reelsPhotos } from "@/ui/reels/sample";

/**
 * Pieces shared by the "06 No subscription" screens. The module header mirrors the Reels one
 * (src/ui/reels/kit.tsx) but carries a "Plans" pill where the credit count sits, and its tabs
 * stay inside the no-subscription variants of each module.
 */

type ModuleKey = "reels" | "posts" | "photoshoot" | "marketing";
/** Labels: plans.json "header.modules.<key>". */
const MODULES: { key: ModuleKey; Icon: LucideIcon; href: Href }[] = [
  { key: "reels", Icon: Clapperboard, href: "/plans/reels" },
  { key: "posts", Icon: LayoutGrid, href: "/plans/posts" },
  { key: "photoshoot", Icon: Camera, href: "/photoshoot" },
  { key: "marketing", Icon: Megaphone, href: "/plans/marketing" },
];

/** "Module header" with the Plans pill (L01 / L05 / L06). */
export function PlansModuleHeader({ active }: { active: ModuleKey }) {
  const { t } = useTranslation("plans");
  const { top } = useSafeAreaInsets();
  return (
    <View style={[styles.moduleHeader, { paddingTop: top }]}>
      <View style={styles.moduleTop}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("header.openMenu")} onPress={() => router.push("/business/menu")} style={styles.square44}>
          <Menu size={20} color={rc.black} strokeWidth={ICON.strokeWidth} />
        </Pressable>
        <Image source={reelsPhotos.logo} style={{ width: 112, height: 33 }} contentFit="contain" accessibilityLabel="Espanda" />
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel={t("viewPlans")} onPress={() => router.push("/plans")} style={styles.plansPill}>
          <Text style={type.label}>{t("header.plans")}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t("header.billingSettings")} onPress={() => router.push("/plans/billing")} style={styles.square44}>
          <Settings size={20} color={rc.navInk} strokeWidth={ICON.strokeWidth} />
        </Pressable>
      </View>
      <View style={styles.tabList} accessibilityRole="tablist">
        {MODULES.map(({ key, Icon, href }) => {
          const on = key === active;
          const label = t(`header.modules.${key}`);
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

/** 44×44 "×" that leaves the flow. */
export function CloseButton({ onPress, label, style }: { onPress: () => void; label?: string; style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label ?? t("close")} onPress={onPress} style={({ pressed }) => [styles.square44, style, pressed && { opacity: 0.6 }]}>
      <X size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
    </Pressable>
  );
}

/** Small grey "🔒 Locked" / "🔒 Inactive" badge. */
export function LockTag({ label }: { label: string }) {
  return (
    <View style={styles.lockTag}>
      <Lock size={16} color={rc.navInk} strokeWidth={ICON.strokeWidth} />
      <Text style={meta}>{label}</Text>
    </View>
  );
}

/** 28×28 grey disc holding a module icon. */
export function IconDisc({ children, size = 28, style }: { children: ReactNode; size?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  square44: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.control },
  moduleHeader: { backgroundColor: rc.header, borderBottomWidth: 1, borderBottomColor: rc.border },
  moduleTop: { height: 64, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: space[16] },
  plansPill: {
    height: 44,
    minWidth: 48,
    paddingHorizontal: space[4],
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
  lockTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: space[8],
    borderRadius: radius.badge,
    backgroundColor: rc.tagGrey,
  },
  disc: { alignItems: "center", justifyContent: "center", backgroundColor: rc.tagGrey },
});
