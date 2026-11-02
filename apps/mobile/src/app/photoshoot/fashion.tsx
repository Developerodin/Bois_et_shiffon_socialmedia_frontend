import { useState } from "react";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronDown, Info, Shirt } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/ui/button";
import { BackButton, BrandChip, ps, STROKE, TopBar } from "@/ui/photoshoot/chrome";
import { Page, SectionLabel, Segmented, TierPicker } from "@/ui/photoshoot/controls";
import { backgrounds, garmentRequirements, models, outputFormats, poses } from "@/ui/photoshoot/options";
import { startShoot } from "@/ui/photoshoot/start";
import { libraryPhotos, useCurrentBrand } from "@/ui/use-current-brand";
import { SHOOT_TIERS, type ShootTier } from "@/api/endpoints";
import { color, font, radius, space, type } from "@/theme/tokens";

type Pose = (typeof poses)[number];
type Format = (typeof outputFormats)[number]["ratio"];
type Background = (typeof backgrounds)[number];

/** F03 · Photoshoot / Fashion setup. `garment` (a media key from the brand's library) comes back from the source picker (F04). */
export default function FashionSetup() {
  const { t } = useTranslation("photoshoot");
  const { garment } = useLocalSearchParams<{ garment?: string }>();
  const library = libraryPhotos(useCurrentBrand()?.view);
  const photo = garment ? library.find((p) => p.key === garment) : undefined;
  const [model, setModel] = useState(0);
  const [pose, setPose] = useState<Pose>("fullBody");
  const [format, setFormat] = useState<Format>("4:5");
  const [background, setBackground] = useState<Background>("studioMinimal");
  const [tier, setTier] = useState<ShootTier>("base");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modelLabel = (i: number) => (models[i].id ? t(`fashion.models.${models[i].id}`, { name: models[i].name }) : t("fashion.models.choose"));
  const generate = async () => {
    if (!photo || busy) return;
    setBusy(true);
    setError(null);
    try {
      await startShoot({ kind: "fashion", tier, sourceKey: photo.key, ratio: format, model: models[model].id, pose, background }, t("fashion.title"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      header={<TopBar leading={<BackButton label={t("back", { ns: "common" })} />} title={t("fashion.title")} gap={space[8]} trailing={<BrandChip label />} />}
      contentStyle={{ paddingTop: space[20] }}
      footer={
        <>
          {error ? <Text style={[type.meta, { color: color.error, textAlign: "center" }]}>{error}</Text> : null}
          <Button
            label={photo ? t("fashion.generateFor", { price: t("tiers.price", { count: SHOOT_TIERS.find((x) => x.id === tier)!.credits }) }) : t("fashion.generate")}
            disabled={!photo || busy}
            onPress={() => void generate()}
          />
          {photo ? null : <Text style={[type.body, { color: color.inkSecondary, textAlign: "center", marginTop: -4 }]}>{t("fashion.uploadToEnable")}</Text>}
        </>
      }
    >
      <Text style={type.pageTitle} accessibilityRole="header">
        {t("fashion.heading")}
      </Text>
      <Text style={[type.body, { color: color.inkSecondary, paddingTop: space[4] }]}>{t("fashion.subtitle")}</Text>

      <View style={styles.section}>
        <SectionLabel ink note={t("fashion.required")}>
          {t("fashion.garmentPhoto")}
        </SectionLabel>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={photo ? t("fashion.garmentSelected", { label: photo.title }) : t("fashion.addGarment")}
          accessibilityHint={t("fashion.garmentHint")}
          onPress={() => router.push({ pathname: "/photoshoot/source", params: { for: "fashion", selected: photo?.key ?? "" } })}
          style={({ pressed }) => [styles.upload, pressed && { opacity: 0.85 }]}
        >
          {photo ? (
            <Image source={{ uri: photo.url, cacheKey: photo.key }} style={styles.garment} contentFit="contain" />
          ) : (
            <View style={styles.uploadIcon}>
              <Shirt size={24} color={color.ink} strokeWidth={STROKE} />
            </View>
          )}
          <Text style={[type.label, { textAlign: "center" }]}>{photo ? t("fashion.changeGarment") : t("fashion.addGarment")}</Text>
          <Text style={[type.meta, styles.uploadHint]}>{t("fashion.garmentHint")}</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <SectionLabel ink>{t("fashion.modelStyling")}</SectionLabel>
        {/* No model picker is designed yet: each tap moves to the next model. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("fashion.modelSelected", { model: modelLabel(model) })}
          onPress={() => setModel((m) => (m + 1) % models.length)}
          style={styles.dropdown}
        >
          <Text style={styles.dropdownText}>{modelLabel(model)}</Text>
          <ChevronDown size={16} color={color.ink} strokeWidth={STROKE} />
        </Pressable>
      </View>

      <View style={styles.section}>
        <SectionLabel ink>{t("fashion.pose")}</SectionLabel>
        <Segmented label={t("fashion.pose")} options={poses.map((p) => ({ value: p, label: t(`fashion.poses.${p}`) }))} value={pose} onChange={setPose} />
      </View>

      <View style={styles.section}>
        <SectionLabel ink>{t("fashion.outputFormat")}</SectionLabel>
        <Segmented label={t("fashion.outputFormat")} gap={space[16]} options={outputFormats.map((f) => ({ value: f.ratio, label: t(`fashion.formats.${f.label}`), prefix: f.ratio }))} value={format} onChange={setFormat} />
      </View>

      <View style={styles.section}>
        <SectionLabel ink>{t("fashion.background")}</SectionLabel>
        <Segmented label={t("fashion.background")} options={backgrounds.map((b) => ({ value: b, label: t(`fashion.backgrounds.${b}`) }))} value={background} onChange={setBackground} />
      </View>

      <View style={styles.section}>
        <SectionLabel ink>{t("tiers.label")}</SectionLabel>
        <TierPicker value={tier} onChange={setTier} />
      </View>

      <View style={styles.requirements}>
        <View style={styles.reqHead}>
          <Info size={16} color={color.ink} strokeWidth={STROKE} />
          <Text style={[type.meta, { color: color.ink }]}>{t("fashion.requirementsTitle")}</Text>
        </View>
        <View style={styles.reqList}>
          {garmentRequirements.map((r) => (
            <View key={r} style={styles.reqItem}>
              <View style={styles.bullet} />
              <Text style={type.meta}>{t(`fashion.requirements.${r}`)}</Text>
            </View>
          ))}
        </View>
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: space[24] },
  upload: {
    minHeight: 170,
    alignItems: "center",
    justifyContent: "center",
    padding: space[24],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.controlOutline,
    borderRadius: radius.control,
  },
  uploadIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: color.canvasAlt, alignItems: "center", justifyContent: "center", marginBottom: space[12] },
  garment: { width: 96, height: 96, borderRadius: radius.nested, marginBottom: space[12] },
  uploadHint: { textAlign: "center", width: 240, paddingTop: space[4] },
  dropdown: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space[16],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.controlOutline,
    borderRadius: radius.control,
  },
  dropdownText: { fontFamily: font.medium, fontSize: 16, lineHeight: 24, color: color.ink },
  requirements: {
    marginTop: space[24],
    padding: space[16],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: ps.hairline,
    borderRadius: radius.control,
    shadowColor: "#000",
    shadowOpacity: 0.02,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  reqHead: { flexDirection: "row", alignItems: "center", gap: space[8] },
  reqList: { paddingTop: space[12], paddingLeft: space[4], gap: space[8] },
  reqItem: { flexDirection: "row", alignItems: "center", gap: space[8] },
  bullet: { width: 4, height: 4, borderRadius: 2, backgroundColor: ps.dot },
});
