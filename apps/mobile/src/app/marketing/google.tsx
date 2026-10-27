import { router } from "expo-router";
import { Lock, MapPinPlus, RefreshCw, SquarePen, Star, Store, type LucideIcon } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { color, space, type } from "@/theme/tokens";
import { Divider, TitleHeader, mc, title16 } from "@/ui/marketing/kit";
import { googleCapabilities } from "@/ui/marketing/sample";
import { ActionButton, BrandPill, ICON, Panel, ReelsScreen, bodyMuted, eyebrow, meta, rc, strong14 } from "@/ui/reels/kit";

const CAPABILITY_ICON: Record<(typeof googleCapabilities)[number]["id"], LucideIcon> = {
  catalog: Store,
  reviews: Star,
  replies: SquarePen,
};

/**
 * M04 · Google Growth / Setup. There is no Google Business integration: "Connect" continues
 * to the workspace preview (M14) without a network call.
 */
export default function GoogleSetup() {
  const { t } = useTranslation("marketing");
  return (
    <ReelsScreen
      bg={color.canvas}
      glow={false}
      header={<TitleHeader title={t("shared.googleGrowth")} right={<BrandPill tone="white" />} />}
      contentStyle={{ paddingTop: space[16] }}
    >
      <Text style={type.pageTitle}>{t("google.presenceTitle")}</Text>
      <Text style={[bodyMuted, { paddingTop: 4 }]}>{t("google.presenceBody")}</Text>

      <Panel style={{ marginTop: space[24] }}>
        <View style={{ flexDirection: "row", gap: space[16] }}>
          <View style={styles.pin}>
            <MapPinPlus size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={title16}>{t("google.profileTitle")}</Text>
            <Text style={[meta, { paddingTop: 2 }]}>{t("shared.status.notConnected")}</Text>
            <Text style={[bodyMuted, { paddingTop: space[8] }]}>{t("google.profileBody")}</Text>
          </View>
        </View>
        <Divider style={{ marginVertical: space[16] }} />
        <ActionButton label={t("google.connectProfile")} leading={RefreshCw} onPress={() => router.push("/marketing/google-workspace")} />
      </Panel>

      <Panel style={{ marginTop: space[24] }}>
        <Text style={eyebrow}>{t("google.capabilitiesTitle")}</Text>
        <View style={{ gap: space[16], paddingTop: space[16] }}>
          {googleCapabilities.map((c) => {
            const Icon = CAPABILITY_ICON[c.id];
            return (
              <View key={c.id} style={{ flexDirection: "row", gap: space[12] }}>
                <View style={styles.capIcon}>
                  <Icon size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={strong14}>{t(`google.capabilities.${c.id}.title`)}</Text>
                  <Text style={[bodyMuted, { paddingTop: 2 }]}>{t(`google.capabilities.${c.id}.body`)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </Panel>

      {/* Below the frame's fold: the card's lock badge is visible, its copy is inferred. */}
      <Panel style={[styles.privacy, { marginTop: space[24] }]}>
        <View style={styles.lock}>
          <Lock size={16} color={rc.navInk} strokeWidth={ICON.strokeWidth} />
        </View>
        <Text style={[title16, { textAlign: "center", paddingTop: space[12] }]}>{t("google.controlTitle")}</Text>
        <Text style={[bodyMuted, { textAlign: "center", paddingTop: 4 }]}>{t("google.controlBody")}</Text>
      </Panel>
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  pin: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: rc.border },
  capIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: mc.iconCircle, alignItems: "center", justifyContent: "center", marginTop: 1 },
  privacy: { alignItems: "center" },
  lock: { width: 32, height: 32, borderRadius: 16, backgroundColor: mc.rowDivider, alignItems: "center", justifyContent: "center" },
});
