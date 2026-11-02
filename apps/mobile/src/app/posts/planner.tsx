import { router } from "expo-router";
import { Layers, ShieldCheck, Sofa, Store } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { posts } from "@/api/endpoints";
import { Button } from "@/ui/button";
import { Card } from "@/ui/layout";
import { formatDate, formatNumber } from "@/i18n";
import { color, radius, space, type } from "@/theme/tokens";
import { BusinessChip, PageHeader, PostsScreen } from "@/ui/posts/chrome";
import { Badge, CardTitle, SegmentedTabs, tint } from "@/ui/posts/controls";
import { dayKey } from "@/ui/posts/sample";
import { usePosts } from "@/ui/posts/use-posts";
import { openLowCredits } from "@/ui/recovery/open";

const SECTIONS = ["business", "billing", "planner"] as const;
const SECTION_HREF = { business: "/business", billing: "/business/billing" } as const;
const PILLAR_ICONS = [Sofa, Layers, Store];
// The Planner run "Generate calendar" starts (apps/web CREDIT_COSTS.manualRun).
const GENERATE_CREDITS = 5;

const sparkles = require("../../../assets/figma/posts/btn-sparkles-white.svg");

/** "2026-11" for this month and the next: the cycles the Planner fills (it plans 30 days ahead). */
function cycles(now: Date) {
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return [dayKey(now).slice(0, 7), dayKey(next).slice(0, 7)];
}

/** P09 · Posts / Planner: what's planned per month (feed posts, reels, pillars), then plan the next 30 days. */
export default function Planner() {
  const { t } = useTranslation("posts");
  const { items } = usePosts();
  const [now] = useState(() => new Date());
  const months = cycles(now);
  const [cycle, setCycle] = useState(months[0]);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = months.map((value) => ({ value, label: formatDate(`${value}-01T12:00:00Z`, { month: "long", year: "numeric", timeZone: "UTC" }) }));

  // What's on the calendar that month: feed posts vs reels, and the share of each content pillar.
  const { feed, reels, pillars } = useMemo(() => {
    const inMonth = (items ?? []).filter((p) => p.scheduledFor && dayKey(new Date(p.scheduledFor)).startsWith(cycle) && p.status !== "REJECTED");
    const byPillar = new Map<string, number>();
    for (const p of inMonth) if (p.pillar) byPillar.set(p.pillar, (byPillar.get(p.pillar) ?? 0) + 1);
    const total = [...byPillar.values()].reduce((a, b) => a + b, 0);
    return {
      feed: inMonth.filter((p) => p.channel !== "INSTAGRAM_REEL").length,
      reels: inMonth.filter((p) => p.channel === "INSTAGRAM_REEL").length,
      pillars: [...byPillar].sort((a, b) => b[1] - a[1]).map(([label, n]) => ({ label, share: n / total })),
    };
  }, [items, cycle]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      await posts.generate();
      setStarted(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) openLowCredits({ needed: GENERATE_CREDITS, title: t("planner.generate"), backdrop: t("planner.title") });
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

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
          <SegmentedTabs
            label={t("planner.sectionsLabel")}
            options={SECTIONS.map((value) => ({ value, label: t(`planner.sections.${value}`) }))}
            value="planner"
            onChange={(v) => v !== "planner" && router.push(SECTION_HREF[v])}
            fill
          />
        </>
      }
      contentStyle={{ paddingHorizontal: space[16], paddingTop: space[12], paddingBottom: space[24] }}
    >
      <Card style={{ padding: space[12] }}>
        <CardTitle>{t("planner.cycle")}</CardTitle>
        <SegmentedTabs label={t("planner.cycle")} options={options} value={cycle} onChange={setCycle} fill style={{ marginTop: space[8] }} />
      </Card>

      <Card style={{ marginTop: space[12] }}>
        <View style={styles.between}>
          <CardTitle>{t("planner.cadence")}</CardTitle>
          <Badge>{t("planner.onCalendar")}</Badge>
        </View>
        <View style={styles.pair}>
          {[
            { key: "feedPosts", n: feed },
            { key: "reels", n: reels },
          ].map((c) => (
            <View key={c.key} style={styles.well}>
              <Text style={[type.meta, { paddingBottom: 2 }]}>{t(`planner.${c.key}`)}</Text>
              <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]}>{t("planner.perMonth", { n: c.n })}</Text>
            </View>
          ))}
        </View>
        <Text style={[type.body, { color: color.inkSecondary, paddingTop: space[8] }]}>{t("planner.cadenceHint")}</Text>
      </Card>

      <Card style={{ marginTop: space[12] }}>
        <CardTitle>{t("planner.pillars")}</CardTitle>
        <View style={{ paddingTop: space[8], gap: space[8] }}>
          {pillars.length === 0 ? <Text style={type.meta}>{t("planner.noPillars")}</Text> : null}
          {pillars.map(({ label, share }, i) => {
            const Icon = PILLAR_ICONS[i % PILLAR_ICONS.length];
            const pct = formatNumber(share, { style: "percent" });
            return (
              <View key={label} style={styles.pillar} accessibilityLabel={t("planner.pillarLabel", { label, share: pct })}>
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

      {error ? <Text style={[type.meta, { color: color.error, textAlign: "center", paddingTop: space[12] }]}>{error}</Text> : null}
      {started ? (
        <View style={{ gap: space[8], marginTop: space[16] }}>
          <Text style={[type.body, { textAlign: "center" }]} accessibilityLiveRegion="polite">
            {t("planner.started")}
          </Text>
          <Button label={t("today.viewCalendar")} variant="outline" onPress={() => router.navigate("/posts/calendar")} />
        </View>
      ) : (
        <Button label={busy ? t("planner.generating") : t("planner.generate")} icon={sparkles} disabled={busy} style={{ marginTop: space[16] }} onPress={() => void generate()} />
      )}
      {!started ? <Text style={[type.meta, { textAlign: "center", paddingTop: space[8] }]}>{t("planner.cost", { n: GENERATE_CREDITS })}</Text> : null}
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
