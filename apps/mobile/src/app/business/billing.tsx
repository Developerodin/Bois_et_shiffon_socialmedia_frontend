import { router, useFocusEffect } from "expo-router";
import { CalendarDays, Clapperboard, Coins, Plus, RotateCcw, Sparkles, Wrench, type LucideIcon } from "lucide-react-native";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { creditHistory, type CreditLine } from "@/api/endpoints";
import { formatDate, formatNumber } from "@/i18n";
import { color, font, space } from "@/theme/tokens";
import { BizScreen, BrandHeader, NavRow, SectionHead, SettingsCard, SettingsTabs, SmallButton, bc, body12, label14, strong14 } from "@/ui/business/kit";
import { ICON, bodyMuted, meta } from "@/ui/reels/kit";
import { usePlan } from "@/ui/plans/use-plan";

const ICON_OF: Record<CreditLine["kind"], LucideIcon> = { reel: Clapperboard, calendar: CalendarDays, agent: Wrench, audit: Wrench, refund: RotateCcw, added: Plus };

/**
 * M11 · Business / Billing & credits: the workspace's real balance and its recent ledger. ponytail: there's no
 * subscription or payments backend yet, so the plan card says so and Manage opens the Plans screens; the design's
 * monthly allowance bar and "restore purchases" / invoices rows wait for billing.
 */
export default function Billing() {
  const { t } = useTranslation("business");
  const { t: tp } = useTranslation("plans");
  const { loaded, failed, reload, plan, unlimited } = usePlan();
  const [data, setData] = useState<{ credits: number; history: CreditLine[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      creditHistory().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    }, []),
  );
  const balance = formatNumber(data?.credits ?? 0);
  const when = (iso: string) => {
    const d = new Date(iso);
    return d.toDateString() === new Date().toDateString() ? t("billing.today") : t("billing.shortDate", { day: formatDate(d, { day: "numeric" }), month: formatDate(d, { month: "short" }) });
  };

  return (
    <BizScreen
      gutter={space[20]}
      top={space[12]}
      header={
        <BrandHeader
          title={t("kit.settingsTitle")}
          right={
            data ? (
              <View style={styles.credits} accessibilityLabel={t("billing.creditsAvailable", { count: data.credits, n: balance })}>
                <Sparkles size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
                <Text style={body12}>{balance}</Text>
              </View>
            ) : undefined
          }
        />
      }
    >
      <SettingsTabs active="billing" />

      <SettingsCard style={{ marginTop: space[16] }}>
        <View style={styles.planTop}>
          <View style={{ flex: 1 }}>
            <Text style={[strong14, { fontSize: 16, lineHeight: 22 }]}>
              {plan ? t("billing.planName", { plan: tp(`plans.${plan.id}`) }) : unlimited ? t("billing.unlimited") : loaded ? t("billing.noPlan") : failed ? t("billing.planFailed") : t("billing.planLoading")}
            </Text>
            <Text style={[meta, { paddingTop: 4 }]}>
              {plan
                ? t("billing.planBlurb", { count: plan.credits, n: formatNumber(plan.credits), date: plan.renewsAt ? formatDate(plan.renewsAt, { day: "numeric", month: "short" }) : "" })
                : unlimited
                  ? t("billing.unlimitedBlurb")
                  : loaded
                    ? t("billing.noPlanBlurb")
                    : ""}
            </Text>
          </View>
          {failed ? <SmallButton label={t("billing.planRetry")} style={{ borderColor: color.divider }} onPress={() => void reload()} /> : null}
          {loaded && !plan && !unlimited ? <SmallButton label={t("billing.seePlans")} style={{ borderColor: color.divider }} onPress={() => router.push("/plans")} /> : null}
        </View>
      </SettingsCard>

      <SettingsCard style={{ marginTop: space[24] }}>
        <View style={styles.inline}>
          <View style={styles.coin}>
            <Coins size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
          </View>
          <Text style={[strong14, { flex: 1 }]}>{t("billing.balanceTitle")}</Text>
        </View>
        {data ? (
          <View style={styles.balance} accessibilityLabel={t("billing.creditsAvailable", { count: data.credits, n: balance })}>
            <Text style={styles.big}>{balance}</Text>
            <Text style={meta}>{t("billing.creditsWord", { count: data.credits })}</Text>
          </View>
        ) : error ? (
          <Text style={[meta, { color: color.error, paddingTop: space[8] }]}>{error}</Text>
        ) : (
          <ActivityIndicator color={color.primary} style={{ marginTop: space[12] }} />
        )}
        <Text style={[bodyMuted, { paddingTop: space[12] }]}>{t("billing.howCredits")}</Text>
      </SettingsCard>

      <SectionHead title={t("billing.usageTitle")} aside={t("billing.usageAside")} style={{ marginTop: space[24], paddingHorizontal: space[4], paddingBottom: space[8] }} />
      <SettingsCard style={styles.list}>
        {data && data.history.length === 0 ? <Text style={[meta, { padding: space[16] }]}>{t("billing.noUsage")}</Text> : null}
        {(data?.history ?? []).map((u, i) => {
          const Icon = ICON_OF[u.kind];
          const n = formatNumber(Math.abs(u.delta));
          const title = (u.kind === "reel" || u.kind === "refund") && !u.name ? t(`billing.kinds.${u.kind}Plain`) : t(`billing.kinds.${u.kind}`, { name: u.name });
          const amount = u.delta < 0 ? t("billing.spent", { count: -u.delta, n }) : t("billing.added", { count: u.delta, n });
          return (
            <View key={u.id} style={[styles.usage, i > 0 && styles.rule]} accessibilityLabel={`${title}, ${when(u.at)}, ${amount}`}>
              <View style={styles.usageIcon}>
                <Icon size={16} color={bc.black} strokeWidth={ICON.strokeWidth} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={strong14} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={meta}>{when(u.at)}</Text>
              </View>
              <Text style={[strong14, { color: color.inkSecondary }]}>{amount}</Text>
            </View>
          );
        })}
      </SettingsCard>

      <SettingsCard style={[styles.list, { marginTop: space[24] }]}>
        <NavRow first title={t("billing.help.missingCredits")} titleStyle={label14} style={styles.help} onPress={() => router.push("/reels/results")} />
      </SettingsCard>
    </BizScreen>
  );
}

const styles = StyleSheet.create({
  credits: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: space[12],
    borderRadius: 14,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.divider,
  },
  inline: { flexDirection: "row", alignItems: "center", gap: space[8], flexWrap: "wrap" },
  planTop: { flexDirection: "row", alignItems: "center", gap: space[12] },
  coin: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "rgba(240,239,244,0.5)" },
  balance: { flexDirection: "row", alignItems: "baseline", gap: 6, paddingTop: space[8] },
  big: { fontFamily: font.semibold, fontSize: 24, lineHeight: 30, letterSpacing: -0.6, color: color.ink },
  list: { padding: 0, overflow: "hidden" },
  usage: { flexDirection: "row", alignItems: "center", gap: space[12], minHeight: 63, paddingHorizontal: space[12], paddingVertical: space[8] },
  usageIcon: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: bc.tileSoft },
  rule: { borderTopWidth: 1, borderTopColor: "#F0F0F3" },
  help: { minHeight: 45, paddingHorizontal: space[16], paddingVertical: 0 },
});
