import type { ReactNode } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconButton } from "@/ui/button";
import { icons } from "@/ui/icons";
import { color, radius, space, type } from "@/theme/tokens";

/** Full-height screen on the canvas colour, with an optional sticky footer (the Continue bar). */
export function Screen({ children, footer, header, scroll = true }: { children: ReactNode; footer?: ReactNode; header?: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      {header}
      {/* Lifts the sticky footer (Continue / Verify) above the on-screen keyboard. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {scroll ? (
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.body, { flex: 1 }]}>{children}</View>
        )}
        {footer ? <Footer>{footer}</Footer> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Bottom action area: fades from the page into a solid strip (Figma 408:411). */
export function Footer({ children }: { children: ReactNode }) {
  return (
    <LinearGradient colors={["rgba(250,249,248,0)", "rgba(250,249,248,0.95)", "#FAF9F8"]} style={styles.footer}>
      <View style={{ gap: space[12] }}>{children}</View>
    </LinearGradient>
  );
}

/** "← · Step 2 of 5 · " bar with a hairline under it (Figma 408:346). */
export function StepHeader({ step, total = 5, onBack, right, center, pill }: { step?: number; total?: number; onBack?: () => void; right?: ReactNode; center?: ReactNode; pill?: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={styles.stepHeader}>
      <View style={{ width: 40, marginLeft: -8 }}>
        <IconButton icon={icons.back} label={t("back")} onPress={onBack ?? (() => router.canGoBack() && router.back())} />
      </View>
      {center ??
        (step ? (
          <View style={pill ? styles.stepPill : undefined}>
            <Text style={styles.stepLabel}>{t("step", { step, total })}</Text>
          </View>
        ) : (
          <View />
        ))}
      <View style={{ width: 40, alignItems: "flex-end" }}>{right}</View>
    </View>
  );
}

/** Page title + supporting paragraph (24/30 + 14/21 secondary). */
export function Title({ title, subtitle, style }: { title: string; subtitle?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ paddingBottom: space[24] }, style]}>
      <Text style={type.pageTitle}>{title}</Text>
      {subtitle ? <Text style={[type.body, { color: color.inkSecondary, paddingTop: space[8] }]}>{subtitle}</Text> : null}
    </View>
  );
}

/** White card, 24 radius, divider border (Figma 408:373). */
export function Card({ children, style, selected }: { children: ReactNode; style?: StyleProp<ViewStyle>; selected?: boolean }) {
  return <View style={[styles.card, selected && styles.cardSelected, style]}>{children}</View>;
}

/** Small uppercase-ish field label (12/18 semibold secondary). */
export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  body: { paddingHorizontal: space[24], paddingTop: space[16], paddingBottom: space[8] },
  footer: { paddingHorizontal: space[24], paddingTop: space[12], paddingBottom: space[16] },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space[20],
    paddingTop: space[8],
    paddingBottom: space[8],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  stepPill: { paddingVertical: space[4], paddingHorizontal: space[12], backgroundColor: color.surface, borderWidth: 1, borderColor: color.divider, borderRadius: radius.control },
  stepLabel: { ...type.meta, fontFamily: "Inter_600SemiBold", letterSpacing: 0.18 },
  card: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: "#DED9E6",
    borderRadius: radius.card,
    padding: space[20],
  },
  cardSelected: { borderColor: color.primary, borderWidth: 2, backgroundColor: color.selection },
  label: { ...type.meta, fontFamily: "Inter_600SemiBold", letterSpacing: 0.18, paddingBottom: space[8] },
});
