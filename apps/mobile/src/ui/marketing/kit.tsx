import type { ReactNode } from "react";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, font, radius, space, type } from "@/theme/tokens";
import { ActionButton, BackButton, HeaderTitle, ICON, PageHeader, Panel, SegmentedTabs, bodyMuted, metaInk, rc } from "@/ui/reels/kit";
import { useCurrentBrand } from "@/ui/use-current-brand";

/**
 * Marketing-specific pieces (Figma "05 Marketing & Business"). Module header, page header,
 * tabs, tags, buttons and panels come from the shared Reels kit.
 */

/** Colours the Marketing frames use that neither the tokens nor the Reels kit define. */
export const mc = {
  tile: "#F0ECFA",
  tileBorder: "#E7E0F6",
  rowDivider: "#F0F0F5",
  iconCircle: "#F4F4F8",
  instagram: "#FAF0F3",
  whatsapp: "#EBF7F0",
  chrome: "#F0EFF4",
  siteBg: "#FCFCFE",
  avatar: "#E5E5EA",
} as const;

export const title16: TextStyle = { ...type.cardTitle, letterSpacing: -0.24 };

/** Back when there is history, otherwise a known parent (deep links land without a stack). */
export function goBack(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

/** Page header: back arrow + left title, optional right slot (M02–M05, M16, M17). */
export function TitleHeader({ title, right, fallback = "/marketing" as Href }: { title: string; right?: ReactNode; fallback?: Href }) {
  return (
    <PageHeader
      left={
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[8], flexShrink: 1 }}>
          <BackButton onPress={() => goBack(fallback)} />
          <HeaderTitle>{title}</HeaderTitle>
        </View>
      }
      right={right}
    />
  );
}

/** Favicon + name without a pill (Customers header right, Publish review header centre). */
export function BrandInline() {
  const { t } = useTranslation("marketing");
  const brand = useCurrentBrand();
  return (
    <View style={styles.brandInline} accessibilityLabel={t("shared.workspace", { name: brand?.name ?? "" })}>
      <Image source={brand?.logoUrl ? { uri: brand.logoUrl } : undefined} style={styles.favicon} contentFit="contain" />
      <Text style={[metaInk, { fontSize: 13 }]}>{brand?.name}</Text>
    </View>
  );
}

/**
 * Transparent header over the page glow: back · white pill · optional right (M14, M15).
 * Render it as the first child of the scroll body so the glow runs behind it, as designed.
 */
export function FloatingHeader({ label, right, fallback }: { label: string; right?: ReactNode; fallback: Href }) {
  const { top } = useSafeAreaInsets();
  const brand = useCurrentBrand();
  return (
    <View style={[styles.floating, { paddingTop: top + space[8] }]}>
      <View style={styles.floatingSide}>
        <BackButton onPress={() => goBack(fallback)} />
      </View>
      <View style={styles.sitePill} accessibilityLabel={label}>
        <Image source={brand?.logoUrl ? { uri: brand.logoUrl } : undefined} style={styles.favicon} contentFit="contain" />
        <Text style={[metaInk, { fontSize: 13 }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={[styles.floatingSide, { justifyContent: "flex-end" }]}>{right}</View>
    </View>
  );
}

const CUSTOMER_TABS = ["inbox", "reviews", "people"] as const;
type CustomerTab = (typeof CUSTOMER_TABS)[number];
const CUSTOMER_HREF: Record<CustomerTab, Href> = {
  inbox: "/marketing/inbox",
  reviews: "/marketing/reviews",
  people: "/marketing/people",
};

/** Inbox · Reviews · People: each tab is its own route, swapped in place. */
export function CustomerTabs({ active }: { active: CustomerTab }) {
  const { t } = useTranslation("marketing");
  // SegmentedTabs shows its options as-is, so it gets translated labels; map the label back to the id.
  const labels = CUSTOMER_TABS.map((id) => t(`shared.customerTabs.${id}`));
  const onChange = (label: string) => {
    const next = CUSTOMER_TABS[labels.indexOf(label)];
    if (next && next !== active) router.replace(CUSTOMER_HREF[next]);
  };
  return <SegmentedTabs options={labels} value={labels[CUSTOMER_TABS.indexOf(active)]} onChange={onChange} />;
}

/** 56 lavender icon tile + centred title, body and a primary action (Customers empty states). */
export function EmptyState({
  Icon,
  title,
  body,
  action,
  footnote,
  iconColor = rc.navActive,
}: {
  Icon: LucideIcon;
  title: string;
  body: string;
  action: { label: string; onPress: () => void; leading?: LucideIcon; trailing?: LucideIcon };
  footnote?: string;
  iconColor?: string;
}) {
  return (
    <Panel style={styles.empty}>
      <View style={styles.emptyTile}>
        <Icon size={24} color={iconColor} strokeWidth={ICON.strokeWidth} />
      </View>
      <Text style={[type.feature, { textAlign: "center", paddingTop: space[16] }]}>{title}</Text>
      <Text style={[bodyMuted, { textAlign: "center", paddingTop: space[8], paddingHorizontal: space[8] }]}>{body}</Text>
      <ActionButton
        label={action.label}
        leading={action.leading}
        trailing={action.trailing}
        onPress={action.onPress}
        style={{ alignSelf: "stretch", marginTop: space[24] }}
      />
      {footnote ? <Text style={[bodyMuted, { textAlign: "center", paddingTop: space[16] }]}>{footnote}</Text> : null}
    </Panel>
  );
}

/** 44-tall text-only button ("Edit reply", "Connect domain", "Set up"…). */
export function TextButton({
  label,
  onPress,
  style,
  labelStyle,
  trailing,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  trailing?: LucideIcon;
}) {
  const Trail = trailing;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.textButton, (pressed || disabled) && { opacity: 0.5 }, style]}
    >
      <Text style={[styles.textButtonLabel, labelStyle]}>{label}</Text>
      {Trail ? <Trail size={16} color={color.ink} strokeWidth={2} /> : null}
    </Pressable>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: 1, backgroundColor: mc.rowDivider }, style]} />;
}

/** Label/value row ("Connected customer channels · 0"). */
export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={metaInk}>{label}</Text>
      <Text style={metaInk}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  favicon: { width: 16, height: 16, borderRadius: 3 },
  brandInline: { flexDirection: "row", alignItems: "center", gap: space[8] },
  floating: { flexDirection: "row", alignItems: "center", paddingBottom: space[8] },
  floatingSide: { flex: 1, flexDirection: "row" },
  sitePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[8],
    minHeight: 34,
    paddingHorizontal: space[12],
    borderRadius: radius.round,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: rc.hairline,
    boxShadow: "0 2px 6px rgba(35,24,47,0.04)",
  },
  empty: { alignItems: "center", paddingHorizontal: space[24], paddingTop: space[24], paddingBottom: space[24] },
  emptyTile: { width: 56, height: 56, borderRadius: radius.control, backgroundColor: mc.tile, alignItems: "center", justifyContent: "center" },
  textButton: { minHeight: 44, minWidth: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  textButtonLabel: { fontFamily: font.semibold, fontSize: 15, lineHeight: 20, color: color.ink },
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 24 },
});
