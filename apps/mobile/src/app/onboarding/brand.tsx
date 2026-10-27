import { Image } from "expo-image";
import { router } from "expo-router";
import { ChevronDown, Info } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { images } from "@/ui/icons";
import { Screen, StepHeader, Title } from "@/ui/layout";
import { sampleProfile } from "@/ui/onboarding/profile";
import { onboarding } from "@/ui/onboarding/state";
import { color, radius, space, type } from "@/theme/tokens";

// Tone values stay English (stored in onboarding state); labels come from onboarding:brand.tones.<lowercase>.
const TONES = ["Modern", "Luxurious", "Elegant", "Premium", "Natural", "Minimalist"];
// Stored value → label key under onboarding:brand.languages.
const LANGUAGES = [
  { value: "French (FR)", key: "fr" },
  { value: "English (US)", key: "en" },
];

/** A10 · Onboarding / Brand preferences (Figma 408:670). */
export default function Brand() {
  const { t } = useTranslation("onboarding");
  const p = sampleProfile;
  const [tones, setTones] = useState<string[]>(onboarding.tones);
  const [language, setLanguage] = useState(onboarding.language);
  const toggle = (tone: string) => setTones((cur) => (cur.includes(tone) ? cur.filter((x) => x !== tone) : [...cur, tone]));
  const languageIndex = Math.max(0, LANGUAGES.findIndex((l) => l.value === language));
  const languageLabel = t(`brand.languages.${LANGUAGES[languageIndex].key}`);

  return (
    <Screen
      header={<StepHeader step={4} pill />}
      footer={
        <Button
          label={t("common:continue")}
          arrow
          disabled={tones.length === 0}
          onPress={() => {
            onboarding.tones = tones;
            onboarding.language = language;
            router.push("/onboarding/preparing");
          }}
        />
      }
    >
      <Title title={t("brand.title")} subtitle={t("brand.subtitle")} style={{ paddingBottom: 0 }} />

      <Section>
        <View style={styles.identity}>
          <View style={styles.logo}>
            <Image source={images.bcFavicon} style={{ width: 30, height: 30 }} contentFit="contain" />
          </View>
          <View>
            <Text style={styles.strong}>{t("brand.identity", { name: p.name })}</Text>
            <Text style={type.meta}>{t("brand.paletteMeta")}</Text>
          </View>
        </View>
        <Text style={[type.meta, { paddingTop: space[12], paddingBottom: space[8] }]}>{t("brand.swatches")}</Text>
        <View style={styles.row}>
          {p.palette.map((c) => (
            <View key={c.hex} style={styles.swatch}>
              <View style={[styles.dot, { backgroundColor: c.hex }]} />
              <Text style={[type.meta, { color: color.ink, paddingTop: space[8] }]}>{c.name}</Text>
              <Text style={type.meta}>{c.hex}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section>
        <View style={styles.head}>
          <Text style={styles.strong}>{t("brand.tone")}</Text>
          <Text style={type.meta}>{t("brand.selected", { count: tones.length })}</Text>
        </View>
        <View style={styles.chips}>
          {TONES.map((tone) => (
            <Chip key={tone} label={t(`brand.tones.${tone.toLowerCase()}`)} selected={tones.includes(tone)} onPress={() => toggle(tone)} />
          ))}
        </View>
      </Section>

      <View style={[styles.row, { marginTop: space[24] }]}>
        <View style={[styles.card, styles.half]}>
          <Text style={type.meta}>{t("brand.contentLanguage")}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("brand.contentLanguageA11y", { language: languageLabel })}
            onPress={() => setLanguage(LANGUAGES[(languageIndex + 1) % LANGUAGES.length].value)}
            style={styles.select}
          >
            <Text style={[type.meta, { color: color.ink }]}>{languageLabel}</Text>
            <ChevronDown size={16} color={color.inkSecondary} strokeWidth={1.75} />
          </Pressable>
        </View>
        <View style={[styles.card, styles.half]}>
          <Text style={type.meta}>{t("brand.audienceProfile")}</Text>
          <View style={styles.select}>
            <Text style={[type.meta, { color: color.ink }]}>{t("brand.audienceHome")}</Text>
          </View>
        </View>
      </View>

      <Section>
        <View style={styles.head}>
          <Text style={styles.strong}>{t("brand.featured")}</Text>
          <Text style={type.meta}>{t("brand.readyForBatch", { count: p.products.length })}</Text>
        </View>
        <View style={[styles.row, { paddingTop: space[12] }]}>
          {p.products.map((prod, i) => (
            <View key={prod.title} style={styles.product}>
              <Image source={prod.image} style={styles.productImage} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <Text style={[type.meta, { color: color.ink }]} numberOfLines={1}>
                  {i === 0 ? t("brand.sampleProducts.table") : t("brand.sampleProducts.tv")}
                </Text>
                <Text style={type.meta} numberOfLines={2}>
                  {i === 0 ? t("brand.sampleProducts.tableDetail") : t("brand.sampleProducts.tvDetail")}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </Section>

      <View style={styles.note}>
        <Info size={18} color={color.inkSecondary} strokeWidth={1.75} style={{ marginTop: 2 }} />
        <Text style={[type.body, { color: color.inkSecondary, flex: 1 }]}>{t("brand.channelsNote")}</Text>
      </View>
    </Screen>
  );
}

function Section({ children }: { children: ReactNode }) {
  return <View style={[styles.card, { marginTop: space[24], borderRadius: radius.card }]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: "rgba(255,255,255,0.95)", borderWidth: 1, borderColor: color.divider, borderRadius: 20, padding: space[16] },
  identity: { flexDirection: "row", alignItems: "center", gap: space[12], paddingBottom: space[12], borderBottomWidth: 1, borderBottomColor: color.divider },
  logo: { width: 40, height: 40, padding: 4, borderRadius: radius.badge, backgroundColor: color.canvasAlt, borderWidth: 1, borderColor: color.divider },
  strong: { ...type.label, fontFamily: "Inter_600SemiBold" },
  row: { flexDirection: "row", gap: space[16] },
  swatch: { flex: 1, alignItems: "center", padding: space[8], backgroundColor: color.canvasAlt, borderWidth: 1, borderColor: color.divider, borderRadius: radius.control },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: "rgba(0,0,0,0.1)" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[8], paddingTop: space[16] },
  half: { flex: 1, gap: space[8] },
  select: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: space[8], minHeight: 36, backgroundColor: color.canvasAlt, borderWidth: 1, borderColor: color.divider, borderRadius: radius.control },
  product: { flex: 1, flexDirection: "row", alignItems: "center", gap: space[12], padding: space[8], backgroundColor: color.canvasAlt, borderWidth: 1, borderColor: color.divider, borderRadius: radius.control },
  productImage: { width: 56, height: 56, borderRadius: radius.control, borderWidth: 1, borderColor: color.divider, backgroundColor: color.surface },
  note: { flexDirection: "row", gap: space[12], padding: space[12], marginTop: space[24], backgroundColor: "rgba(255,255,255,0.7)", borderWidth: 1, borderColor: color.divider, borderRadius: radius.control },
});
