import { Image } from "expo-image";
import { router } from "expo-router";
import { ChevronDown, Info, Plus } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { Screen, StepHeader, Title } from "@/ui/layout";
import { BrandLogo } from "@/ui/onboarding/brand-logo";
import { ColorSheet } from "@/ui/onboarding/color-sheet";
import { onboarding } from "@/ui/onboarding/state";
import { imageSource, saveBrandPreferences, useBrandAssets } from "@/ui/onboarding/use-brand-assets";
import { color, radius, space, type } from "@/theme/tokens";

// Tone values stay English (stored in onboarding state); labels come from onboarding:brand.tones.<lowercase>.
// Grouped so every kind of business finds itself, not only upscale ones; group titles: onboarding:brand.toneGroups.<key>.
const TONE_GROUPS = [
  { key: "feel", tones: ["Warm", "Playful", "Bold", "Calm", "Romantic", "Edgy"] },
  { key: "style", tones: ["Modern", "Minimalist", "Rustic", "Vintage", "Bohemian", "Industrial", "Scandinavian", "Coastal"] },
  { key: "positioning", tones: ["Luxurious", "Premium", "Elegant", "Affordable", "Artisanal", "Sustainable", "Natural", "Family-friendly"] },
];
// Stored value → label key under onboarding:brand.languages.
const LANGUAGES: { value: string; key: "fr" | "en" }[] = [
  { value: "French (FR)", key: "fr" },
  { value: "English (US)", key: "en" },
];

/** A10 · Onboarding / Brand preferences (Figma 408:670). */
export default function Brand() {
  const { t } = useTranslation("onboarding");
  const { data: brand, loading } = useBrandAssets();
  const colors = brand?.assets?.colors ?? [];
  const fonts = brand?.assets?.fonts ?? [];
  const photos = (brand?.assets?.products ?? []).filter((x) => x.image);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  // Saved choices show until the person changes something here; after that, their own picks are kept.
  const saved = brand?.preferences;
  const [own, setOwn] = useState<{ tones?: string[]; language?: string }>({});
  const tones = own.tones ?? saved?.tones ?? onboarding.tones;
  const language = own.language ?? LANGUAGES.find((l) => l.key === saved?.contentLanguage)?.value ?? onboarding.language;
  const toggle = (tone: string) => setOwn((o) => ({ ...o, tones: tones.includes(tone) ? tones.filter((x) => x !== tone) : [...tones, tone] }));
  const languageIndex = Math.max(0, LANGUAGES.findIndex((l) => l.value === language));
  const languageLabel = t(`brand.languages.${LANGUAGES[languageIndex].key}`);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  // Saves tones and language for the agents, then moves on. A failed save says so; pressing again continues anyway.
  async function next() {
    onboarding.tones = tones;
    onboarding.language = language;
    if (!saveFailed) {
      setSaving(true);
      try {
        await saveBrandPreferences({ tones, contentLanguage: LANGUAGES[languageIndex].key });
      } catch {
        setSaveFailed(true);
        return;
      } finally {
        setSaving(false);
      }
    }
    router.push("/onboarding/preparing");
  }

  return (
    <Screen
      header={<StepHeader step={4} pill />}
      footer={
        <>
          {saveFailed ? (
            <Text accessibilityLiveRegion="polite" style={[type.meta, { color: color.error, textAlign: "center" }]}>
              {t("brand.prefsSaveFailed")}
            </Text>
          ) : null}
          <Button
            label={saveFailed ? t("brand.continueWithoutSaving") : t("common:continue")}
            arrow
            loading={saving}
            disabled={tones.length === 0}
            onPress={() => void next()}
          />
        </>
      }
    >
      <Title title={t("brand.title")} subtitle={t("brand.subtitle")} style={{ paddingBottom: 0 }} />

      <Section>
        <View style={styles.identity}>
          <View style={styles.logo}>
            <BrandLogo brand={brand} size={30} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.strong} numberOfLines={1}>{t("brand.identity", { name: brand?.name ?? "" })}</Text>
            <Text style={type.meta}>{t("brand.paletteMeta")}</Text>
          </View>
        </View>
        <Text style={[type.meta, { paddingTop: space[12], paddingBottom: space[8] }]}>{t("brand.swatches")}</Text>
        {loading ? (
          <ActivityIndicator color={color.inkSecondary} />
        ) : !brand?.assets ? (
          <Text style={[type.body, { color: color.inkSecondary }]}>{t("brand.noColors")}</Text>
        ) : (
          <View style={styles.swatches}>
            {colors.map((c, i) => (
              <Pressable
                key={c.hex}
                style={styles.swatch}
                onPress={() => setEditing(i)}
                accessibilityRole="button"
                accessibilityLabel={t("brand.swatchA11y", { hex: c.hex, source: t(`brand.colorFrom.${c.from}`) })}
              >
                <View style={[styles.dot, { backgroundColor: c.hex }]} />
                <Text style={[type.meta, { color: color.ink, paddingTop: space[8] }]}>{c.hex}</Text>
                <Text style={type.meta} numberOfLines={1}>{t(`brand.colorFrom.${c.from}`)}</Text>
              </Pressable>
            ))}
            {colors.length < 5 ? (
              <Pressable style={[styles.swatch, styles.addSwatch]} onPress={() => setEditing("new")} accessibilityRole="button" accessibilityLabel={t("brand.addColor")}>
                <Plus size={22} color={color.inkSecondary} strokeWidth={1.75} />
                <Text style={[type.meta, { paddingTop: space[8] }]}>{t("brand.addColor")}</Text>
              </Pressable>
            ) : null}
          </View>
        )}
        {fonts.length ? <Text style={[type.meta, { paddingTop: space[12] }]}>{t("brand.fonts", { fonts: fonts.join(", ") })}</Text> : null}
      </Section>

      <Section>
        <View style={styles.head}>
          <Text style={styles.strong}>{t("brand.tone")}</Text>
          <Text style={type.meta}>{t("brand.selected", { count: tones.length })}</Text>
        </View>
        {TONE_GROUPS.map((group) => (
          <View key={group.key}>
            <Text style={[type.meta, { paddingTop: space[16] }]} accessibilityRole="header">
              {t(`brand.toneGroups.${group.key}`)}
            </Text>
            <View style={[styles.chips, { paddingTop: space[8] }]}>
              {group.tones.map((tone) => (
                <Chip key={tone} label={t(`brand.tones.${tone.toLowerCase()}`)} selected={tones.includes(tone)} onPress={() => toggle(tone)} />
              ))}
            </View>
          </View>
        ))}
      </Section>

      <View style={[styles.row, { marginTop: space[24] }]}>
        <View style={[styles.card, styles.half]}>
          <Text style={type.meta}>{t("brand.contentLanguage")}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("brand.contentLanguageA11y", { language: languageLabel })}
            onPress={() => setOwn((o) => ({ ...o, language: LANGUAGES[(languageIndex + 1) % LANGUAGES.length].value }))}
            style={styles.select}
          >
            <Text style={[type.meta, { color: color.ink }]}>{languageLabel}</Text>
            <ChevronDown size={16} color={color.inkSecondary} strokeWidth={1.75} />
          </Pressable>
        </View>
        <View style={[styles.card, styles.half]}>
          <Text style={type.meta}>{t("brand.audienceProfile")}</Text>
          {/* The audience from A09 (Research's, or the owner's edit there); the full sentence is on A09. */}
          <View style={styles.select}>
            <Text style={[type.meta, { color: brand?.summary?.audience ? color.ink : color.inkSecondary, flex: 1 }]} numberOfLines={3}>
              {brand?.summary?.audience ?? t("review.addAudience")}
            </Text>
          </View>
        </View>
      </View>

      <Section>
        <View style={styles.head}>
          <Text style={styles.strong}>{t("brand.featured")}</Text>
          <Text style={type.meta}>{t("brand.readyForBatch", { count: photos.length })}</Text>
        </View>
        {!loading && photos.length === 0 ? (
          <Text style={[type.body, { color: color.inkSecondary, paddingTop: space[12] }]}>{t("review.noProducts")}</Text>
        ) : (
          <View style={[styles.row, { paddingTop: space[12] }]}>
            {photos.slice(0, 2).map((prod) => (
              <View key={prod.url} style={styles.product}>
                <Image source={imageSource(prod.image!)} style={styles.productImage} contentFit="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={[type.meta, { color: color.ink }]} numberOfLines={2}>
                    {prod.title}
                  </Text>
                  {prod.kind ? <Text style={type.meta} numberOfLines={1}>{prod.kind}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </Section>

      <View style={styles.note}>
        <Info size={18} color={color.inkSecondary} strokeWidth={1.75} style={{ marginTop: 2 }} />
        <Text style={[type.body, { color: color.inkSecondary, flex: 1 }]}>{t("brand.channelsNote")}</Text>
      </View>
      <ColorSheet colors={colors.map((c) => c.hex)} index={editing} onClose={() => setEditing(null)} />
    </Screen>
  );
}

function Section({ children }: { children: ReactNode }) {
  return <View style={[styles.card, { marginTop: space[24], borderRadius: radius.card }]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: "rgba(255,255,255,0.95)", borderWidth: 1, borderColor: color.divider, borderRadius: 20, padding: space[16] },
  identity: { flexDirection: "row", alignItems: "center", gap: space[12], paddingBottom: space[12], borderBottomWidth: 1, borderBottomColor: color.divider },
  logo: { minWidth: 40, height: 40, padding: 4, borderRadius: radius.badge, backgroundColor: color.canvasAlt, borderWidth: 1, borderColor: color.divider, alignItems: "center", justifyContent: "center" },
  strong: { ...type.label, fontFamily: "Inter_600SemiBold" },
  row: { flexDirection: "row", gap: space[16] },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: space[8] },
  // 3 per row; min height keeps every swatch a comfortable touch target
  swatch: { width: "31.5%", minHeight: 96, alignItems: "center", justifyContent: "center", padding: space[8], backgroundColor: color.canvasAlt, borderWidth: 1, borderColor: color.divider, borderRadius: radius.control },
  addSwatch: { borderStyle: "dashed", backgroundColor: "transparent" },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: "rgba(0,0,0,0.1)" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[8], paddingTop: space[16] },
  half: { flex: 1, gap: space[8] },
  select: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: space[8], minHeight: 36, backgroundColor: color.canvasAlt, borderWidth: 1, borderColor: color.divider, borderRadius: radius.control },
  product: { flex: 1, flexDirection: "row", alignItems: "center", gap: space[12], padding: space[8], backgroundColor: color.canvasAlt, borderWidth: 1, borderColor: color.divider, borderRadius: radius.control },
  productImage: { width: 56, height: 56, borderRadius: radius.control, borderWidth: 1, borderColor: color.divider, backgroundColor: color.surface },
  note: { flexDirection: "row", gap: space[12], padding: space[12], marginTop: space[24], backgroundColor: "rgba(255,255,255,0.7)", borderWidth: 1, borderColor: color.divider, borderRadius: radius.control },
});
