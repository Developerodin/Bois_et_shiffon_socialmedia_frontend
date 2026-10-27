import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { ArrowRight, CalendarDays, Camera, ChevronDown, Clock, Download, Info, Lock, Play } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatDate, formatNumber } from "@/i18n";
import { color, font, radius, space } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { Footer } from "@/ui/layout";
import { ActionButton, BackTitle, BrandPill, ICON, PageHeader, Panel, ReelsScreen, SegmentedTabs, Tag, bodyMuted, eyebrow, meta, metaInk, rc, strong14 } from "@/ui/reels/kit";
import { photos, schedule } from "@/ui/reels/sample";

/** Labels: reels:publish.publishNow / reels:schedule. */
const TIMING = ["now", "schedule"] as const;

/** R08 · Reels / Publish or schedule. "Connect" is a local toggle: no social integration exists yet. */
export default function ReelsPublish() {
  const [connected, setConnected] = useState(false);
  const { t } = useTranslation("reels");
  const [timing, setTiming] = useState<(typeof TIMING)[number]>("schedule");
  const timingLabel = (o: (typeof TIMING)[number]) => (o === "schedule" ? t("schedule") : t("publish.publishNow"));
  const confirmLabel = timing === "schedule" ? t("publish.confirmSchedule") : t("publish.publishNow");
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
      header={<PageHeader left={<BackTitle title={t("publish.title")} />} right={<BrandPill />} />}
      contentStyle={{ paddingHorizontal: space[16], paddingTop: space[16], paddingBottom: space[24] }}
      footer={
        <Footer>
          <ActionButton
            label={confirmLabel}
            disabled={!connected}
            trailing={connected ? ArrowRight : Lock}
            onPress={() => router.push("/reels/scheduled")}
          />
          <Button label={t("publish.saveDraft")} variant="ghost" height={44} onPress={() => router.replace("/reels/results")} style={{ marginTop: -8 }} />
        </Footer>
      }
    >
      <Panel style={styles.summary}>
        <View style={styles.thumb}>
          <Image source={photos.table} style={StyleSheet.absoluteFill} contentFit="cover" />
          <Tag label={t("secondsShort", { seconds: 20 })} tone="dark" style={styles.thumbTag} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
            <View style={styles.greyDot} />
            <Text style={eyebrow}>{t("publish.readyToSchedule")}</Text>
          </View>
          <Text style={[styles.title16, { paddingTop: 4 }]}>Bunting spotlight</Text>
          <Text style={meta}>{t("publish.format", { product: "Acacia Massif" })}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t("publish.playPreview")} onPress={() => router.push("/reels/review")} style={styles.icon44}>
          <Play size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
        </Pressable>
      </Panel>

      <Panel style={{ marginTop: space[24] }}>
        <View style={styles.rowBetween}>
          <Text style={eyebrow}>{t("publish.channel")}</Text>
          <Tag label={connected ? t("publish.connected") : t("publish.notConnected")} tone="grey" />
        </View>
        <View style={[styles.box, styles.channel]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[12], flex: 1 }}>
            <LinearGradient colors={["#F59E0B", "#F43F5E", "#9333EA"]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.insta}>
              <Camera size={20} color={color.onPrimary} strokeWidth={ICON.strokeWidth} />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={strong14}>{t("publish.instagramFacebook")}</Text>
              <Text style={meta}>{t("publish.autoPost")}</Text>
            </View>
          </View>
          <ActionButton
            label={connected ? t("publish.connected") : t("publish.connect")}
            variant={connected ? "outline" : "primary"}
            onPress={() => setConnected((c) => !c)}
            style={{ paddingHorizontal: space[12] }}
          />
        </View>
        <View style={[styles.rowBetween, { paddingTop: space[16] }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
            <Download size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
            <Text style={metaInk}>{t("publish.orDownload")}</Text>
          </View>
          <Pressable accessibilityRole="button" style={styles.textBtn}>
            <Text style={strong14}>{t("publish.download")}</Text>
          </Pressable>
        </View>
      </Panel>

      <Panel style={{ marginTop: space[24] }}>
        <Text style={eyebrow}>{t("publish.timing")}</Text>
        <View style={{ paddingTop: space[12] }}>
          <SegmentedTabs options={TIMING} value={timing} onChange={setTiming} getLabel={timingLabel} />
        </View>
        {timing === "schedule" ? (
          <View style={{ paddingTop: space[16], gap: space[8] }}>
            <View style={{ flexDirection: "row", gap: space[16] }}>
              <PickerBox label={t("publish.date")} value={date} icon={<CalendarDays size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />} />
              <PickerBox label={t("publish.time")} value={time} icon={<Clock size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />} />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t("publish.timezoneA11y", { value: schedule.timezone })} style={[styles.box, styles.rowBetween]}>
              <View>
                <Text style={eyebrow}>{t("timezone")}</Text>
                <Text style={metaInk}>{schedule.timezone}</Text>
              </View>
              <ChevronDown size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
            </Pressable>
          </View>
        ) : null}
      </Panel>

      <View style={styles.notice}>
        <Info size={20} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} style={{ marginTop: 2 }} />
        <Text style={[bodyMuted, { flex: 1 }]}>{t("publish.notice")}</Text>
      </View>
    </ReelsScreen>
  );
}

function PickerBox({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  const { t } = useTranslation("reels");
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t("publish.pickerA11y", { label, value })} style={[styles.box, { flex: 1 }]}>
      <Text style={eyebrow}>{label}</Text>
      <View style={[styles.rowBetween, { paddingTop: 2 }]}>
        <Text style={metaInk}>{value}</Text>
        {icon}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", alignItems: "center", gap: space[16], padding: space[12] },
  thumb: { width: 64, height: 80, borderRadius: radius.control, overflow: "hidden", backgroundColor: rc.tagGrey, borderWidth: 1, borderColor: rc.fieldBorder },
  thumbTag: { position: "absolute", right: 2, bottom: 4, paddingHorizontal: 4 },
  greyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: rc.tagGrey },
  title16: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.24, color: color.ink },
  icon44: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.control },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  box: { padding: space[12], backgroundColor: rc.field, borderWidth: 1, borderColor: rc.fieldBorder, borderRadius: radius.control },
  channel: { marginTop: space[12], flexDirection: "row", alignItems: "center", gap: space[8] },
  insta: { width: 36, height: 36, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  textBtn: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
  notice: {
    marginTop: space[24],
    flexDirection: "row",
    gap: space[12],
    padding: space[12],
    backgroundColor: rc.tagGrey,
    borderWidth: 1,
    borderColor: "#D9E3FC",
    borderRadius: radius.control,
  },
});

