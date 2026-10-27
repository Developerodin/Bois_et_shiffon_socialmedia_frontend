import { Image } from "expo-image";
import { ImagePlus, Plus, RefreshCw } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { formatNumber } from "@/i18n";
import { color, font, radius, space } from "@/theme/tokens";
import { BizScreen, BrandHeader, SectionHead, SettingsCard, TextAction, bc, body12, strong14 } from "@/ui/business/kit";
import { websitePhotos } from "@/ui/business/sample";
import { ActionButton, SegmentedTabs, bodyMuted, meta } from "@/ui/reels/kit";

const SOURCES = ["website", "uploads"] as const;
const COUNTS: Record<(typeof SOURCES)[number], number> = { website: websitePhotos.length, uploads: 0 };

/** M08 · Business / Photo assets: the shared catalog photos every module draws from. */
export default function PhotoAssets() {
  const { t } = useTranslation("business");
  const [source, setSource] = useState<(typeof SOURCES)[number]>("website");
  const showWebsite = source === "website";
  // SegmentedTabs shows its values, so tabs are labels mapped back to source ids.
  const labels = SOURCES.map((id) => t(`photos.sources.${id}`, { n: formatNumber(COUNTS[id]) }));
  const shownCount = COUNTS[source];

  return (
    <BizScreen
      top={space[12]}
      header={
        <BrandHeader
          title={t("photos.title")}
          right={<ActionButton label={t("photos.refresh")} variant="outline" leading={RefreshCw} height={44} style={{ borderRadius: radius.control }} />}
        />
      }
    >
      <SettingsCard style={{ borderColor: color.divider }}>
        <View style={styles.sourceHead}>
          <View style={styles.dot} />
          <Text style={strong14}>{t("photos.sourceTitle")}</Text>
        </View>
        <Text style={[bodyMuted, { paddingTop: space[4] }]}>
          {t("photos.sourceBody")}
        </Text>
      </SettingsCard>

      <View style={styles.toolbar}>
        <View style={{ width: 210 }}>
          <SegmentedTabs options={labels} value={labels[SOURCES.indexOf(source)]} onChange={(l) => setSource(SOURCES[labels.indexOf(l)])} />
        </View>
        <View style={{ marginRight: space[12] }}>
          <TextAction label={t("photos.addPhotos")} leading={Plus} />
        </View>
      </View>

      <SectionHead title={t("photos.photosTitle")} aside={t("photos.photoCount", { count: shownCount, n: formatNumber(shownCount) })} style={{ paddingHorizontal: 0, paddingBottom: space[8] }} />

      {showWebsite ? (
        <View style={styles.grid}>
          {websitePhotos.map((p) => (
            <View key={p.id} style={styles.card} accessibilityLabel={`${p.badge}, ${p.label}`}>
              <View style={styles.thumb}>
                <Image source={p.image} style={[StyleSheet.absoluteFill, { transform: [{ scale: p.zoom }] }]} contentFit="cover" />
                <View style={styles.badge}>
                  <Text style={[meta, { color: color.onPrimary }]}>{p.badge}</Text>
                </View>
              </View>
              <Text style={[body12, styles.caption]} numberOfLines={1}>
                {p.label}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <SettingsCard style={{ alignItems: "center", paddingVertical: space[32] }}>
          <Text style={strong14}>{t("photos.emptyTitle")}</Text>
          <Text style={[meta, { textAlign: "center", paddingTop: space[4] }]}>{t("photos.emptyBody")}</Text>
        </SettingsCard>
      )}

      <ActionButton
        label={t("photos.upload")}
        leading={ImagePlus}
        style={{ marginTop: space[20] }}
        labelStyle={{ fontFamily: font.medium }}
      />
    </BizScreen>
  );
}

const styles = StyleSheet.create({
  sourceHead: { flexDirection: "row", alignItems: "center", gap: space[8] },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: bc.tile },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[8], marginTop: space[16], marginBottom: space[20] },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space[8] },
  card: {
    width: "31.6%",
    flexGrow: 1,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.divider,
    backgroundColor: color.surface,
    overflow: "hidden",
  },
  thumb: { aspectRatio: 1, overflow: "hidden", backgroundColor: "#F3F4F6" },
  badge: {
    position: "absolute",
    right: 3,
    bottom: 4,
    height: 22,
    justifyContent: "center",
    paddingHorizontal: space[8],
    borderRadius: radius.badge,
    backgroundColor: bc.dark,
  },
  caption: { textAlign: "center", paddingVertical: space[8], paddingHorizontal: 4 },
});
