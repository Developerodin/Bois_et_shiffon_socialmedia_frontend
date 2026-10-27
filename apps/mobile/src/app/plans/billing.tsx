import { useState } from "react";
import { router } from "expo-router";
import { ArrowRight, ChevronRight, Sparkles } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatNumber } from "@/i18n";
import { color, font, radius, space, type } from "@/theme/tokens";
import { billing } from "@/ui/plans/sample";
import { Segmented } from "@/ui/segmented";
import { ActionButton, BackButton, BrandPill, ICON, Panel, ReelsScreen, SegmentedTabs, Tag, eyebrow, rc } from "@/ui/reels/kit";

/** Tab ids are plans.json "billing.tabs.<id>". */
const TABS = ["business", "billing", "postsPlanner"] as const;
const LANGS = ["English US", "French FR"] as const;
const LANG_KEYS = { "English US": "billing.languages.englishUS", "French FR": "billing.languages.frenchFR" } as const;

/** L07 · No subscription / Billing (Settings · Billing tab). */
export default function Billing() {
  const { t } = useTranslation("plans");
  const [lang, setLang] = useState<(typeof LANGS)[number]>("English US");
  const [push, setPush] = useState(true);
  const { top } = useSafeAreaInsets();
  // SegmentedTabs shows its option values, so it gets the translated labels and we map back to the id.
  const tabLabels = TABS.map((id) => t(`billing.tabs.${id}`));
  const onTab = (label: string) => {
    const id = TABS[tabLabels.indexOf(label)];
    if (id === "postsPlanner") router.push("/posts/planner");
    if (id === "business") router.push("/business");
  };
  return (
    <ReelsScreen
      contentStyle={{ paddingTop: space[16] }}
      header={
        <View style={[styles.header, { paddingTop: top + space[8] }]}>
          <View style={styles.headerRow}>
            <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/plans/reels"))} />
            <Text accessibilityRole="header" style={[styles.title, { flex: 1, textAlign: "center" }]}>
              {t("billing.title")}
            </Text>
            <BrandPill tone="white" />
          </View>
          <SegmentedTabs options={tabLabels} value={t("billing.tabs.billing")} onChange={onTab} />
        </View>
      }
    >
      <Panel>
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Tag label={t("billing.status")} tone="grey" style={{ paddingVertical: 4, borderWidth: 0, backgroundColor: "#E8E7F1" }} />
            <Text style={[type.cardTitle, { fontSize: 16, paddingTop: space[16] }]}>{t("billing.plan")}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={eyebrow}>{t("billing.balance")}</Text>
            <Text style={[type.cardTitle, { fontSize: 16 }]}>{t("credits", { count: billing.balance, n: formatNumber(billing.balance) })}</Text>
          </View>
        </View>
        <Text style={[type.body, { color: color.inkSecondary, paddingTop: space[16] }]}>{t("billing.note")}</Text>
        <ActionButton label={t("viewPlans")} trailing={ArrowRight} onPress={() => router.push("/plans")} style={{ marginTop: space[20] }} />
      </Panel>

      <Panel style={{ marginTop: space[24] }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={type.cardTitle}>{t("billing.recentUsage")}</Text>
          <Text style={type.meta}>{t("billing.creditActivity")}</Text>
        </View>
        <View style={styles.empty}>
          <Sparkles size={24} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
          <Text style={[type.body, { color: color.inkSecondary, textAlign: "center" }]}>{t("billing.empty")}</Text>
        </View>
      </Panel>

      <Panel style={styles.list}>
        {/* No store connection yet: restore has nothing to query, so the row stays inert. */}
        <Row label={t("billing.restore")} chevron />
        <View style={[styles.item, styles.rule]}>
          <Text style={[type.body, { flex: 1, fontSize: 13, lineHeight: 18 }]}>{t("billing.appLanguage")}</Text>
          <View style={{ width: 188 }}>
            <Segmented label={t("billing.appLanguage")} options={LANGS.map((l) => ({ value: l, label: t(LANG_KEYS[l]) }))} value={lang} onChange={setLang} />
          </View>
        </View>
        <View style={[styles.item, styles.rule]}>
          <View style={{ flex: 1 }}>
            <Text style={type.body}>{t("billing.push")}</Text>
            <Text style={type.meta}>{t("billing.pushHint")}</Text>
          </View>
          <Switch
            accessibilityLabel={t("billing.push")}
            value={push}
            onValueChange={setPush}
            trackColor={{ true: color.primary, false: "#E5E4EA" }}
            thumbColor={color.surface}
            // react-native-web paints the "on" thumb teal unless told otherwise.
            {...({ activeThumbColor: color.surface } as object)}
          />
        </View>
        <Row label={t("billing.terms")} chevron rule />
        <Row label={t("billing.privacy")} chevron rule />
      </Panel>
    </ReelsScreen>
  );
}

function Row({ label, chevron, rule }: { label: string; chevron?: boolean; rule?: boolean }) {
  return (
    <Pressable accessibilityRole="button" style={[styles.item, rule && styles.rule]}>
      <Text style={[type.label, { flex: 1 }]}>{label}</Text>
      {chevron ? <ChevronRight size={20} color={color.ink} strokeWidth={ICON.strokeWidth} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space[20], paddingBottom: space[16], gap: space[12], backgroundColor: rc.pageHeader, borderBottomWidth: 1, borderBottomColor: rc.border },
  headerRow: { flexDirection: "row", alignItems: "center", gap: space[8], marginLeft: -space[8] },
  title: { fontFamily: font.semibold, fontSize: 18, lineHeight: 24, letterSpacing: -0.3, color: color.ink },
  empty: {
    marginTop: space[12],
    alignItems: "center",
    gap: space[8],
    paddingVertical: space[16],
    paddingHorizontal: space[24],
    borderRadius: radius.control,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: color.divider,
    backgroundColor: "#F6F5F9",
  },
  list: { marginTop: space[24], padding: 0, overflow: "hidden" },
  item: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: space[12], paddingHorizontal: space[16], paddingVertical: space[12] },
  rule: { borderTopWidth: 1, borderTopColor: "#F0EFF4" },
});
