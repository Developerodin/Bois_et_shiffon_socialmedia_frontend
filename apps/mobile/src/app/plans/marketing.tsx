import { router } from "expo-router";
import { ArrowRight, Building, ChevronRight, MessagesSquare, PanelsTopLeft, Store, Unplug, Zap, type LucideIcon } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, radius, space, type } from "@/theme/tokens";
import { BusinessSwitcher } from "@/ui/posts/chrome";
import { IconDisc, LockTag, PlansModuleHeader } from "@/ui/plans/kit";
import { tools, type Tool } from "@/ui/plans/sample";
import { ICON, ReelsScreen, Tag, rc } from "@/ui/reels/kit";

const ICONS: Record<Tool["id"], LucideIcon> = {
  customers: MessagesSquare,
  google: Store,
  website: PanelsTopLeft,
  business: Building,
  connections: Unplug,
  automations: Zap,
};

/** L06 · No subscription / Marketing tools. */
export default function MarketingTools() {
  const { t } = useTranslation("plans");
  return (
    <ReelsScreen header={<PlansModuleHeader active="marketing" />}>
      <View style={styles.topRow}>
        <BusinessSwitcher />
        <View style={styles.soon} accessibilityLabel={t("marketing.paidAdsA11y")}>
          <View style={styles.soonDot} />
          <Text style={[type.meta, { flex: 1 }]}>{t("marketing.paidAds")}</Text>
        </View>
      </View>

      <View style={{ paddingTop: space[20] }}>
        <Text style={type.pageTitle}>{t("marketing.title")}</Text>
        <Text style={[type.body, { color: color.inkSecondary, paddingTop: 2 }]}>{t("marketing.subtitle")}</Text>
      </View>

      <View style={styles.grid}>
        {tools.map((t) => (
          <ToolCard key={t.id} tool={t} />
        ))}
      </View>
    </ReelsScreen>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  const { t } = useTranslation("plans");
  const Icon = ICONS[tool.id];
  const title = t(`marketing.tools.${tool.id}.title`);
  const subtitle = t(`marketing.tools.${tool.id}.subtitle`);
  const go = () => (tool.locked || !tool.href ? router.push("/plans") : router.push(tool.href));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(tool.locked ? "marketing.toolLockedA11y" : "marketing.toolAvailableA11y", { title, subtitle })}
      onPress={go}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.cardHead}>
        <IconDisc>
          <Icon size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
        </IconDisc>
        {tool.locked ? <LockTag label={t("marketing.locked")} /> : <Tag label={t("marketing.available")} style={{ paddingVertical: 4 }} textStyle={{ color: color.ink }} />}
      </View>
      <Text style={[type.cardTitle, { fontSize: 14, lineHeight: 20, paddingTop: space[12] }]}>{title}</Text>
      <Text style={[type.meta, { paddingTop: 2 }]}>{subtitle}</Text>
      {tool.locked ? <Text style={[type.meta, { paddingTop: space[12] }]}>{t("marketing.professional")}</Text> : null}
      <View style={{ flex: 1 }} />
      <View style={styles.cta}>
        <Text style={[type.meta, { fontFamily: "Inter_500Medium", color: tool.locked ? color.primary : color.ink }]}>{tool.locked ? t("viewPlans") : t("marketing.configure")}</Text>
        {tool.locked ? (
          <ArrowRight size={18} color={color.primary} strokeWidth={ICON.strokeWidth} />
        ) : (
          <ChevronRight size={18} color={color.ink} strokeWidth={ICON.strokeWidth} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  soon: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space[12],
    paddingHorizontal: space[12],
    paddingVertical: 4,
    borderRadius: radius.control,
    backgroundColor: rc.header,
    borderWidth: 1,
    borderColor: color.divider,
  },
  soonDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#C9C7D2" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space[16], paddingTop: space[20] },
  card: {
    width: "47.5%",
    flexGrow: 1,
    minHeight: 190,
    padding: space[20],
    borderRadius: radius.card,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: rc.border,
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cta: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: -space[8] },
});
