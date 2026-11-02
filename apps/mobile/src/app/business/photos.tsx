import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { ImagePlus, Plus, RefreshCw, X } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { updateBrandDetails, uploadPhoto } from "@/api/endpoints";
import { formatNumber } from "@/i18n";
import { color, font, radius, space } from "@/theme/tokens";
import { BizScreen, BrandHeader, SectionHead, SettingsCard, TextAction, bc, body12, strong14 } from "@/ui/business/kit";
import { ActionButton, ICON, SegmentedTabs, bodyMuted, meta } from "@/ui/reels/kit";
import { reloadCurrentBrand, setBrandView, siteLabel, useCurrentBrand } from "@/ui/use-current-brand";

const SOURCES = ["website", "uploads"] as const;
type Photo = { key: string; url: string; label: string; badge?: string };

/**
 * M08 · Business / Photo assets: the brand's photo library every module draws from. Website = the product photos
 * Research read from the site; Uploads = the owner's own (added here, removable here). Refresh reads the library again.
 */
export default function PhotoAssets() {
  const { t } = useTranslation("business");
  const brand = useCurrentBrand();
  const view = brand?.view;
  const [source, setSource] = useState<(typeof SOURCES)[number]>("website");
  const [busy, setBusy] = useState<"upload" | "refresh" | string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const website: Photo[] = (view?.assets?.products ?? []).flatMap((p) => (p.image ? [{ key: p.image.key, url: p.image.url, label: p.title, badge: p.kind ?? undefined }] : []));
  const site = siteLabel(view?.website);
  const uploads: Photo[] = (view?.uploads ?? []).flatMap((u) => (u.image ? [{ key: u.image.key, url: u.image.url, label: u.title }] : []));
  const counts = { website: website.length, uploads: uploads.length };
  const shown = source === "website" ? website : uploads;
  // SegmentedTabs shows its values, so tabs are labels mapped back to source ids.
  const labels = SOURCES.map((id) => t(`photos.sources.${id}`, { n: formatNumber(counts[id]) }));

  const run = async (what: string, call: () => Promise<unknown>) => {
    setBusy(what);
    setError(null);
    try {
      await call();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const upload = () =>
    run("upload", async () => {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 10, quality: 0.85 });
      if (r.canceled) return;
      if (!brand) return;
      // This business, fixed for the whole batch (switching business mid-way mustn't move the rest).
      const to = { workspaceId: brand.workspaceId, brandId: brand.id };
      setSource("uploads");
      try {
        // ponytail: one plain title; file names ("IMG_2026…") would reach the writers as product names.
        for (const a of r.assets) await uploadPhoto(a.uri, { title: t("photos.untitled") }, to);
      } finally {
        await reloadCurrentBrand(); // what made it before a failure shows too
      }
    });
  const remove = (key: string) =>
    run(key, async () => {
      if (!brand) return;
      setBrandView(await updateBrandDetails(brand.workspaceId, brand.id, { removeUpload: key }), brand.id);
    });

  return (
    <BizScreen
      top={space[12]}
      header={
        <BrandHeader
          title={t("photos.title")}
          right={
            <ActionButton
              label={t("photos.refresh")}
              variant="outline"
              leading={RefreshCw}
              height={44}
              disabled={busy !== null}
              style={{ borderRadius: radius.control }}
              onPress={() => void run("refresh", reloadCurrentBrand)}
            />
          }
        />
      }
    >
      <SettingsCard style={{ borderColor: color.divider }}>
        <View style={styles.sourceHead}>
          <View style={styles.dot} />
          <Text style={strong14}>{site ?? t("photos.sourceTitle")}</Text>
        </View>
        <Text style={[bodyMuted, { paddingTop: space[4] }]}>{t("photos.sourceBody")}</Text>
      </SettingsCard>

      <View style={styles.toolbar}>
        <View style={{ width: 210 }}>
          <SegmentedTabs options={labels} value={labels[SOURCES.indexOf(source)]} onChange={(l) => setSource(SOURCES[labels.indexOf(l)])} />
        </View>
        <View style={{ marginRight: space[12] }}>
          <TextAction label={t("photos.addPhotos")} leading={Plus} onPress={() => void upload()} />
        </View>
      </View>

      <SectionHead title={t("photos.photosTitle")} aside={t("photos.photoCount", { count: shown.length, n: formatNumber(shown.length) })} style={{ paddingHorizontal: 0, paddingBottom: space[8] }} />
      {error ? <Text style={[meta, { color: color.error, paddingBottom: space[8] }]}>{error}</Text> : null}

      {!view ? (
        <ActivityIndicator color={color.primary} />
      ) : shown.length ? (
        <View style={styles.grid}>
          {shown.map((p) => (
            <View key={p.key} style={styles.card} accessibilityLabel={p.badge ? `${p.badge}, ${p.label}` : p.label}>
              <View style={styles.thumb}>
                <Image source={{ uri: p.url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                {p.badge ? (
                  <View style={styles.badge}>
                    <Text style={[meta, { color: color.onPrimary }]} numberOfLines={1}>
                      {p.badge}
                    </Text>
                  </View>
                ) : null}
                {source === "uploads" ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={t("photos.remove", { name: p.label })} disabled={busy !== null} onPress={() => void remove(p.key)} hitSlop={8} style={styles.remove}>
                    {busy === p.key ? <ActivityIndicator size="small" color={color.onPrimary} /> : <X size={14} color={color.onPrimary} strokeWidth={ICON.strokeWidth} />}
                  </Pressable>
                ) : null}
              </View>
              <Text style={[body12, styles.caption]} numberOfLines={1}>
                {p.label}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <SettingsCard style={{ alignItems: "center", paddingVertical: space[32] }}>
          <Text style={strong14}>{source === "website" ? t("photos.emptyWebsiteTitle") : t("photos.emptyTitle")}</Text>
          <Text style={[meta, { textAlign: "center", paddingTop: space[4] }]}>{source === "website" ? t("photos.emptyWebsiteBody") : t("photos.emptyBody")}</Text>
        </SettingsCard>
      )}

      <ActionButton
        label={busy === "upload" ? t("photos.uploading") : t("photos.upload")}
        leading={ImagePlus}
        disabled={busy !== null || !view}
        style={{ marginTop: space[20] }}
        labelStyle={{ fontFamily: font.medium }}
        onPress={() => void upload()}
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
    maxWidth: "33%",
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
    maxWidth: "90%",
    height: 22,
    justifyContent: "center",
    paddingHorizontal: space[8],
    borderRadius: radius.badge,
    backgroundColor: bc.dark,
  },
  remove: { position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: bc.dark },
  caption: { textAlign: "center", paddingVertical: space[8], paddingHorizontal: 4 },
});
