import { useState } from "react";
import { router } from "expo-router";
import { Check } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatNumber } from "@/i18n";
import { color, font, radius, space, type } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { Footer } from "@/ui/layout";
import { CloseButton } from "@/ui/plans/kit";
import { plans, pricing, type Plan } from "@/ui/plans/sample";
import { BackButton, HeaderTitle, ICON, PageHeader, ReelsScreen, Tag } from "@/ui/reels/kit";

/** L03 · No subscription / Plans. */
export default function Plans() {
  const { t } = useTranslation("plans");
  const [selected, setSelected] = useState<Plan["id"]>("professional");
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/plans/reels"));
  return (
    <ReelsScreen
      bg="#F6F5F9"
      header={<PageHeader left={<BackButton onPress={leave} />} center={<HeaderTitle center>{t("choose.title")}</HeaderTitle>} right={<CloseButton onPress={() => router.replace("/plans/reels")} />} />}
      contentStyle={{ paddingTop: space[16] }}
      footer={
        <Footer>
          {pricing.available ? null : <Text style={[type.body, { color: color.inkSecondary, textAlign: "center" }]}>{t("choose.pricingUnavailable")}</Text>}
          {/* No purchase happens here: with pricing live this only moves to the activation-return screen. */}
          <Button label={t("choose.continue")} disabled={!pricing.available} onPress={() => router.push("/plans/activated")} />
          <View style={styles.links}>
            {/* Restore / Terms / Privacy have no store or legal pages yet. */}
            <LinkText label={t("choose.restorePurchases")} />
            <Text style={styles.dot}>•</Text>
            <LinkText label={t("choose.terms")} />
            <Text style={styles.dot}>•</Text>
            <LinkText label={t("choose.privacy")} />
          </View>
        </Footer>
      }
    >
      <Text style={[type.body, styles.lead]}>{t("choose.lead")}</Text>
      <View accessibilityRole="radiogroup" style={{ gap: space[16], paddingTop: space[24] }}>
        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} selected={p.id === selected} onPress={() => setSelected(p.id)} />
        ))}
      </View>
    </ReelsScreen>
  );
}

function PlanCard({ plan, selected, onPress }: { plan: Plan; selected: boolean; onPress: () => void }) {
  const { t } = useTranslation("plans");
  const name = t(`plans.${plan.id}`);
  const price = t("plans.priceToBeConfirmed");
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={t("choose.planA11y", { name, price })}
      onPress={onPress}
      style={[styles.card, selected && styles.cardOn]}
    >
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[12] }}>
            <Text style={styles.name}>{name}</Text>
            {plan.recommended ? <Tag label={t("plans.recommended")} style={{ backgroundColor: "#E8E7F1", paddingVertical: 4 }} textStyle={{ color: color.ink }} /> : null}
          </View>
          <Text style={[type.body, { color: color.inkSecondary, paddingTop: 4 }]}>{price}</Text>
        </View>
        <View style={[styles.radio, selected && { borderColor: color.primary }]}>{selected ? <View style={styles.radioDot} /> : null}</View>
      </View>
      <View style={styles.rule} />
      <View style={{ gap: space[8] }}>
        {plan.features.map((f) => (
          <View key={f} style={{ flexDirection: "row", alignItems: "center", gap: space[12] }}>
            <Check size={20} color={selected ? color.ink : color.inkSecondary} strokeWidth={ICON.strokeWidth} />
            <Text style={[type.body, { flex: 1 }]}>{t(`plans.features.${f}`, { count: plan.credits, n: formatNumber(plan.credits) })}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

function LinkText({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8} style={{ minHeight: 44, justifyContent: "center" }}>
      <Text style={[type.label, { fontSize: 12, lineHeight: 18 }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lead: { color: color.inkSecondary, textAlign: "center", lineHeight: 21 },
  card: { padding: space[20], borderRadius: radius.card, borderWidth: 1, borderColor: color.controlOutline, backgroundColor: color.surface },
  cardOn: { borderWidth: 2, borderColor: color.primary, backgroundColor: color.selection },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space[12] },
  name: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.2, color: color.ink },
  radio: { width: 22, height: 22, marginTop: 4, borderRadius: 11, borderWidth: 1.5, borderColor: color.controlOutline, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.primary },
  rule: { height: 1, backgroundColor: "#E2E1EB", marginVertical: space[20] },
  links: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[8], flexWrap: "wrap" },
  dot: { ...type.meta, color: color.inkSecondary },
});
