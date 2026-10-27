import { router } from "expo-router";
import { ArrowRight, Camera, Lock, MessageCircle, Phone, type LucideIcon } from "lucide-react-native";
import { Fragment } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { color, space } from "@/theme/tokens";
import { BrandInline, CustomerTabs, Divider, EmptyState, TitleHeader, mc } from "@/ui/marketing/kit";
import { channels } from "@/ui/marketing/sample";
import { ICON, Panel, ReelsScreen, eyebrow, meta, metaInk, rc } from "@/ui/reels/kit";

const CHANNEL_ICON: Record<(typeof channels)[number]["id"], { Icon: LucideIcon; bg: string }> = {
  instagram: { Icon: Camera, bg: mc.instagram },
  messenger: { Icon: MessageCircle, bg: mc.chrome },
  whatsapp: { Icon: Phone, bg: mc.whatsapp },
};

/** M02 · Customers / Inbox (empty). No messaging backend: "Connect" opens the example reply assistant. */
export default function CustomersInbox() {
  const { t } = useTranslation("marketing");
  return (
    <ReelsScreen
      bg={color.canvas}
      glow={false}
      header={<TitleHeader title={t("shared.customers")} right={<BrandInline />} />}
      contentStyle={{ paddingTop: space[16] }}
    >
      <CustomerTabs active="inbox" />

      <View style={{ marginTop: space[20] }}>
        <EmptyState
          Icon={MessageCircle}
          iconColor={rc.navInk}
          title={t("inbox.emptyTitle")}
          body={t("inbox.emptyBody")}
          action={{ label: t("inbox.connectChannel"), trailing: ArrowRight, onPress: () => router.push("/marketing/reply") }}
          footnote={t("inbox.emptyFootnote")}
        />
      </View>

      <Panel style={{ marginTop: space[20], paddingBottom: space[12] }}>
        <Text style={eyebrow}>{t("inbox.channelsTitle")}</Text>
        <View style={{ paddingTop: space[8] }}>
          {channels.map((c, i) => {
            const { Icon, bg } = CHANNEL_ICON[c.id];
            const status = t(`shared.status.${c.status}`);
            return (
              <Fragment key={c.id}>
                {i > 0 ? <Divider /> : null}
                <View style={styles.channel} accessible accessibilityLabel={t("inbox.channelLabel", { name: c.name, status })}>
                  <View style={[styles.channelIcon, { backgroundColor: bg }]}>
                    <Icon size={16} color={rc.navInk} strokeWidth={ICON.strokeWidth} />
                  </View>
                  <Text style={[metaInk, { fontSize: 13, flex: 1 }]}>{c.name}</Text>
                  <Text style={meta}>{status}</Text>
                </View>
              </Fragment>
            );
          })}
        </View>
      </Panel>

      <View style={styles.lockNote}>
        <Lock size={16} color={rc.navInk} strokeWidth={ICON.strokeWidth} />
        <Text style={[meta, { fontSize: 13 }]}>{t("inbox.lockNote")}</Text>
      </View>
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  channel: { flexDirection: "row", alignItems: "center", gap: space[12], minHeight: 53 },
  channelIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  lockNote: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[12], marginTop: space[32] },
});
