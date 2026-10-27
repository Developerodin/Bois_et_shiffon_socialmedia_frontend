import { useState } from "react";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Armchair, Camera, RectangleVertical, SlidersHorizontal, Smartphone, Sparkles, Square, Zap } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "@/ui/button";
import { BackButton, BrandChip, Glow, ps, STROKE, TopBar } from "@/ui/photoshoot/chrome";
import { IconLabelButton, Page, PhotoPill, SectionLabel, Segmented, type SegmentOption } from "@/ui/photoshoot/controls";
import { credits, defaultBrief, findAsset, type AspectRatio, type SceneStyle } from "@/ui/photoshoot/sample";
import { color, font, radius, space, type } from "@/theme/tokens";

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

/** F02 · Photoshoot / Product setup. `asset` comes back from the source picker (F04). */
export default function ProductSetup() {
  const { t } = useTranslation("photoshoot");
  const { asset: assetId } = useLocalSearchParams<{ asset?: string }>();
  const asset = findAsset(assetId);
  const [ratio, setRatio] = useState<AspectRatio>("4:5");
  const [scene, setScene] = useState<SceneStyle>("interior");
  const [brief, setBrief] = useState(defaultBrief);

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
              <Text style={type.meta}>{t("product.estimate", { count: credits.shootCost })}</Text>
            </View>
            <Text style={type.meta}>{t("product.available", { count: credits.available })}</Text>
          </View>
          <IconLabelButton label={t("product.generate")} icon={Sparkles} trailing onPress={() => router.push("/photoshoot/generating")} />
        </>
      }
    >
      <SectionLabel>{t("product.selectedAsset")}</SectionLabel>
      <View style={[styles.card, styles.assetCard]}>
        <Image source={asset.image} style={styles.assetThumb} contentFit="cover" accessibilityLabel={asset.product} />
        <View style={{ flex: 1 }}>
          <Text style={styles.assetTitle} numberOfLines={2}>
            {asset.name}
          </Text>
          <Text style={[type.meta, { paddingTop: 2 }]} numberOfLines={1}>
            {`${asset.collection} · boisetchiffons.fr`}
          </Text>
        </View>
        <Button label={t("product.changeAsset")} variant="outline" height={44} onPress={() => router.push("/photoshoot/source")} />
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
        <SectionLabel note={t("product.frenchPrompt")}>{t("product.creativeBrief")}</SectionLabel>
        <View style={styles.briefCard}>
          <TextInput
            value={brief}
            onChangeText={setBrief}
            multiline
            accessibilityLabel={t("product.creativeBrief")}
            placeholder="Décrivez la scène"
            placeholderTextColor={color.inkMuted}
            style={styles.brief}
          />
          <View style={styles.briefHint}>
            <Text style={[type.body, { color: color.inkSecondary }]}>{t("product.briefHint")}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <SectionLabel>{t("product.sourcePreview")}</SectionLabel>
        <View style={[styles.card, { padding: space[12] }]}>
          <View style={styles.preview}>
            <Image source={asset.image} style={styles.previewImage} contentFit="contain" accessibilityLabel={t("product.fullPreview", { product: asset.product })} />
            <PhotoPill dot={ps.black} style={{ top: 10, left: 10 }}>
              {t("product.sourceImage")}
            </PhotoPill>
            <View style={styles.sizeBadge}>
              <Text style={type.meta}>{asset.size}</Text>
            </View>
          </View>
        </View>
      </View>
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
  preview: { height: 142, borderRadius: radius.control, backgroundColor: "#FBF9FD", padding: space[8], overflow: "hidden" },
  previewImage: { flex: 1 },
  sizeBadge: { position: "absolute", right: 8, bottom: 10, paddingVertical: 2, paddingHorizontal: space[8], borderRadius: 6, backgroundColor: "rgba(16,16,20,0.05)" },
  estimate: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: space[4] },
  estimateLeft: { flexDirection: "row", alignItems: "center", gap: space[8] },
});
