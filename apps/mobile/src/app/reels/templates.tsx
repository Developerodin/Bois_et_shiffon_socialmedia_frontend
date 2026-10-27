import { Image } from "expo-image";
import { router } from "expo-router";
import { Check, Search, SlidersHorizontal } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, font, radius, space } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { Footer } from "@/ui/layout";
import { BackTitle, BrandPill, Chip, ChipRow, ICON, PageHeader, ReelsScreen, Tag, meta, rc, strong14 } from "@/ui/reels/kit";
import { templateFilters, templates } from "@/ui/reels/sample";

/** R12 · Reels / Templates. */
export default function ReelsTemplates() {
  const { t } = useTranslation("reels");
  const [filter, setFilter] = useState<string>(templateFilters[0]);
  const [selected, setSelected] = useState<string>(templates[0].id);
  const [query, setQuery] = useState("");

  return (
    <ReelsScreen
      bg={rc.pageAlt}
      glow={false}
      header={<PageHeader left={<BackTitle title={t("templates.title")} />} right={<BrandPill />} />}
      contentStyle={{ paddingHorizontal: space[16], paddingTop: space[12], paddingBottom: space[24] }}
      footer={
        <Footer>
          <Button label={t("templates.useTemplate")} arrow onPress={() => router.push("/reels/assets")} />
        </Footer>
      }
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
        <View style={{ flex: 1 }}>
          <Field
            height={48}
            value={query}
            onChangeText={setQuery}
            placeholder={t("templates.searchPlaceholder")}
            accessibilityLabel={t("templates.searchA11y")}
            leading={<Search size={20} color={color.inkMuted} strokeWidth={ICON.strokeWidth} />}
            style={{ flex: 1, fontFamily: font.regular, fontSize: 16, lineHeight: 19, color: color.ink, paddingVertical: 10 }}
          />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t("templates.tune")} style={styles.tune}>
          <SlidersHorizontal size={20} color={color.ink} strokeWidth={ICON.strokeWidth} />
        </Pressable>
      </View>

      <ChipRow bleed={16} style={{ marginTop: 26, marginBottom: 4 }}>
        {templateFilters.map((f) => (
          <Chip key={f} label={t(`templates.filter.${f}`)} selected={f === filter} onPress={() => setFilter(f)} />
        ))}
      </ChipRow>

      <View style={styles.grid}>
        {templates.map((tpl) => {
          const on = tpl.id === selected;
          const title = t(`templates.item.${tpl.id}.title`);
          const subtitle = t(`templates.item.${tpl.id}.subtitle`);
          const duration = t("secondsShort", { seconds: tpl.seconds });
          return (
            <Pressable
              key={tpl.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={t("templates.itemA11y", { title, subtitle, duration })}
              onPress={() => setSelected(tpl.id)}
              style={[styles.card, on && styles.cardOn]}
            >
              <View style={styles.thumb}>
                <Image source={tpl.image} style={StyleSheet.absoluteFill} contentFit="cover" />
                <Tag label={duration} tone="dark" style={styles.duration} />
                {on ? (
                  <View style={styles.check}>
                    <Check size={14} color={color.onPrimary} strokeWidth={2.25} />
                  </View>
                ) : null}
              </View>
              <Text style={[strong14, { paddingTop: space[8] }]}>{title}</Text>
              <Text style={[meta, { paddingTop: 2 }]}>{subtitle}</Text>
            </Pressable>
          );
        })}
      </View>
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  tune: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.controlOutline,
    borderRadius: radius.control,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space[16], paddingTop: space[24] },
  card: {
    width: "47.5%",
    flexGrow: 1,
    padding: space[12],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: "#E4E3E9",
    borderRadius: radius.card,
  },
  cardOn: { backgroundColor: color.selection, borderWidth: 2, borderColor: color.primary, padding: 11 },
  thumb: { height: 128, borderRadius: radius.control, overflow: "hidden", backgroundColor: rc.tagGrey, borderWidth: 1, borderColor: rc.fieldBorder },
  duration: { position: "absolute", top: 7, left: 7 },
  check: { position: "absolute", top: 7, right: 7, width: 20, height: 20, borderRadius: 10, backgroundColor: color.primary, alignItems: "center", justifyContent: "center" },
});
