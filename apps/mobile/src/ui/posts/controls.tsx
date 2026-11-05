import type { ReactNode } from "react";
import { Image } from "expo-image";
import { ChevronRight } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { color, radius, space, type } from "@/theme/tokens";
import { STATUS_KEY, isLockedIn, time24, type Post } from "@/ui/posts/format";

/** Neutral surfaces used inside cards (Figma #FAFAFA / #F5F5F5 / #F0EFF4 fills). */
export const tint = { well: "#FAFAFA", hair: "#F5F5F5", badge: "#F0EFF4", segBg: "#EFECF5", segRule: "#DED9E6" } as const;

/** "Month | List" style segmented control (Figma "Segmented tabs"). */
export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  label,
  style,
  fill,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  style?: StyleProp<ViewStyle>;
  /** Tabs share the width equally (Edit post, Planner); otherwise they hug their labels (Calendar). */
  fill?: boolean;
}) {
  return (
    <View style={[styles.seg, style]} accessibilityRole="tablist" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segTab, fill && { flex: 1 }, on && styles.segOn]}
          >
            <Text style={[styles.segText, on && styles.segTextOn]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small rounded label (status, "Monthly target", "Draft"). */
export function Badge({ children, tone = "plain", dot, style, textStyle }: { children: string; tone?: "plain" | "soft" | "dark" | "white"; dot?: boolean; style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle> }) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.border }, style]}>
      {dot ? <View style={styles.dot} /> : null}
      <Text style={[type.meta, { color: t.ink }, textStyle]}>{children}</Text>
    </View>
  );
}

const TONES = {
  plain: { bg: tint.hair, border: "transparent", ink: color.ink },
  soft: { bg: color.canvasAlt, border: color.divider, ink: color.ink },
  dark: { bg: "#101014", border: "#101014", ink: color.onPrimary },
  white: { bg: color.surface, border: color.divider, ink: color.ink },
} as const;

/** Selectable 44-tall pill (Primary goal, Drafts / Scheduled filters). */
export function Pill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, selected ? styles.pillOn : styles.pillOff, pressed && { opacity: 0.85 }]}
    >
      <Text style={[type.meta, selected ? { color: color.onPrimary, fontFamily: "Inter_600SemiBold" } : { color: color.ink, fontFamily: "Inter_500Medium" }]}>{label}</Text>
    </Pressable>
  );
}

/** Section label inside a card (14/20 semibold ink). */
export function CardTitle({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }, style]}>{children}</Text>;
}

/** Thumbnail + status + title + caption row on the calendar day list (Figma P02). */
export function PostRow({ post, onPress }: { post: Post; onPress: () => void }) {
  const { t } = useTranslation("posts");
  const locked = isLockedIn(post.status);
  const status = t(STATUS_KEY[post.status]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("row.label", { title: post.title, status })}
      onPress={onPress}
      style={({ pressed }) => [styles.postRow, pressed && { opacity: 0.85 }]}
    >
      <Image source={post.image} style={styles.thumb} contentFit="cover" />
      <View style={{ flex: 1 }}>
        <View style={styles.row8}>
          <View style={styles.statusBadge}>
            <Text style={[type.label, { fontFamily: "Inter_600SemiBold", color: color.inkSecondary }]}>{status}</Text>
          </View>
          <Text style={[type.meta, locked && { fontFamily: "Inter_600SemiBold", letterSpacing: 0.18 }]}>
            {locked && post.scheduledFor ? t("row.timeZoned", { time: time24(post.scheduledFor) }) : t("status.draft")}
          </Text>
        </View>
        <Text style={[type.meta, { color: color.ink, paddingTop: 2 }]} numberOfLines={1}>
          {post.title}
        </Text>
        <Text style={type.meta} numberOfLines={1}>
          {post.caption?.split("\n")[0]}
        </Text>
      </View>
      <ChevronRight size={16} color={color.ink} strokeWidth={1.75} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: "row", gap: space[4], padding: space[4], backgroundColor: tint.segBg, borderWidth: 1, borderColor: tint.segRule, borderRadius: radius.control },
  segTab: { height: 44, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderRadius: radius.nested, borderWidth: 1, borderColor: "transparent" },
  segOn: { backgroundColor: color.primary, borderColor: color.primary },
  segText: { fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 18, color: color.inkSecondary, textAlign: "center" },
  segTextOn: { fontFamily: "Inter_600SemiBold", color: color.onPrimary },
  badge: { flexDirection: "row", alignItems: "center", gap: space[8], paddingVertical: 2, paddingHorizontal: space[8], borderRadius: radius.badge, borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#101014" },
  pill: { minHeight: 44, paddingVertical: 10, paddingHorizontal: space[12], alignItems: "center", justifyContent: "center", borderRadius: radius.control, borderWidth: 1 },
  pillOn: { backgroundColor: color.primary, borderColor: color.primary },
  pillOff: { backgroundColor: color.surface, borderColor: color.controlOutline },
  postRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[12],
    padding: space[12],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: tint.hair,
    borderRadius: radius.control,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  thumb: { width: 56, height: 56, borderRadius: radius.control, backgroundColor: tint.hair },
  row8: { flexDirection: "row", alignItems: "center", gap: space[8] },
  statusBadge: { paddingVertical: 2, paddingHorizontal: space[8], backgroundColor: tint.badge, borderWidth: 1, borderColor: color.divider, borderRadius: radius.badge },
});
