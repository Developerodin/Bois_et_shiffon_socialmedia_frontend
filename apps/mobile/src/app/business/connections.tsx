import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Camera, Globe, MessageCircle, ShoppingBag, Store, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { color, radius, space } from "@/theme/tokens";
import { BizScreen, BrandHeader, IconTile, SectionHead, SettingsCard, SmallButton, TextAction, bc, strong14 } from "@/ui/business/kit";
import { business, channels, type ChannelId } from "@/ui/business/sample";
import { ICON, Tag, meta } from "@/ui/reels/kit";

const ICONS: Record<(typeof channels)[number]["icon"], LucideIcon> = {
  instagram: Camera,
  facebook: Globe,
  whatsapp: MessageCircle,
  google: Store,
  shopify: ShoppingBag,
};
const GREY = color.disabledInk;

/**
 * M09 · Business / Connections. There's no OAuth flow on mobile yet, so Connect only flips the
 * channel's local state; the real hand-off belongs to the connections API once the client is wired.
 */
export default function Connections() {
  const { t } = useTranslation("business");
  const [linked, setLinked] = useState<Partial<Record<ChannelId, boolean>>>({});

  return (
    <BizScreen top={space[24]} header={<BrandHeader title={t("connections.title")} />}>
      <SectionHead title={t("connections.sourceTitle")} style={{ paddingBottom: space[8] }} />
      <SettingsCard style={[styles.row, { borderColor: color.divider }]}>
        <IconTile icon={Globe} tint={GREY} style={styles.siteTile} />
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={strong14}>{business.site}</Text>
            <Tag label={t("connections.linked")} tone="grey" />
          </View>
          <Text style={[meta, { paddingTop: 2 }]}>{t("connections.sourceBody")}</Text>
        </View>
        <View style={{ marginRight: space[8] }}>
          <TextAction label={t("kit.manage")} onPress={() => router.push("/business/photos")} />
        </View>
      </SettingsCard>

      <SectionHead title={t("connections.channelsTitle")} aside={t("connections.accounts")} style={{ marginTop: space[20], paddingBottom: space[8] }} />
      <View style={{ gap: space[12] }}>
        {channels.map((c) => {
          const on = !!linked[c.id];
          const Icon = ICONS[c.icon];
          return (
            <SettingsCard key={c.id} style={[styles.row, styles.channel, c.primary && { minHeight: 106 }]}>
              {c.icon === "instagram" ? (
                <LinearGradient
                  colors={["rgba(253,29,29,0.1)", "rgba(225,48,108,0.1)", "rgba(64,93,230,0.1)"]}
                  start={{ x: 0, y: 1 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.tile, styles.instagram]}
                >
                  <Icon size={20} color={GREY} strokeWidth={ICON.strokeWidth} />
                </LinearGradient>
              ) : (
                <IconTile icon={Icon} tint={GREY} style={{ marginRight: 4 }} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={strong14}>{t(`connections.channels.${c.id}`)}</Text>
                <View style={styles.status}>
                  <View style={[styles.dot, on && { backgroundColor: "#12B76A" }]} />
                  <Text style={meta}>{on ? t("connections.connected") : t("connections.notConnected")}</Text>
                </View>
              </View>
              <SmallButton
                label={on ? t("connections.disconnect") : t("connections.connect")}
                primary={c.primary && !on}
                onPress={() => setLinked((l) => ({ ...l, [c.id]: !on }))}
              />
            </SettingsCard>
          );
        })}
      </View>
    </BizScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space[12] },
  channel: { borderColor: color.divider, minHeight: 86, paddingVertical: space[16], gap: space[8] },
  siteTile: { width: 38, borderRadius: radius.control, backgroundColor: bc.tile },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space[8], flexWrap: "wrap" },
  tile: { marginRight: 4, width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.control },
  instagram: { borderWidth: 1, borderColor: "rgba(225,48,108,0.15)" },
  status: { flexDirection: "row", alignItems: "center", gap: space[4], paddingTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: bc.dot },
});
