import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Check, Clock, Globe, Share2, Store, X, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatDate, formatNumber } from "@/i18n";
import { color, radius, space, type } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { Footer } from "@/ui/layout";
import { BrandPill, ICON, PageHeader, Panel, ReelsScreen, bodyMuted, meta, metaInk, rc, strong14 } from "@/ui/reels/kit";
import { brand, photos, schedule } from "@/ui/reels/sample";

/** R09 · Reels / Schedule confirmation. */
export default function ReelsScheduled() {
  const { t } = useTranslation("reels");
  const date = t("publish.dateValue", {
    day: formatNumber(schedule.at.getDate()),
    month: formatDate(schedule.at, { month: "long" }),
    year: formatNumber(schedule.at.getFullYear(), { useGrouping: false }),
  });
  const time = formatDate(schedule.at, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return (
    <ReelsScreen
      bg={rc.pageAlt}
      glow={false}
      header={
        <PageHeader
          left={<BrandPill />}
          right={
            <Pressable accessibilityRole="button" accessibilityLabel={t("common:close")} onPress={() => router.replace("/reels/results")} style={styles.icon44}>
              <X size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
            </Pressable>
          }
        />
      }
      contentStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center" }}
      footer={
        <Footer>
          <Button label={t("scheduled.viewReel")} arrow onPress={() => router.push("/reels/review")} />
          <Button label={t("scheduled.backToResults")} variant="ghost" height={44} onPress={() => router.replace("/reels/results")} />
        </Footer>
      }
    >
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(16,185,129,0.10)", "rgba(67,152,168,0.08)", "rgba(168,85,247,0.05)", "rgba(168,85,247,0)"]}
        locations={[0, 0.25, 0.5, 1]}
        style={styles.wash}
      />
      <View style={{ alignItems: "center", maxWidth: 280 }}>
        <View style={styles.badge}>
          <Check size={28} color={color.onPrimary} strokeWidth={ICON.strokeWidth} />
        </View>
        <Text style={[type.pageTitle, { textAlign: "center", paddingTop: space[12] }]}>{t("scheduled.title")}</Text>
        <Text style={[bodyMuted, { textAlign: "center", paddingTop: 4 }]}>{t("scheduled.body")}</Text>
      </View>

      <Panel style={{ alignSelf: "stretch", marginTop: space[24] }}>
        <View style={styles.product}>
          <Image source={photos.table} style={styles.thumb} contentFit="cover" />
          <View>
            <Text style={strong14}>Bunting spotlight</Text>
            <Text style={meta}>{t("scheduled.meta", { seconds: 20 })}</Text>
          </View>
        </View>
        <View style={{ paddingTop: space[16], gap: space[12] }}>
          <Row Icon={Clock} label={t("scheduled.publishDate")} value={<Text style={metaInk}>{t("scheduled.dateTime", { date, time })}</Text>} />
          <Row Icon={Globe} label={t("timezone")} value={<Text style={metaInk}>Europe/Paris</Text>} />
          <Row Icon={Store} label={t("scheduled.brandWorkspace")} value={<Text style={metaInk}>{brand.name}</Text>} />
          <Row
            Icon={Share2}
            label={t("scheduled.channel")}
            value={
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <View style={styles.dot} />
                <Text style={meta}>{t("scheduled.instagramConnected")}</Text>
              </View>
            }
          />
        </View>
      </Panel>

      <Text style={[meta, { textAlign: "center", paddingTop: space[24] }]}>{t("scheduled.editInCalendar")}</Text>
    </ReelsScreen>
  );
}

function Row({ Icon, label, value }: { Icon: LucideIcon; label: string; value: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
        <Icon size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
        <Text style={meta}>{label}</Text>
      </View>
      {value}
    </View>
  );
}

const styles = StyleSheet.create({
  icon44: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.control },
  wash: { position: "absolute", top: 0, left: 0, right: 0, height: 256 },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: rc.black,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 6px rgba(16,185,129,0.2), 0 10px 15px rgba(16,185,129,0.2)",
  },
  product: { flexDirection: "row", alignItems: "center", gap: space[12], paddingBottom: space[12], borderBottomWidth: 1, borderBottomColor: rc.tagGrey },
  thumb: { width: 48, height: 56, borderRadius: radius.control, borderWidth: 1, borderColor: rc.fieldBorder },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: rc.tagGrey },
});
