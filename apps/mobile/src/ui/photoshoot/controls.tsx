import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Footer } from "@/ui/layout";
import { color, font, layout, radius, space, type } from "@/theme/tokens";
import { ps, STROKE } from "./chrome";

/**
 * Page frame for the Photoshoot screens: fixed header, scrolling body, then either the shared
 * Footer (sticky CTA) or a bottom bar such as BottomNav. `background` sits behind everything.
 */
export function Page({
  header,
  footer,
  bottom,
  background,
  children,
  contentStyle,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  bottom?: ReactNode;
  background?: ReactNode;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView style={styles.page} edges={["top", "bottom"]}>
      {background}
      {header}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.body, contentStyle]} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? (
        <Footer>
          {/* Footer pads 24; the Photoshoot frames use the 20 gutter. */}
          <View style={{ marginHorizontal: -4, gap: space[12] }}>{footer}</View>
        </Footer>
      ) : null}
      {bottom}
    </SafeAreaView>
  );
}

/** Field caption above a control: 12/18, with an optional right-aligned note. */
export function SectionLabel({ children, note, ink }: { children: string; note?: string; ink?: boolean }) {
  return (
    <View style={styles.sectionLabel}>
      <Text style={[type.meta, ink && { color: color.ink }]}>{children}</Text>
      {note ? <Text style={type.meta}>{note}</Text> : null}
    </View>
  );
}

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** Small text before the label, e.g. "4:5". */
  prefix?: string;
  /** Count after the label, e.g. "(6)". */
  count?: number;
};

/**
 * Segmented control on the #EFECF5 track (Figma "Segmented tabs" and the ratio/scene pickers).
 * `tone="ink"`: unselected labels in ink, 16-radius thumbs (F02). `tone="muted"`: secondary ink, 12-radius (F03/F04).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  tone = "muted",
  gap = space[4],
  boldSelected = true,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  tone?: "ink" | "muted";
  gap?: number;
  boldSelected?: boolean;
}) {
  const { t } = useTranslation("photoshoot");
  const idle = tone === "ink" ? color.ink : color.inkSecondary;
  return (
    <View style={[styles.track, { gap }]} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        const ink = on ? color.onPrimary : idle;
        const Icon = o.icon;
        const weight = on && boldSelected ? font.semibold : tone === "ink" ? font.medium : o.prefix || o.count !== undefined ? font.regular : font.medium;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={[o.prefix, o.count !== undefined ? t("controls.optionWithCount", { label: o.label, count: o.count }) : o.label].filter(Boolean).join(" ")}
            onPress={() => onChange(o.value)}
            style={[styles.segment, { borderRadius: tone === "ink" ? radius.control : radius.nested }, on && styles.segmentOn]}
          >
            {Icon ? <Icon size={20} color={ink} strokeWidth={STROKE} /> : null}
            {o.prefix ? <Text style={[styles.segmentPrefix, { color: ink }]}>{o.prefix}</Text> : null}
            <Text
              numberOfLines={1}
              style={[
                styles.segmentText,
                { color: ink, fontFamily: weight },
                // F03 output format: the selected label steps up to 14/20.
                on && o.prefix ? { fontSize: 14, lineHeight: 20 } : null,
              ]}
            >
              {o.label}
            </Text>
            {o.count !== undefined ? <Text style={[styles.segmentText, { color: ink }]}>{`(${o.count})`}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Horizontal filter pills (F04 categories, F06 All/Product/Fashion). */
export function FilterChips<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space[20] }} contentContainerStyle={styles.chips} accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[type.meta, { fontFamily: on ? font.semibold : font.medium, color: on ? color.onPrimary : color.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Small rounded label: 12/18 secondary on a tinted fill (Preview, Natural studio, tags…). */
export function Badge({ children, tone = "chip", dot, style }: { children: string; tone?: "chip" | "outline"; dot?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.badge, tone === "outline" ? styles.badgeOutline : { backgroundColor: ps.chip }, style]}>
      {dot ? <View style={styles.badgeDot} /> : null}
      <Text style={[type.meta, dot && { color: color.ink }]}>{children}</Text>
    </View>
  );
}

/** Translucent white pill on top of a photo ("Catalog item", "Source image", "Sample preview"). */
export function PhotoPill({ children, dot, muted, style }: { children: string; dot?: string; muted?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.photoPill, dot ? styles.photoPillDot : null, style]}>
      {dot ? <View style={[styles.pillDot, { backgroundColor: dot }]} /> : null}
      <Text style={[type.meta, !muted && { color: color.ink }]}>{children}</Text>
    </View>
  );
}

/**
 * Button with a Lucide icon before or after the label. The shared Button only takes an
 * image-source leading icon and a fixed arrow; these frames need sparkles/plus/download/sparkle.
 */
export function IconLabelButton({
  label,
  icon: Icon,
  trailing,
  variant = "primary",
  onPress,
  style,
  height = layout.buttonHeight,
  bold,
}: {
  label: string;
  icon: LucideIcon;
  trailing?: boolean;
  variant?: "primary" | "outline" | "dark";
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  height?: number;
  bold?: boolean;
}) {
  const ink = variant === "outline" ? color.ink : color.onPrimary;
  const icon = <Icon size={20} color={ink} strokeWidth={STROKE} />;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, { minHeight: height }, styles[variant], pressed && { opacity: 0.85 }, style]}
    >
      {trailing ? null : icon}
      <Text style={[type.label, { color: ink }, bold && { fontFamily: font.semibold }]} numberOfLines={1}>
        {label}
      </Text>
      {trailing ? icon : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.canvasAlt },
  body: { paddingHorizontal: space[20], paddingTop: space[24], paddingBottom: space[32] },
  sectionLabel: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 2, paddingBottom: space[8], minHeight: 29 },
  track: {
    flexDirection: "row",
    padding: space[4],
    backgroundColor: ps.track,
    borderWidth: 1,
    borderColor: ps.border,
    borderRadius: radius.control,
  },
  segment: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[8], paddingHorizontal: space[4], borderWidth: 1, borderColor: "transparent" },
  segmentOn: { backgroundColor: color.primary, borderColor: color.primary },
  segmentText: { fontFamily: font.medium, fontSize: 12, lineHeight: 18, textAlign: "center", flexShrink: 1 },
  segmentPrefix: { fontFamily: font.regular, fontSize: 12, lineHeight: 18, paddingHorizontal: space[4] },
  chips: { flexDirection: "row", gap: space[8], paddingHorizontal: space[20], paddingTop: 18, paddingBottom: space[4] },
  chip: { minHeight: 44, paddingHorizontal: space[12], alignItems: "center", justifyContent: "center", borderRadius: radius.control, borderWidth: 1, borderColor: color.controlOutline, backgroundColor: color.surface },
  chipOn: { backgroundColor: color.primary, borderColor: color.primary },
  badge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: space[4], paddingVertical: 2, paddingHorizontal: space[8], borderRadius: radius.badge },
  badgeOutline: { backgroundColor: color.canvasAlt, borderWidth: 1, borderColor: ps.hairline },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ps.dot, opacity: 0.5 },
  photoPill: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: space[4],
    paddingVertical: 2,
    paddingHorizontal: space[8],
    borderRadius: radius.round,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: ps.hairline,
  },
  photoPillDot: { paddingVertical: space[4], paddingHorizontal: space[12], gap: space[8], shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[8], paddingHorizontal: space[16], borderRadius: radius.control, borderWidth: 1, borderColor: "transparent" },
  primary: { backgroundColor: color.primary },
  outline: { backgroundColor: color.surface, borderColor: color.controlOutline },
  dark: { backgroundColor: ps.dark, borderColor: "rgba(255,255,255,0.25)" },
});
