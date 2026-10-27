import { router } from "expo-router";
import { CircleCheck, Megaphone, ShieldCheck, Unplug } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { color, font, radius, space, type } from "@/theme/tokens";
import { BizScreen, BrandHeader, SectionHead, SettingsCard, Toggle, bc, strong14 } from "@/ui/business/kit";
import { automations } from "@/ui/business/sample";
import { ICON, Tag, bodyMuted, meta } from "@/ui/reels/kit";

type AutomationId = (typeof automations)[number]["id"];

/**
 * M10 · Business / Automations. There's no automations backend yet: toggles live in local state.
 * Review-before-publishing is fixed on, so nothing here can publish without approval.
 */
export default function Automations() {
  const { t } = useTranslation("business");
  const [on, setOn] = useState<Record<AutomationId, boolean>>(
    () => Object.fromEntries(automations.map((a) => [a.id, a.on])) as Record<AutomationId, boolean>,
  );

  return (
    <BizScreen top={space[20]} header={<BrandHeader title={t("automations.title")} />}>
      <Text style={type.cardTitle} accessibilityRole="header">
        {t("automations.heading")}
      </Text>
      <Text style={[bodyMuted, { paddingTop: space[4] }]}>{t("automations.intro")}</Text>

      <View style={styles.review} accessibilityLabel={t("automations.reviewLabel")}>
        <View style={{ flex: 1 }}>
          <View style={styles.reviewHead}>
            <ShieldCheck size={20} color={color.onPrimary} strokeWidth={ICON.strokeWidth} />
            <Text style={[strong14, { color: color.onPrimary }]}>{t("automations.reviewTitle")}</Text>
          </View>
          <Text style={[meta, { color: color.onPrimary, paddingTop: 2 }]}>{t("automations.reviewBody")}</Text>
        </View>
        <Text style={[strong14, { color: color.onPrimary }]}>{t("automations.required")}</Text>
      </View>

      <SectionHead title={t("automations.queueTitle")} aside={t("automations.manageConnections")} onAside={() => router.push("/business/connections")} style={{ marginTop: space[24], paddingBottom: space[20] }} />

      <View style={{ gap: space[12] }}>
        {automations.map((a) => {
          const active = on[a.id];
          const title = t(`automations.items.${a.id}.title`);
          return (
            <SettingsCard key={a.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={strong14}>{title}</Text>
                  <Text style={[bodyMuted, { paddingTop: space[4] }]}>{t(`automations.items.${a.id}.body`)}</Text>
                </View>
                <Toggle label={title} value={active} onValueChange={(v) => setOn((s) => ({ ...s, [a.id]: v }))} />
              </View>
              <View style={styles.note}>
                {active ? (
                  <CircleCheck size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
                ) : (
                  <Unplug size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
                )}
                <Text style={meta}>{active ? t(`automations.items.${a.id}.active`) : a.requires ? t(`automations.items.${a.id}.requires`) : null}</Text>
              </View>
            </SettingsCard>
          );
        })}

        <SettingsCard style={[styles.card, styles.soon]}>
          <View style={styles.soonIcon}>
            <Megaphone size={20} color={color.disabledInk} strokeWidth={ICON.strokeWidth} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.soonHead}>
              <Text style={strong14}>{t("automations.adsTitle")}</Text>
              <Tag label={t("automations.comingSoon")} tone="grey" textStyle={{ fontFamily: font.medium }} />
            </View>
            <Text style={[bodyMuted, { paddingTop: space[4] }]}>{t("automations.adsBody")}</Text>
          </View>
        </SettingsCard>
      </View>
    </BizScreen>
  );
}

const styles = StyleSheet.create({
  review: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[12],
    marginTop: space[20],
    paddingVertical: space[12],
    paddingHorizontal: space[16],
    borderRadius: radius.card,
    backgroundColor: bc.dark,
  },
  reviewHead: { flexDirection: "row", alignItems: "center", gap: space[8] },
  card: { borderColor: color.divider, paddingVertical: space[20] },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: space[24] },
  note: { flexDirection: "row", alignItems: "center", gap: space[8], paddingTop: space[12] },
  soon: { flexDirection: "row", alignItems: "center", gap: space[12] },
  soonIcon: { width: 28, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "rgba(240,239,244,0.5)" },
  soonHead: { flexDirection: "row", alignItems: "center", gap: space[8], flexWrap: "wrap" },
});
