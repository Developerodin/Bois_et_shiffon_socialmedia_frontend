import { Image } from "expo-image";
import { router } from "expo-router";
import { Check, Plus } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, font, radius, space, type } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { Footer } from "@/ui/layout";
import { BizScreen, SettingsCard, SimpleHeader, TextAction, bc, body12, strong14 } from "@/ui/business/kit";
import { business, defaultTones, media, palette, signatureCues, tones } from "@/ui/business/sample";
import { ICON, bodyMuted, eyebrow, meta } from "@/ui/reels/kit";

/** M07 · Business / Brand settings: palette, outro logo, creative tone and signature cues. */
export default function BrandSettings() {
  const { t } = useTranslation("business");
  const [picked, setPicked] = useState<string[]>([...defaultTones]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <BizScreen
      gutter={space[20]}
      top={space[16]}
      header={<SimpleHeader title={t("brand.title")} />}
      footer={
        <Footer>
          <Button label={t("brand.save")} onPress={() => router.back()} />
        </Footer>
      }
    >
      <SettingsCard>
        <View style={styles.cardHead}>
          <Text style={eyebrow} accessibilityRole="header">
            {t("brand.paletteTitle")}
          </Text>
          <TextAction label={t("brand.editHex")} />
        </View>
        <View style={styles.swatches}>
          {palette.map((c) => (
            <View key={c.hex} style={styles.swatch} accessibilityLabel={`${c.name}, ${c.hex}`}>
              <View style={[styles.dot, { backgroundColor: c.hex }]} />
              <Text style={[body12, { fontFamily: font.semibold, paddingTop: space[12] }]}>{c.name}</Text>
              <Text style={meta}>{c.hex}</Text>
            </View>
          ))}
        </View>
      </SettingsCard>

      <SettingsCard style={[styles.row, { marginTop: space[24] }]}>
        <View style={styles.logoFrame}>
          <View style={styles.logoTile}>
            <Image source={media.favicon} style={{ width: 32, height: 32 }} contentFit="contain" accessibilityLabel={t("kit.logoLabel", { name: business.name })} />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={strong14}>{t("brand.watermarkTitle")}</Text>
          <Text style={bodyMuted}>{t("brand.watermarkBody")}</Text>
        </View>
        <TextAction label={t("brand.change")} />
      </SettingsCard>

      <SettingsCard style={{ marginTop: space[24] }}>
        <Text style={[eyebrow, { paddingBottom: space[16] }]} accessibilityRole="header">
          {t("brand.toneTitle")}
        </Text>
        <View style={styles.wrap}>
          {tones.map((id) => {
            const on = picked.includes(id);
            const label = t(`brand.tones.${id}`);
            return (
              <Pressable
                key={id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={label}
                onPress={() => toggle(id)}
                style={[styles.tone, on && styles.toneOn]}
              >
                <Text style={on ? [meta, { color: color.primary, fontFamily: font.medium }] : [type.label, { fontFamily: font.regular }]}>{label}</Text>
                {on ? <Check size={14} color={color.primary} strokeWidth={ICON.strokeWidth} /> : null}
              </Pressable>
            );
          })}
        </View>
      </SettingsCard>

      <SettingsCard style={{ marginTop: space[24] }}>
        <View style={styles.cardHead}>
          <Text style={eyebrow} accessibilityRole="header">
            {t("brand.cuesTitle")}
          </Text>
          <TextAction label={t("brand.addCue")} leading={Plus} />
        </View>
        <View style={{ gap: space[8], paddingTop: space[8], alignItems: "flex-start" }}>
          {signatureCues.map((c) => (
            <View key={c} style={styles.cue}>
              <Text style={body12}>{c}</Text>
            </View>
          ))}
        </View>
      </SettingsCard>
    </BizScreen>
  );
}

const styles = StyleSheet.create({
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[8] },
  swatches: { flexDirection: "row", gap: space[12], paddingTop: space[12] },
  swatch: {
    flex: 1,
    alignItems: "center",
    paddingTop: 13,
    paddingBottom: space[24],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: bc.border,
    backgroundColor: color.surface,
  },
  dot: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: "rgba(16,16,20,0.08)" },
  row: { flexDirection: "row", alignItems: "center", gap: space[8] },
  logoFrame: { marginRight: 4, width: 56, height: 56, alignItems: "center", justifyContent: "center", borderRadius: radius.card, borderWidth: 1, borderColor: bc.border },
  logoTile: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: bc.black },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space[8] },
  tone: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space[8],
    paddingHorizontal: space[12],
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.controlOutline,
    backgroundColor: color.surface,
  },
  toneOn: { borderWidth: 2, borderColor: color.primary, backgroundColor: color.selection, paddingHorizontal: 11 },
  cue: { minHeight: 28, justifyContent: "center", paddingHorizontal: space[12], borderRadius: 14, backgroundColor: "#F4F4F8", borderWidth: 1, borderColor: color.divider },
});
