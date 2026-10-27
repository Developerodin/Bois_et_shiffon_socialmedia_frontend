import type { ReactNode } from "react";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { ArrowLeft, ChevronRight, type LucideIcon } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Switch, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { color, font, radius, space, type } from "@/theme/tokens";
import { BackButton, ICON, PageHeader, ReelsScreen, SegmentedTabs, eyebrow, meta } from "@/ui/reels/kit";
import { business, media } from "@/ui/business/sample";

/**
 * Shared pieces of the Business screens (Figma "05 Marketing & Business", M06–M13).
 * The page header, tabs, buttons and panels come from the Reels kit; this file only adds
 * the settings-specific rows, headers and toggles those screens repeat.
 */

/** Colours the Business frames use that the token set doesn't define. */
export const bc = {
  border: "#DED9E6",
  rowRule: "#F0F0F5",
  tile: "#F0EFF4",
  tileSoft: "#F4F4F6",
  dark: "#211D2A",
  black: "#101014",
  track: "#D6D5DD",
  dot: "#D1D5DB",
} as const;

export const label14: TextStyle = { ...type.label, fontFamily: font.regular };
export const strong14: TextStyle = { ...type.label, fontFamily: font.semibold };
export const body12: TextStyle = { ...type.meta, color: color.ink };

/** Back that falls back to My Business when the screen was opened directly. */
export function goBack(fallback: Href = "/business") {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

// ───────────────────────────── Screen & headers ─────────────────────────────

/** Scrolling page on the canvas colour with the soft top glow; 16 gutters unless overridden. */
export function BizScreen({
  header,
  footer,
  children,
  gutter = space[16],
  top = space[24],
}: {
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  gutter?: number;
  top?: number;
}) {
  return (
    <ReelsScreen header={header} footer={footer} bg={color.canvas} contentStyle={{ paddingHorizontal: gutter, paddingTop: top, paddingBottom: space[32] }}>
      {children}
    </ReelsScreen>
  );
}

/** "← Settings · (Bois & Chiffons)": plain back, 17pt title and a text-only workspace pill (M06, M07). */
export function SimpleHeader({ title }: { title: string }) {
  const { t } = useTranslation("business");
  return (
    <PageHeader
      left={
        <View style={[styles.headerLeft, { gap: space[8] }]}>
          <BackButton onPress={() => goBack()} />
          <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
        </View>
      }
      right={
        <View style={styles.namePill} accessibilityLabel={t("kit.workspaceLabel", { name: business.name })}>
          <Text style={[meta, { color: color.ink }]}>{business.name}</Text>
        </View>
      }
    />
  );
}

/** Boxed back button + title over a favicon/workspace subtitle (M08–M12). */
export function BrandHeader({ title, right, fallback }: { title: string; right?: ReactNode; fallback?: Href }) {
  const { t } = useTranslation();
  return (
    <PageHeader
      left={
        <View style={styles.headerLeft}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("back")}
            onPress={() => goBack(fallback)}
            style={({ pressed }) => [styles.boxedBack, pressed && { opacity: 0.6 }]}
          >
            <ArrowLeft size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
          </Pressable>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
            <View style={styles.subRow}>
              <Image source={media.favicon} style={styles.favicon} contentFit="contain" />
              <Text style={meta}>{business.name}</Text>
            </View>
          </View>
        </View>
      }
      right={right}
    />
  );
}

const SETTINGS_TABS = ["myBusiness", "billing", "postsPlanner"] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];
const TAB_HREF: Record<SettingsTab, Href> = { myBusiness: "/business", billing: "/business/billing", postsPlanner: "/posts/planner" };

/** "My Business · Billing · Posts planner" (M06, M11). SegmentedTabs shows its values, so map labels back to ids. */
export function SettingsTabs({ active }: { active: SettingsTab }) {
  const { t } = useTranslation("business");
  const labels = SETTINGS_TABS.map((id) => t(`kit.tabs.${id}`));
  return (
    <SegmentedTabs
      options={labels}
      value={labels[SETTINGS_TABS.indexOf(active)]}
      onChange={(label) => {
        const tab = SETTINGS_TABS[labels.indexOf(label)];
        if (tab === active) return;
        if (tab === "postsPlanner") router.push(TAB_HREF[tab]);
        else router.replace(TAB_HREF[tab]);
      }}
    />
  );
}

// ───────────────────────────── Rows & bits ─────────────────────────────

/** 12/18 semibold section label with an optional right-hand note or link. */
export function SectionHead({ title, aside, onAside, style }: { title: string; aside?: string; onAside?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.sectionHead, style]}>
      <Text style={eyebrow} accessibilityRole="header">
        {title}
      </Text>
      {aside && onAside ? (
        <Pressable accessibilityRole="link" onPress={onAside} hitSlop={12} style={styles.asideLink}>
          <Text style={body12}>{aside}</Text>
        </Pressable>
      ) : aside ? (
        <Text style={meta}>{aside}</Text>
      ) : null}
    </View>
  );
}

/** Icon · title/subtitle · chevron row with a hairline above (all but the first). */
export function NavRow({
  icon: Icon,
  title,
  subtitle,
  onPress,
  first,
  titleStyle,
  style,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  first?: boolean;
  titleStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={onPress}
      style={({ pressed }) => [styles.navRow, !first && styles.rowRule, pressed && { backgroundColor: "rgba(16,16,20,0.03)" }, style]}
    >
      {Icon ? <Icon size={20} color={bc.black} strokeWidth={ICON.strokeWidth} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={[body12, titleStyle]}>{title}</Text>
        {subtitle ? <Text style={meta}>{subtitle}</Text> : null}
      </View>
      <ChevronRight size={16} color={color.disabledInk} strokeWidth={ICON.strokeWidth} />
    </Pressable>
  );
}

/** React Native's Switch in the indigo track the designs use. */
export function Toggle({ value, onValueChange, label }: { value: boolean; onValueChange: (v: boolean) => void; label: string }) {
  return (
    <Switch
      accessibilityLabel={label}
      value={value}
      onValueChange={onValueChange}
      trackColor={{ true: color.primary, false: bc.track }}
      thumbColor={color.surface}
      ios_backgroundColor={bc.track}
      // react-native-web tints the "on" thumb teal unless given activeThumbColor (web-only prop, not in RN's types).
      {...({ activeThumbColor: color.surface } as object)}
    />
  );
}

/** Rounded square holding a channel / settings icon. */
export function IconTile({ icon: Icon, size = 40, tint = bc.black, style }: { icon: LucideIcon; size?: number; tint?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.tile, { width: size, height: size }, style]}>
      <Icon size={20} color={tint} strokeWidth={ICON.strokeWidth} />
    </View>
  );
}

/** 44-tall outlined control ("Manage", "Edit", "Connect"). */
export function SmallButton({ label, onPress, primary, style }: { label: string; onPress?: () => void; primary?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.small, primary && styles.smallPrimary, pressed && { opacity: 0.85 }, style]}
    >
      <Text style={[label14, primary && { color: color.onPrimary }]}>{label}</Text>
    </Pressable>
  );
}

/** Plain text action ("Edit", "Change", "Manage") with a 44pt target. */
export function TextAction({ label, onPress, leading: Lead }: { label: string; onPress?: () => void; leading?: LucideIcon }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.textAction, pressed && { opacity: 0.6 }]}>
      {Lead ? <Lead size={16} color={color.ink} strokeWidth={ICON.strokeWidth} /> : null}
      <Text style={type.label}>{label}</Text>
    </Pressable>
  );
}

/** White 24-radius settings card (#DED9E6 border, faint drop shadow). */
export function SettingsCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  headerLeft: { flexDirection: "row", alignItems: "center", gap: space[12], flexShrink: 1 },
  headerTitle: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.34, color: color.ink },
  namePill: {
    height: 28,
    justifyContent: "center",
    paddingHorizontal: space[12],
    borderRadius: 14,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.divider,
  },
  boxedBack: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.divider,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  subRow: { flexDirection: "row", alignItems: "center", gap: space[8], paddingTop: 2 },
  favicon: { width: 16, height: 16, borderRadius: 3, backgroundColor: bc.black },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[8], paddingHorizontal: 2, paddingBottom: space[12] },
  asideLink: { minHeight: 24, justifyContent: "center" },
  navRow: { minHeight: 61, flexDirection: "row", alignItems: "center", gap: space[12], paddingVertical: space[8], paddingHorizontal: space[4] },
  rowRule: { borderTopWidth: 1, borderTopColor: bc.rowRule },
  tile: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: "rgba(232,231,237,0.6)",
    backgroundColor: "rgba(240,239,244,0.1)",
  },
  small: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space[16],
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.controlOutline,
    backgroundColor: color.surface,
  },
  smallPrimary: { minHeight: 48, backgroundColor: color.primary, borderColor: color.primary },
  textAction: { minHeight: 44, minWidth: 44, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 },
  card: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: bc.border,
    borderRadius: radius.card,
    padding: space[20],
    boxShadow: "0 2px 8px rgba(35,24,47,0.03)",
  },
});
