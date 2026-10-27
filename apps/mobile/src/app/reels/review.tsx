import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { ArrowRight, AudioLines, Download, Ellipsis, Maximize, MonitorPlay, Play, Plus, Smartphone, Volume2, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, font, radius, space } from "@/theme/tokens";
import { Field } from "@/ui/field";
import { Footer } from "@/ui/layout";
import { ActionButton, BackButton, HeaderTitle, ICON, PageHeader, ReelsScreen, Tag, eyebrow, meta, metaInk, rc, strong14 } from "@/ui/reels/kit";
import { captionFr, hashtags, photos } from "@/ui/reels/sample";

/** R07 · Reels / Result review. The player is a still: no video file exists yet. */
export default function ReelsReview() {
  const { t } = useTranslation("reels");
  const [caption, setCaption] = useState(captionFr);
  return (
    <ReelsScreen
      header={
        <PageHeader
          left={<BackButton label={t("goBack")} />}
          center={<HeaderTitle center subtitle={t("review.subtitle")}>Bunting spotlight</HeaderTitle>}
          right={
            <Pressable accessibilityRole="button" accessibilityLabel={t("review.options")} style={styles.icon44}>
              <Ellipsis size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
            </Pressable>
          }
        />
      }
      contentStyle={{ paddingTop: 0, paddingBottom: space[24] }}
      footer={
        <Footer>
          <View style={{ flexDirection: "row", gap: space[12] }}>
            <ActionButton style={{ flex: 1, paddingHorizontal: 0 }} variant="outline" leading={Download} label={t("review.downloadVideo")} />
            <ActionButton style={{ flex: 1, paddingHorizontal: 0 }} trailing={ArrowRight} label={t("schedule")} onPress={() => router.push("/reels/publish")} />
          </View>
          <Text style={[meta, { textAlign: "center" }]}>{t("review.connectFirst")}</Text>
        </Footer>
      }
    >
      <View style={styles.player}>
        <View style={styles.video}>
          <Image source={photos.table} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Bois & Chiffons Table à manger Acacia Bunting" />
          <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.6)"]} style={styles.shade} />
          <View style={styles.sample}>
            <View style={styles.sampleDot} />
            <Text style={metaInk}>{t("review.samplePreview")}</Text>
          </View>
          <View style={styles.duration}>
            <Text style={[meta, { color: color.onPrimary }]}>{t("secondsShort", { seconds: 20 })}</Text>
          </View>
          <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]} pointerEvents="box-none">
            <Pressable accessibilityRole="button" accessibilityLabel={t("review.play")} style={styles.playBtn}>
              <Play size={28} color={color.ink} strokeWidth={ICON.strokeWidth} style={{ marginLeft: 3 }} />
            </Pressable>
          </View>
          <View style={styles.controls}>
            <View style={styles.slider} accessibilityRole="adjustable" accessibilityLabel={t("review.position")}>
              <View style={{ width: "33%", height: 4, borderRadius: 16, backgroundColor: color.surface }} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={[meta, { color: color.onPrimary }]}>0:00 / 0:20</Text>
              <View style={{ flexDirection: "row", gap: space[8] }}>
                <Pressable accessibilityRole="button" accessibilityLabel={t("review.sound")} style={styles.ctrl}>
                  <Volume2 size={20} color="rgba(255,255,255,0.9)" strokeWidth={ICON.strokeWidth} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={t("review.fullscreen")} style={styles.ctrl}>
                  <Maximize size={20} color="rgba(255,255,255,0.9)" strokeWidth={ICON.strokeWidth} />
                </Pressable>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.formatRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
            <Smartphone size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
            <Text style={metaInk}>{t("review.vertical")}</Text>
          </View>
          <Tag label={t("review.portrait")} />
        </View>
      </View>

      <View style={[styles.section, { marginTop: space[24] }]}>
        <View style={styles.rowBetween}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
            <Text style={strong14}>{t("review.captionFrench")}</Text>
            <Text style={meta}>{t("review.defaultSource")}</Text>
          </View>
          <Tag label={t("review.editable")} />
        </View>
        <View style={{ paddingTop: space[12] }}>
          <Field
            multiline
            value={caption}
            onChangeText={setCaption}
            accessibilityLabel={t("review.captionA11y")}
            style={{ flex: 1, fontFamily: font.regular, fontSize: 16, lineHeight: 24, color: color.ink, minHeight: 96, textAlignVertical: "top" }}
          />
        </View>
        <View style={styles.tags}>
          {hashtags.map((h) => (
            <Tag key={h} label={h} style={{ paddingVertical: 4, paddingHorizontal: space[12] }} textStyle={{ color: color.ink }} />
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel={t("review.addTag")} style={styles.icon44}>
            <Plus size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
          </Pressable>
        </View>
      </View>

      <View style={[styles.section, { marginTop: space[24] }]}>
        <Text style={eyebrow}>{t("review.specifications")}</Text>
        <View style={{ paddingTop: space[16], gap: space[8] }}>
          <Spec Icon={AudioLines} label={t("review.audioTrack")} value={t("review.audioValue")} />
          <Spec Icon={MonitorPlay} label={t("review.resolution")} value={t("review.resolutionValue")} />
        </View>
      </View>
    </ReelsScreen>
  );
}

function Spec({ Icon, label, value }: { Icon: LucideIcon; label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", gap: space[12] }}>
      <View style={styles.specIcon}>
        <Icon size={16} color={color.inkSecondary} strokeWidth={ICON.strokeWidth} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={meta}>{label}</Text>
        <Text style={metaInk}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  icon44: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.control },
  player: { backgroundColor: color.surface, borderWidth: 1, borderColor: rc.border, borderRadius: radius.card, overflow: "hidden" },
  video: { aspectRatio: 348 / 619, backgroundColor: "#171717" },
  shade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 96 },
  sample: {
    position: "absolute",
    top: 14,
    left: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: space[8],
    paddingVertical: 4,
    paddingHorizontal: space[12],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: "#DDD7E5",
    borderRadius: radius.badge,
  },
  sampleDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#000", opacity: 0.5 },
  duration: { position: "absolute", top: 14, right: 14, paddingVertical: 4, paddingHorizontal: space[12], borderRadius: 9999, backgroundColor: "rgba(26,27,36,0.8)" },
  playBtn: { width: 44, height: 44, borderRadius: radius.control, backgroundColor: "rgba(255,255,255,0.95)", alignItems: "center", justifyContent: "center" },
  controls: { position: "absolute", left: 0, right: 0, bottom: 0, padding: space[16], gap: space[8] },
  slider: { height: 4, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.35)" },
  ctrl: { width: 44, height: 44, borderRadius: radius.control, backgroundColor: "rgba(33,29,42,0.85)", alignItems: "center", justifyContent: "center" },
  formatRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: space[12], paddingHorizontal: space[16] },
  section: {
    padding: space[16],
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.control,
    boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
  },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[8], paddingTop: space[12] },
  specIcon: { width: 28, height: 28, marginTop: 2, borderRadius: radius.control, backgroundColor: "#EEEDF7", alignItems: "center", justifyContent: "center" },
});

