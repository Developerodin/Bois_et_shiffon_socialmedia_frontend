import { Image } from "expo-image";
import { router } from "expo-router";
import { ImagePlus } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, radius, space, type } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { Footer } from "@/ui/layout";
import { ActionButton, BackTitle, BrandPill, PageHeader, Panel, ReelsScreen, Tag, eyebrow, meta, rc, strong14 } from "@/ui/reels/kit";
import { brand, websiteAssets } from "@/ui/reels/sample";

/** R13 · Reels / Select assets. Selection order = storyboard scene order. */
export default function ReelsAssets() {
  const { t } = useTranslation("reels");
  const [order, setOrder] = useState<string[]>(["wide", "macro", "staged"]);
  const toggle = (id: string) => setOrder((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  const picked = order.map((id) => websiteAssets.find((a) => a.id === id)!);

  return (
    <ReelsScreen
      bg={rc.pageAlt}
      glow={false}
      header={<PageHeader left={<BackTitle title={t("assets.title")} />} right={<BrandPill />} />}
      contentStyle={{ paddingHorizontal: space[16], paddingTop: space[12], paddingBottom: space[24] }}
      footer={
        <Footer>
          <Button
            label={t("assets.createStoryboard", { count: order.length })}
            arrow
            disabled={order.length === 0}
            onPress={() => router.push("/reels/storyboard")}
          />
        </Footer>
      }
    >
      <ActionButton label={t("assets.upload")} variant="outline" leading={ImagePlus} height={46} labelStyle={{ fontFamily: "Inter_600SemiBold" }} />

      <View style={styles.listHead}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
          <Text style={eyebrow}>{t("assets.websiteAssets")}</Text>
          <Tag label={brand.site} tone="grey" />
        </View>
        <Text style={strong14}>{t("assets.selected", { count: order.length })}</Text>
      </View>

      <View style={styles.grid}>
        {websiteAssets.map((a, i) => {
          const n = order.indexOf(a.id) + 1;
          const on = n > 0;
          const otherCategory = i === websiteAssets.length - 1;
          const scene = a.scene ? t("scene.label", a.scene) : t("assets.otherCategory");
          return (
            <Pressable
              key={a.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={t("assets.itemA11y", { title: a.title, scene })}
              onPress={() => toggle(a.id)}
              style={[styles.card, on && styles.cardOn]}
            >
              <View style={styles.thumb}>
                <Image source={a.image} style={StyleSheet.absoluteFill} contentFit="cover" />
                <View style={[styles.badge, on ? styles.badgeOn : styles.badgeOff]}>{on ? <Text style={[meta, { color: color.onPrimary }]}>{n}</Text> : null}</View>
              </View>
              <View style={{ paddingTop: space[8], paddingHorizontal: 4 }}>
                {otherCategory && !on ? (
                  <>
                    <Text style={meta}>{a.title}</Text>
                    <Text style={meta}>{scene}</Text>
                  </>
                ) : (
                  <>
                    <Text style={[strong14, { minHeight: 40 }]}>{a.title}</Text>
                    <Text style={meta}>{scene}</Text>
                  </>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Panel style={{ marginTop: space[24], padding: space[12] }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={meta}>{t("assets.sequence")}</Text>
          <Text style={meta}>{t("assets.dragToReorder")}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: space[8], paddingTop: space[8] }}>
          {picked.map((a, i) => (
            <Pressable
              key={a.id}
              accessibilityRole="button"
              accessibilityLabel={t("assets.reorderA11y", { n: i + 1, label: t(`assets.short.${a.id}`) })}
              // No drag library is installed: tapping moves the scene one place earlier.
              onPress={() => i > 0 && setOrder((o) => [...o.slice(0, i - 1), o[i], o[i - 1], ...o.slice(i + 1)])}
              style={styles.seq}
            >
              <Image source={a.image} style={styles.seqImg} contentFit="cover" />
              <Text style={type.label} numberOfLines={1}>{t("assets.sequenceItem", { n: i + 1, label: t(`assets.short.${a.id}`) })}</Text>
            </Pressable>
          ))}
        </View>
      </Panel>
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  listHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: space[24], paddingHorizontal: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space[16], paddingTop: space[24] },
  card: {
    width: "47.5%",
    flexGrow: 1,
    minHeight: 230,
    padding: space[8],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: rc.border,
    borderRadius: radius.card,
  },
  cardOn: { backgroundColor: color.selection, borderWidth: 2, borderColor: color.primary, padding: 7 },
  thumb: { height: 144, borderRadius: radius.control, overflow: "hidden", backgroundColor: rc.tagGrey },
  badge: { position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  badgeOn: { backgroundColor: color.primary },
  badgeOff: { backgroundColor: "rgba(255,255,255,0.8)", borderWidth: 1, borderColor: "#D4D4DC" },
  seq: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 6,
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#E4E3E9",
    borderRadius: radius.control,
  },
  seqImg: { width: 28, height: 32, borderRadius: radius.control },
});
