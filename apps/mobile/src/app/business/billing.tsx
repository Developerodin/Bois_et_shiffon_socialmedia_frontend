import { CalendarDays, Clapperboard, Coins, RefreshCw, Sparkles, type LucideIcon } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { formatDate, formatNumber } from "@/i18n";
import { color, font, space } from "@/theme/tokens";
import { BizScreen, BrandHeader, NavRow, SectionHead, SettingsCard, SettingsTabs, SmallButton, bc, body12, label14, strong14 } from "@/ui/business/kit";
import { billingHelp, creditUsage, plan } from "@/ui/business/sample";
import { ICON, Tag, bodyMuted, meta } from "@/ui/reels/kit";

const USAGE_ICON: Record<(typeof creditUsage)[number]["icon"], LucideIcon> = { reel: Clapperboard, calendar: CalendarDays, renew: RefreshCw };

/**
 * M11 · Business / Billing & credits (subscriber). Sample figures until the credits ledger is
 * wired into the mobile client; there's no subscription backend, so Manage is a no-op.
 */
export default function Billing() {
  const { t } = useTranslation("business");
  const used = plan.balance / plan.allowance;
  const balance = formatNumber(plan.balance);
  const allowance = formatNumber(plan.allowance);
  // "{{day}} {{month}}" keeps the sample's "26 Oct" in English while letting each language reorder it.
  const when = (date: string | null) =>
    date ? t("billing.shortDate", { day: formatDate(date, { day: "numeric" }), month: formatDate(date, { month: "short" }) }) : t("billing.today");
  const usage = creditUsage.map((u) => {
    const detail =
      u.id === "plan" ? t("billing.usage.plan.detail", { count: u.posts, n: formatNumber(u.posts ?? 0) }) : t(`billing.usage.${u.id}.detail`);
    const n = formatNumber(Math.abs(u.credits));
    const amount =
      u.credits < 0 ? t("billing.spent", { count: -u.credits, n }) : u.credits > 0 ? t("billing.added", { count: u.credits, n }) : t("billing.included");
    return { ...u, title: t(`billing.usage.${u.id}.title`, { name: u.name }), meta: t("billing.usageMeta", { when: when(u.date), detail }), amount };
  });

  return (
    <BizScreen
      gutter={space[20]}
      top={space[12]}
      header={
        <BrandHeader
          title={t("kit.settingsTitle")}
          right={
            <View style={styles.credits} accessibilityLabel={t("billing.creditsAvailable", { count: plan.balance, n: balance })}>
              <Sparkles size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
              <Text style={body12}>{balance}</Text>
            </View>
          }
        />
      }
    >
      <SettingsTabs active="billing" />

      <SettingsCard style={{ marginTop: space[16] }}>
        <View style={styles.planTop}>
          <View style={{ flex: 1 }}>
            <View style={styles.inline}>
              <Text style={[strong14, { fontSize: 16, lineHeight: 22 }]}>{t("billing.planName", { tier: plan.tier })}</Text>
              <Tag label={t("billing.statusActive")} tone="grey" />
            </View>
            <Text style={[meta, { paddingTop: 4 }]}>{t("billing.planBlurb")}</Text>
          </View>
          <SmallButton label={t("kit.manage")} style={{ borderColor: color.divider }} />
        </View>
        <View style={styles.cycle}>
          <Text style={meta}>{t("billing.cycleTitle")}</Text>
          <Text style={body12}>{t("billing.renewsMonthly")}</Text>
        </View>
      </SettingsCard>

      <SettingsCard style={{ marginTop: space[24] }}>
        <View style={styles.inline}>
          <View style={styles.coin}>
            <Coins size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
          </View>
          <Text style={[strong14, { flex: 1 }]}>{t("billing.balanceTitle")}</Text>
          <Text style={meta}>{t("billing.monthlyAllowance", { amount: allowance })}</Text>
        </View>
        <View style={styles.balance} accessibilityLabel={t("billing.balanceLabel", { count: plan.allowance, balance, n: allowance })}>
          <Text style={styles.big}>{balance}</Text>
          <Text style={meta}>{t("billing.balanceOf", { count: plan.allowance, n: allowance })}</Text>
        </View>
        <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: plan.allowance, now: plan.balance }}>
          <View style={[styles.fill, { width: `${used * 100}%` }]} />
        </View>
        <Text style={[bodyMuted, { paddingTop: space[12] }]}>
          {t("billing.note", { count: plan.used, n: formatNumber(plan.used), reserved: formatNumber(plan.reserved), item: plan.reservedFor })}
        </Text>
      </SettingsCard>

      <SectionHead title={t("billing.usageTitle")} aside={t("billing.usageAside")} style={{ marginTop: space[24], paddingHorizontal: space[4], paddingBottom: space[8] }} />
      <SettingsCard style={styles.list}>
        {usage.map((u, i) => {
          const Icon = USAGE_ICON[u.icon];
          return (
            <View key={u.id} style={[styles.usage, i > 0 && styles.rule]} accessibilityLabel={`${u.title}, ${u.meta}, ${u.amount}`}>
              <View style={styles.usageIcon}>
                <Icon size={16} color={bc.black} strokeWidth={ICON.strokeWidth} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={strong14}>{u.title}</Text>
                <Text style={meta}>{u.meta}</Text>
              </View>
              <Text style={[strong14, { color: color.inkSecondary }]}>{u.amount}</Text>
            </View>
          );
        })}
      </SettingsCard>

      <SettingsCard style={[styles.list, { marginTop: space[24] }]}>
        {billingHelp.map((h, i) => (
          <NavRow key={h} first={i === 0} title={t(`billing.help.${h}`)} titleStyle={label14} style={styles.help} />
        ))}
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
  cycle: { flexDirection: "row", justifyContent: "space-between", marginTop: space[16], paddingTop: space[16], borderTopWidth: 1, borderTopColor: "#F0F0F3" },
  coin: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "rgba(240,239,244,0.5)" },
  balance: { flexDirection: "row", alignItems: "baseline", paddingTop: space[8] },
  big: { fontFamily: font.semibold, fontSize: 24, lineHeight: 30, letterSpacing: -0.6, color: color.ink },
  track: { height: 8, borderRadius: 4, backgroundColor: "#EBEBEF", marginTop: space[12], overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: bc.black },
  list: { padding: 0, overflow: "hidden" },
  usage: { flexDirection: "row", alignItems: "center", gap: space[12], minHeight: 63, paddingHorizontal: space[12], paddingVertical: space[8] },
  usageIcon: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: bc.tileSoft },
  rule: { borderTopWidth: 1, borderTopColor: "#F0F0F3" },
  help: { minHeight: 45, paddingHorizontal: space[16], paddingVertical: 0 },
});
