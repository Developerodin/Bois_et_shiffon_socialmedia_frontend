import { useState } from "react";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Armchair, Camera, ImageOff, RectangleVertical, SlidersHorizontal, Smartphone, Sparkles, Square, Zap } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "@/ui/button";
import { BackButton, BrandChip, Glow, ps, STROKE, TopBar } from "@/ui/photoshoot/chrome";
import { IconLabelButton, Page, PhotoPill, SectionLabel, Segmented, TierPicker, type SegmentOption } from "@/ui/photoshoot/controls";
import type { aspectRatios, sceneStyles } from "@/ui/photoshoot/options";
import { startShoot } from "@/ui/photoshoot/start";
import { useCredits } from "@/ui/use-credits";
import { libraryPhotos, siteLabel, useCurrentBrand } from "@/ui/use-current-brand";
import { SHOOT_TIERS, type ShootTier } from "@/api/endpoints";
import { color, font, radius, space, type } from "@/theme/tokens";

type AspectRatio = (typeof aspectRatios)[number];
type SceneStyle = (typeof sceneStyles)[number];

const RATIOS: SegmentOption<AspectRatio>[] = [
  { value: "1:1", label: "1:1", icon: Square },
  { value: "4:5", label: "4:5", icon: RectangleVertical },
  { value: "9:16", label: "9:16", icon: Smartphone },
];
/** Labels are photoshoot.json keys, resolved at render. */
const SCENES: SegmentOption<SceneStyle>[] = [
  { value: "studio", label: "product.scenes.studio", icon: Camera },
  { value: "interior", label: "product.scenes.interior", icon: Armchair },
  { value: "custom", label: "product.scenes.custom", icon: SlidersHorizontal },
];

/**
 * F02 · Photoshoot / Product setup, on the brand's photo library. `asset` (a media key) comes back from the source
 * picker (F04); without one, the library's first photo.
 */
export default function ProductSetup() {
  const { t } = useTranslation("photoshoot");
  const { asset: assetKey } = useLocalSearchParams<{ asset?: string }>();
  const brand = useCurrentBrand();
  const photos = libraryPhotos(brand?.view);
  const asset = photos.find((p) => p.key === assetKey) ?? photos[0];
  const available = useCredits();
  const [ratio, setRatio] = useState<AspectRatio>("4:5");
  const [scene, setScene] = useState<SceneStyle>("interior");
  const [brief, setBrief] = useState("");
  const [tier, setTier] = useState<ShootTier>("base");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cost = SHOOT_TIERS.find((x) => x.id === tier)!.credits;
  const needsBrief = scene === "custom" && !brief.trim();
  const generate = async () => {
    if (!asset || busy) return;
    setBusy(true);
    setError(null);
    try {
      await startShoot({ kind: "product", tier, sourceKey: asset.key, ratio, scene, brief: brief.trim() }, t("product.title"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      background={<Glow blobs={[{ x: 60, y: 260, size: 256, color: "#EBE9F5", opacity: 0.7 }, { x: 350, y: 180, size: 240, color: "#F4EDE7", opacity: 0.8 }]} />}
      header={<TopBar leading={<BackButton />} title={t("product.title")} accessory={<BrandChip />} />}
      contentStyle={{ paddingTop: space[16] }}
      footer={
        <>
          <View style={styles.estimate}>
            <View style={styles.estimateLeft}>
              <Zap size={16} color={color.inkSecondary} strokeWidth={STROKE} />
              <Text style={type.meta}>{t("product.estimate", { count: cost })}</Text>
            </View>
            {available === null ? null : <Text style={type.meta}>{t("product.available", { count: available })}</Text>}
          </View>
          {error ? <Text style={[type.meta, { color: color.error }]}>{error}</Text> : needsBrief ? <Text style={type.meta}>{t("product.briefRequired")}</Text> : null}
          <IconLabelButton label={t("product.generate")} icon={Sparkles} trailing disabled={!asset || busy || needsBrief} onPress={() => void generate()} />
        </>
      }
    >
      <SectionLabel>{t("product.selectedAsset")}</SectionLabel>
      <View style={[styles.card, styles.assetCard]}>
        {asset ? (
          <Image source={{ uri: asset.url, cacheKey: asset.key }} style={styles.assetThumb} contentFit="cover" accessibilityLabel={asset.title} />
        ) : (
          <View style={[styles.assetThumb, styles.noPhoto]}>
            <ImageOff size={20} color={color.inkSecondary} strokeWidth={STROKE} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.assetTitle} numberOfLines={2}>
            {asset?.title ?? t("product.noPhoto")}
          </Text>
          <Text style={[type.meta, { paddingTop: 2 }]} numberOfLines={asset ? 1 : 3}>
            {asset ? (asset.kind ?? siteLabel(brand?.view?.website) ?? "") : t("product.noPhotoHint")}
          </Text>
        </View>
        <Button label={t("product.changeAsset")} variant="outline" height={44} onPress={() => router.push({ pathname: "/photoshoot/source", params: { selected: asset?.key ?? "" } })} />
      </View>

      <View style={styles.section}>
        <SectionLabel>{t("tiers.label")}</SectionLabel>
        <TierPicker value={tier} onChange={setTier} />
      </View>

      <View style={styles.section}>
        <SectionLabel>{t("product.aspectRatio")}</SectionLabel>
        <Segmented label={t("product.aspectRatio")} tone="ink" gap={0} options={RATIOS} value={ratio} onChange={setRatio} />
      </View>

      <View style={styles.section}>
        <SectionLabel>{t("product.sceneStyle")}</SectionLabel>
        <Segmented label={t("product.sceneStyle")} tone="ink" gap={0} options={SCENES.map((s) => ({ ...s, label: t(s.label) }))} value={scene} onChange={setScene} />
      </View>

      <View style={styles.section}>
        <SectionLabel note={t(scene === "custom" ? "product.briefRequired" : "product.briefOptional")}>{t("product.creativeBrief")}</SectionLabel>
        <View style={styles.briefCard}>
          <TextInput
            value={brief}
            onChangeText={setBrief}
            multiline
            accessibilityLabel={t("product.creativeBrief")}
            placeholder={t("product.briefPlaceholder")}
            placeholderTextColor={color.inkMuted}
            style={styles.brief}
          />
          <View style={styles.briefHint}>
            <Text style={[type.body, { color: color.inkSecondary }]}>{t("product.briefHint")}</Text>
          </View>
        </View>
      </View>

      {asset ? (
        <View style={styles.section}>
          <SectionLabel>{t("product.sourcePreview")}</SectionLabel>
          <View style={[styles.card, { padding: space[12] }]}>
            <View style={styles.preview}>
              <Image source={{ uri: asset.url, cacheKey: asset.key }} style={styles.previewImage} contentFit="contain" accessibilityLabel={t("product.fullPreview", { product: asset.title })} />
              <PhotoPill dot={ps.black} style={{ top: 10, left: 10 }}>
                {t("product.sourceImage")}
              </PhotoPill>
            </View>
          </View>
        </View>
      ) : null}
      <View style={{ height: 32 }} />
    </Page>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: ps.border,
    borderRadius: radius.card,
    shadowColor: "#23182F",
    shadowOpacity: 0.01,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  assetCard: { flexDirection: "row", alignItems: "center", gap: space[12], padding: space[12] },
  assetThumb: { width: 64, height: 64, borderRadius: radius.control, borderWidth: 1, borderColor: ps.hairline, backgroundColor: "#FAF9FC" },
  assetTitle: { ...type.label, fontFamily: font.semibold },
  section: { paddingTop: space[24] },
  briefCard: {
    padding: space[12],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: ps.hairline,
    borderRadius: radius.control,
    shadowColor: "#000",
    shadowOpacity: 0.02,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  brief: {
    minHeight: 74,
    padding: space[12],
    borderWidth: 1,
    borderColor: color.controlOutline,
    borderRadius: radius.control,
    fontFamily: font.regular,
    fontSize: 16,
    lineHeight: 24,
    color: color.ink,
    textAlignVertical: "top",
  },
  briefHint: { marginTop: space[8], paddingTop: space[4], borderTopWidth: 1, borderTopColor: "#F0EFF4" },
  noPhoto: { alignItems: "center", justifyContent: "center" },
  preview: { height: 142, borderRadius: radius.control, backgroundColor: "#FBF9FD", padding: space[8], overflow: "hidden" },
  previewImage: { flex: 1 },
  estimate: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: space[4] },
  estimateLeft: { flexDirection: "row", alignItems: "center", gap: space[8] },
});
