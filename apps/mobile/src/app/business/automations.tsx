import { router, useFocusEffect } from "expo-router";
import { CircleCheck, Megaphone, ShieldCheck, Unplug } from "lucide-react-native";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { automations as api, connections, type Automations as Saved } from "@/api/endpoints";
import { color, font, radius, space, type } from "@/theme/tokens";
import { BizScreen, BrandHeader, SectionHead, SettingsCard, Toggle, bc, strong14 } from "@/ui/business/kit";

import { ICON, Tag, bodyMuted, meta } from "@/ui/reels/kit";

/** The design's three switches; `key` is the server setting (replies has none yet). */
const ITEMS = [
  { id: "monthly", key: "monthlyPlan" },
  { id: "autopublish", key: "autoPublish" },
  { id: "replies", key: null },
] as const;

/**
 * M10 · Business / Automations: the monthly content plan (the server runs Generate calendar on the 1st, 5 credits)
 * and auto-publish (an approved post with a date is scheduled on the connected account). Review before publishing
 * stays on, so nothing here posts a draft nobody approved. Inbox replies have no backend yet.
 */
export default function Automations() {
  const { t } = useTranslation("business");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [linked, setLinked] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.get().then(setSaved, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
      connections().then((r) => setLinked(r.connections.some((c) => c.status === "ACTIVE")), () => {});
    }, []),
  );
  const toggle = async (key: keyof Saved, value: boolean) => {
    setBusy(key);
    setError(null);
    try {
      setSaved(await api.set({ [key]: value }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

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

      {error ? <Text style={[meta, { color: color.error, paddingBottom: space[8] }]}>{error}</Text> : null}
      {!saved && !error ? <ActivityIndicator color={color.primary} /> : null}
      <View style={{ gap: space[12] }}>
        {ITEMS.map((a) => {
          const active = a.key ? !!saved?.[a.key] : false;
          const title = t(`automations.items.${a.id}.title`);
          // What the switch needs and doesn't have: a backend (replies), or a connected account (auto-publish).
          const note = !a.key ? t("automations.notAvailable") : active ? t(`automations.items.${a.id}.active`) : a.id === "autopublish" && !linked ? t(`automations.items.${a.id}.requires`) : null;
          return (
            <SettingsCard key={a.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={strong14}>{title}</Text>
                  <Text style={[bodyMuted, { paddingTop: space[4] }]}>{t(`automations.items.${a.id}.body`)}</Text>
                </View>
                {a.key && busy === a.key ? (
                  <ActivityIndicator color={color.primary} />
                ) : (
                  <Toggle label={title} value={active} disabled={!a.key || !saved} onValueChange={(v) => a.key && void toggle(a.key, v)} />
                )}
              </View>
              <View style={styles.note}>
                {active ? (
                  <CircleCheck size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
                ) : (
                  <Unplug size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
                )}
                <Text style={[meta, { flex: 1 }]}>{note}</Text>
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
