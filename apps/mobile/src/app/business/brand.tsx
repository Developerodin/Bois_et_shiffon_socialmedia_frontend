import { Image } from "expo-image";
import { router } from "expo-router";
import { Check, Plus } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { updateBrandDetails } from "@/api/endpoints";
import { color, font, radius, space, type } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { Footer } from "@/ui/layout";
import { BizScreen, SettingsCard, SimpleHeader, TextAction, bc, strong14 } from "@/ui/business/kit";
import { ColorSheet } from "@/ui/onboarding/color-sheet";
import { TONE_GROUPS } from "@/ui/onboarding/tones";
import { ICON, bodyMuted, eyebrow, meta } from "@/ui/reels/kit";
import { setBrandView, useCurrentBrand } from "@/ui/use-current-brand";

const MAX_COLORS = 5;

/**
 * M07 · Business / Brand settings: the brand's palette (saved as soon as a colour is edited, like onboarding A10),
 * its logo, and the creative tones the writers follow (saved with Save changes).
 * ponytail: the design's signature cues and logo upload have nowhere to be stored yet; add them with a brand field.
 */
export default function BrandSettings() {
  const { t } = useTranslation("business");
  const { t: tOn } = useTranslation("onboarding");
  const brand = useCurrentBrand();
  const view = brand?.view;
  const colors = view?.assets?.colors.map((c) => c.hex) ?? [];
  // null = the saved tones; the person's picks once they touch them.
  const [picked, setPicked] = useState<string[] | null>(null);
  const tones = picked ?? view?.preferences.tones ?? [];
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = (tone: string) => setPicked(tones.includes(tone) ? tones.filter((x) => x !== tone) : [...tones, tone]);

  const saveColors = async (hexes: string[]) => {
    if (!brand) return;
    setBrandView(await updateBrandDetails(brand.workspaceId, brand.id, { colors: hexes }), brand.id);
  };
  const save = async () => {
    if (!brand || !picked) return router.back();
    setSaving(true);
    setError(null);
    try {
      setBrandView(await updateBrandDetails(brand.workspaceId, brand.id, { tones: picked }), brand.id);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BizScreen
      gutter={space[20]}
      top={space[16]}
      header={<SimpleHeader title={t("brand.title")} />}
      footer={
        <Footer>
          {error ? <Text style={[meta, { color: color.error, textAlign: "center" }]}>{error}</Text> : null}
          <Button label={saving ? t("brand.saving") : t("brand.save")} disabled={saving || !view || (picked !== null && picked.length === 0)} onPress={() => void save()} />
        </Footer>
      }
    >
      <SettingsCard>
        <View style={styles.cardHead}>
          <Text style={eyebrow} accessibilityRole="header">
            {t("brand.paletteTitle")}
          </Text>
          {view?.assets && colors.length < MAX_COLORS ? <TextAction label={t("brand.addColor")} leading={Plus} onPress={() => setEditing("new")} /> : null}
        </View>
        {!view ? (
          <ActivityIndicator color={color.primary} style={{ marginTop: space[12] }} />
        ) : !view.assets ? (
          // No website read yet: colours come from Research (the server refuses a palette before that).
          <Text style={[bodyMuted, { paddingTop: space[8] }]}>{t("brand.noColors")}</Text>
        ) : (
          <View style={styles.swatches}>
            {colors.map((hex, i) => (
              <Pressable key={hex} accessibilityRole="button" accessibilityLabel={t("brand.editColor", { hex })} onPress={() => setEditing(i)} style={styles.swatch}>
                <View style={[styles.dot, { backgroundColor: hex }]} />
                <Text style={[meta, { paddingTop: space[12] }]}>{hex}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </SettingsCard>

      {brand?.logoUrl ? (
        <SettingsCard style={[styles.row, { marginTop: space[24] }]}>
          <View style={styles.logoFrame}>
            <View style={styles.logoTile}>
              <Image source={{ uri: brand.logoUrl }} style={{ width: 32, height: 32 }} contentFit="contain" accessibilityLabel={t("kit.logoLabel", { name: brand.name })} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={strong14}>{t("brand.watermarkTitle")}</Text>
            <Text style={bodyMuted}>{t("brand.watermarkBody")}</Text>
          </View>
        </SettingsCard>
      ) : null}

      <SettingsCard style={{ marginTop: space[24] }}>
        <Text style={[eyebrow, { paddingBottom: space[8] }]} accessibilityRole="header">
          {t("brand.toneTitle")}
        </Text>
        {TONE_GROUPS.map((group) => (
          <View key={group.key} style={{ paddingTop: space[8] }}>
            <Text style={[meta, { paddingBottom: space[8] }]}>{tOn(`brand.toneGroups.${group.key}`)}</Text>
            <View style={styles.wrap}>
              {group.tones.map((tone) => {
                const on = tones.includes(tone);
                const label = tOn(`brand.tones.${tone.toLowerCase()}`);
                return (
                  <Pressable
                    key={tone}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={label}
                    onPress={() => toggle(tone)}
                    style={[styles.tone, on && styles.toneOn]}
                  >
                    <Text style={on ? [meta, { color: color.primary, fontFamily: font.medium }] : [type.label, { fontFamily: font.regular }]}>{label}</Text>
                    {on ? <Check size={14} color={color.primary} strokeWidth={ICON.strokeWidth} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
        {picked !== null && picked.length === 0 ? <Text style={[meta, { paddingTop: space[8] }]}>{t("brand.pickOneTone")}</Text> : null}
      </SettingsCard>
      <ColorSheet colors={colors} index={editing} onClose={() => setEditing(null)} onSave={saveColors} />
    </BizScreen>
  );
}

const styles = StyleSheet.create({
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[8] },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: space[12], paddingTop: space[12] },
  swatch: {
    flexGrow: 1,
    minWidth: 88,
    alignItems: "center",
    paddingTop: 13,
    paddingBottom: space[16],
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
});
