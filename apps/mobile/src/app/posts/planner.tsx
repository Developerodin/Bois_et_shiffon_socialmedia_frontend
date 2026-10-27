import { router } from "expo-router";
import { Layers, ShieldCheck, Sofa, Store } from "lucide-react-native";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/ui/button";
import { Card } from "@/ui/layout";
import { formatDate, formatNumber } from "@/i18n";
import { color, radius, space, type } from "@/theme/tokens";
import { BusinessChip, PageHeader, PostsScreen } from "@/ui/posts/chrome";
import { Badge, CardTitle, SegmentedTabs, tint } from "@/ui/posts/controls";

const SECTIONS = ["business", "billing", "planner"] as const;
const CYCLES = ["2026-10", "2026-11"] as const;
const CADENCE = [
  { key: "feedPosts", target: 30, note: "feedNote" },
  { key: "stories", target: 25, note: "storiesNote" },
] as const;
const PILLARS = [
  { Icon: Sofa, key: "catalog", share: 50 },
  { Icon: Layers, key: "craft", share: 30 },
  { Icon: Store, key: "story", share: 20 },
] as const;

const sparkles = require("../../../assets/figma/posts/btn-sparkles-white.svg");

/** P09 · Posts / Planner: monthly cadence and content pillars that seed the calendar. */
export default function Planner() {
  const { t } = useTranslation("posts");
  const [cycle, setCycle] = useState<(typeof CYCLES)[number]>("2026-10");
  const cycles = CYCLES.map((value) => ({ value, label: formatDate(`${value}-01T12:00:00Z`, { month: "long", year: "numeric", timeZone: "UTC" }) }));

  return (
    <PostsScreen
      header={
        <>
          <PageHeader
            title={t("planner.title")}
            right={
              <View style={{ flex: 1, alignItems: "flex-start" }}>
                <BusinessChip />
              </View>
            }
          />
          {/* My Business and Billing live in the Business settings pages, which aren't routed yet. */}
          <SegmentedTabs label={t("planner.sectionsLabel")} options={SECTIONS.map((value) => ({ value, label: t(`planner.sections.${value}`) }))} value="planner" onChange={() => {}} fill />
        </>
      }
      contentStyle={{ paddingHorizontal: space[16], paddingTop: space[12], paddingBottom: space[24] }}
    >
      <Card style={{ padding: space[12] }}>
        <CardTitle>{t("planner.cycle")}</CardTitle>
        <SegmentedTabs label={t("planner.cycle")} options={cycles} value={cycle} onChange={setCycle} fill style={{ marginTop: space[8] }} />
      </Card>

      <Card style={{ marginTop: space[12] }}>
        <View style={styles.between}>
          <CardTitle>{t("planner.cadence")}</CardTitle>
          <Badge>{t("planner.monthlyTarget")}</Badge>
        </View>
        <View style={styles.pair}>
          {CADENCE.map((c) => (
            <View key={c.key} style={styles.well}>
              <Text style={[type.meta, { paddingBottom: 2 }]}>{t(`planner.${c.key}`)}</Text>
              <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]}>{t("planner.perMonth", { n: c.target })}</Text>
              <Text style={type.meta}>{t(`planner.${c.note}`)}</Text>
            </View>
          ))}
        </View>
        <Text style={[type.body, { color: color.inkSecondary, paddingTop: space[8] }]}>{t("planner.cadenceHint")}</Text>
      </Card>

      <Card style={{ marginTop: space[12] }}>
        <CardTitle>{t("planner.pillars")}</CardTitle>
        <View style={{ paddingTop: space[8], gap: space[8] }}>
          {PILLARS.map(({ Icon, key, share }) => {
            const label = t(`planner.pillar.${key}`);
            const pct = formatNumber(share / 100, { style: "percent" });
            return (
              <View key={key} style={styles.pillar} accessibilityLabel={t("planner.pillarLabel", { label, share: pct })}>
                <View style={[styles.between, { gap: space[8], flexShrink: 1 }]}>
                  <Icon size={16} color={color.ink} strokeWidth={1.75} />
                  <Text style={[type.meta, { color: color.ink, flexShrink: 1 }]}>{label}</Text>
                </View>
                <Text style={type.meta}>{pct}</Text>
              </View>
            );
          })}
        </View>
      </Card>

      <Card style={styles.note}>
        <ShieldCheck size={16} color={color.ink} strokeWidth={1.75} style={{ marginTop: 2 }} />
        <Text style={[type.label, { flex: 1 }]}>
          <Trans t={t} ns="posts" i18nKey="planner.reviewNote" components={{ b: <Text style={{ fontFamily: "Inter_600SemiBold" }} /> }} />
        </Text>
      </Card>

      <Button label={t("planner.generate")} icon={sparkles} style={{ marginTop: space[16] }} onPress={() => router.navigate("/posts/calendar")} />
    </PostsScreen>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pair: { flexDirection: "row", gap: space[16], paddingTop: space[8] },
  well: { flex: 1, padding: space[12], backgroundColor: tint.well, borderWidth: 1, borderColor: tint.hair, borderRadius: radius.control },
  pillar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: space[8],
    backgroundColor: tint.well,
    borderWidth: 1,
    borderColor: tint.hair,
    borderRadius: radius.control,
  },
  note: { marginTop: space[12], padding: space[12], flexDirection: "row", gap: space[8] },
});
