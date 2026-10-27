import type { ReactNode } from "react";
import { ArrowLeft, type LucideIcon } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, radius, space, type } from "@/theme/tokens";
import { ICON } from "@/ui/reels/kit";

/** Recovery-screen colours the token set doesn't define (Figma "07 Recovery"). */
export const rx = {
  page: "#F8F8FA",
  well: "#F8F8FA",
  hairline: "#EBEBF0",
  errorBg: "#FFF1F0",
  errorRing: "#F5C8C4",
  track: "#EEEDF3",
} as const;

/** Back button (bordered 44 square) · centred content · balancing spacer. */
export function RecoveryTopBar({ center, onBack }: { center?: ReactNode; onBack: () => void }) {
  const { t } = useTranslation();
  const { top } = useSafeAreaInsets();
  return (
    <View style={[styles.topBar, { paddingTop: top + space[4] }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={t("back")} onPress={onBack} style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}>
        <ArrowLeft size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
      </Pressable>
      <View style={{ flex: 1, alignItems: "center" }}>{center}</View>
      <View style={{ width: 44 }} />
    </View>
  );
}

/** Red-tinted status disc + title + supporting copy, centred. */
export function ErrorHero({ Icon, size = 64, title, body }: { Icon: LucideIcon; size?: number; title: string; body: string }) {
  return (
    <View style={{ alignItems: "center", paddingHorizontal: space[20] }}>
      <View style={[styles.errorDisc, { width: size, height: size, borderRadius: size / 2 }]}>
        <Icon size={28} color={color.error} strokeWidth={2} />
      </View>
      <Text accessibilityRole="header" style={[type.pageTitle, { textAlign: "center", paddingTop: space[20] }]}>
        {title}
      </Text>
      <Text style={[type.body, styles.lead]}>{body}</Text>
    </View>
  );
}

/** Dimmed stand-in for the screen a sheet was opened from (Storyboard / Schedule). */
export function SheetBackdrop({ title, card, meta }: { title: string; card: string; meta: string }) {
  const { top } = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: rx.page, paddingTop: top, opacity: 0.35 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={styles.ghostBar}>
        <ArrowLeft size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
        <Text style={[type.cardTitle, { flex: 1, textAlign: "center", marginRight: 20 }]}>{title}</Text>
      </View>
      <View style={styles.ghostCard}>
        <Text style={type.cardTitle}>{card}</Text>
        <Text style={[type.meta, { paddingTop: 2 }]}>{meta}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: space[20], paddingBottom: space[8] },
  back: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: rx.hairline,
    backgroundColor: rx.page,
  },
  errorDisc: { alignItems: "center", justifyContent: "center", backgroundColor: rx.errorBg, borderWidth: 1, borderColor: rx.errorRing },
  lead: { color: color.inkSecondary, textAlign: "center", paddingTop: space[12], lineHeight: 21 },
  ghostBar: { height: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: space[24] },
  ghostCard: {
    marginTop: space[12],
    marginHorizontal: space[20],
    padding: space[20],
    borderRadius: radius.card,
    backgroundColor: color.surface,
  },
});
