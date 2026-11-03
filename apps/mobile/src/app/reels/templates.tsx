import { Image } from "expo-image";
import { router } from "expo-router";
import { Check } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, radius, space } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { Footer } from "@/ui/layout";
import { BackTitle, BrandPill, PageHeader, ReelsScreen, Tag, meta, rc, strong14 } from "@/ui/reels/kit";
import { templates } from "@/ui/reels/sample";
import { useReel } from "@/ui/reels/use-reel";

/** R12 · Reels / Templates. */
export default function ReelsTemplates() {
  const { t } = useTranslation("reels");
  const [selected, setSelected] = useState<string>(templates[0].id);
  const { id, busy, error, chat } = useReel();
  // A template is an instruction to the scriptwriter: it reshapes the open plan, or starts a new one.
  const use = async () => {
    const tpl = templates.find((x) => x.id === selected)!;
    const ask = t("templates.useAsk", { title: t(`templates.item.${tpl.id}.title`), subtitle: t(`templates.item.${tpl.id}.subtitle`), seconds: tpl.seconds });
    if (await chat(ask)) router.push(id ? "/reels/storyboard" : "/reels/chat");
  };

  return (
    <ReelsScreen
      bg={rc.pageAlt}
      glow={false}
      header={<PageHeader left={<BackTitle title={t("templates.title")} />} right={<BrandPill />} />}
      contentStyle={{ paddingHorizontal: space[16], paddingTop: space[12], paddingBottom: space[24] }}
      footer={
        <Footer>
          {error ? <Text style={[meta, { color: color.error, textAlign: "center" }]}>{error}</Text> : null}
          <Button label={busy ? t("templates.applying") : t("templates.useTemplate")} arrow disabled={busy} onPress={() => void use()} />
        </Footer>
      }
    >
      {/* Search and filters have no backend yet: said once, instead of controls that do nothing. */}
      <Text style={meta}>{t("templates.searchSoon")}</Text>

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
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space[16], paddingTop: space[16] },
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
