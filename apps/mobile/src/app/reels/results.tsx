import { Image } from "expo-image";
import { router } from "expo-router";
import { ArrowRight, Ellipsis, LoaderCircle, Play, Plus } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatNumber } from "@/i18n";
import { color, font, radius, space, type } from "@/theme/tokens";
import { ActionButton, BottomNav, Chip, ICON, ModuleHeader, Panel, ReelsScreen, bodyMuted, meta, metaInk, rc } from "@/ui/reels/kit";
import { photos, readyReels, resultFilters } from "@/ui/reels/sample";

/** R06 · Reels / Results. */
export default function ReelsResults() {
  const { t } = useTranslation("reels");
  const [filter, setFilter] = useState<string>(resultFilters[0].key);
  const percent = formatNumber(0.65, { style: "percent" });
  return (
    <ReelsScreen header={<ModuleHeader credits={120} />} footer={<BottomNav active="results" />} contentStyle={{ gap: space[16] }}>
      <View style={styles.titleRow}>
        <Text style={type.pageTitle}>{t("results.title")}</Text>
        <ActionButton label={t("results.newReel")} leading={Plus} onPress={() => router.push("/reels")} />
      </View>
      <View style={{ flexDirection: "row", gap: space[8], paddingTop: 2, paddingBottom: 4 }}>
        {resultFilters.map((f) => (
          <Chip key={f.key} label={t(`results.filter.${f.key}`, { n: f.count })} selected={f.key === filter} onPress={() => setFilter(f.key)} />
        ))}
      </View>

      <View style={{ gap: space[16], paddingTop: 4 }}>
        <Panel>
          <View style={styles.processingHead}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
              <View style={styles.pulse} />
              <Text style={metaInk}>{t("results.processing", { count: 40 })}</Text>
            </View>
            <Text style={meta}>{t("inProgress")}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("results.renderingA11y", { title: "Bunting spotlight", percent })}
            onPress={() => router.push("/reels/generating")}
            style={{ flexDirection: "row", gap: space[16], paddingTop: space[12] }}
          >
            <View style={styles.thumb}>
              <Image source={photos.table} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={2} />
              <View style={[StyleSheet.absoluteFill, styles.thumbShade, { backgroundColor: "rgba(0,0,0,0.2)" }]}>
                <LoaderCircle size={16} color={color.primary} strokeWidth={ICON.strokeWidth} />
              </View>
            </View>
            <View style={{ flex: 1, justifyContent: "space-between", paddingVertical: 2 }}>
              <View>
                <Text style={styles.cardTitle}>Bunting spotlight</Text>
                <Text style={[bodyMuted, { paddingTop: 2 }]}>{t("results.renderingMeta", { seconds: 20 })}</Text>
              </View>
              <View style={{ paddingTop: space[8] }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={meta}>{t("results.renderingStage")}</Text>
                  <Text style={metaInk}>{percent}</Text>
                </View>
                <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: 65 }}>
                  <View style={[styles.fill, { width: "65%" }]} />
                </View>
              </View>
            </View>
          </Pressable>
        </Panel>

        {readyReels.map((r) => (
          <Panel key={r.id}>
            <View style={{ flexDirection: "row", gap: space[16] }}>
              <Pressable accessibilityRole="button" accessibilityLabel={t("results.previewA11y", { title: r.title })} onPress={() => router.push("/reels/review")} style={styles.thumb}>
                <Image source={r.image} style={StyleSheet.absoluteFill} contentFit="cover" />
                <View style={[StyleSheet.absoluteFill, styles.thumbShade]}>
                  <View style={styles.play}>
                    <Play size={16} color={color.ink} strokeWidth={ICON.strokeWidth} style={{ marginLeft: 2 }} />
                  </View>
                </View>
                <View style={styles.previewTag}>
                  <Text style={[meta, { color: color.onPrimary }]}>{t("preview")}</Text>
                </View>
              </Pressable>
              <View style={{ flex: 1, paddingVertical: 2 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={[styles.cardTitle, { flex: 1 }]}>{r.title}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={t("results.moreOptions")} style={styles.more}>
                    <Ellipsis size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
                  </Pressable>
                </View>
                <Text style={[bodyMuted, { paddingTop: 2 }]}>{t(r.metaKey)}</Text>
                <Pressable accessibilityRole="button" onPress={() => router.push("/reels/review")} style={styles.review}>
                  <Text style={[type.label, { fontFamily: font.semibold }]}>{t("results.reviewVideo")}</Text>
                  <ArrowRight size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
                </Pressable>
              </View>
            </View>
          </Panel>
        ))}
      </View>
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4 },
  processingHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: space[12],
    borderBottomWidth: 1,
    borderBottomColor: rc.hairline,
  },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: rc.black, boxShadow: "0 0 0 1px rgba(16,16,20,0.2)" },
  thumb: { width: 80, height: 112, borderRadius: radius.control, overflow: "hidden", backgroundColor: "#F4F2FD" },
  thumbShade: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.25)" },
  play: { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center" },
  previewTag: { position: "absolute", top: 4, left: 4, paddingHorizontal: space[8], borderRadius: radius.badge, backgroundColor: rc.dark },
  cardTitle: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.24, color: color.ink },
  track: { marginTop: 4, height: 6, borderRadius: radius.control, backgroundColor: "#EEEDF7", overflow: "hidden" },
  fill: { height: 6, borderRadius: radius.control, backgroundColor: rc.black },
  more: { width: 44, height: 44, marginTop: -8, marginRight: -12, alignItems: "center", justifyContent: "center", borderRadius: radius.control },
  review: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, alignSelf: "flex-start", marginTop: space[8] },
});
