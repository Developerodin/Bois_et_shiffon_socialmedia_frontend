import { Image } from "expo-image";
import { router } from "expo-router";
import { ChevronRight, Video } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { color, radius, space, type } from "@/theme/tokens";
import { ActionButton, BottomNav, Chip, ChipRow, ICON, ModuleHeader, ReelsScreen, Tag, bodyMuted, meta } from "@/ui/reels/kit";
import { ideaFilters, ideas } from "@/ui/reels/sample";

/** R02 · Reels / Ideas. */
export default function ReelsIdeas() {
  const { t } = useTranslation("reels");
  const [filter, setFilter] = useState<string>(ideaFilters[0].key);
  return (
    <ReelsScreen header={<ModuleHeader />} footer={<BottomNav active="ideas" />}>
      <View style={styles.titleRow}>
        <Text style={type.pageTitle}>{t("ideas.title")}</Text>
        <Tag label={t("create.ideasReady", { count: 21 })} tone="white" style={{ paddingVertical: 2, boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }} />
      </View>
      <Text style={[bodyMuted, { paddingTop: 4 }]}>{t("ideas.subtitle")}</Text>

      <ChipRow style={{ marginTop: space[24] }} bleed={20}>
        {ideaFilters.map((f) => (
          <Chip key={f.key} label={t(`ideas.filter.${f.key}`, { n: f.count })} selected={f.key === filter} onPress={() => setFilter(f.key)} />
        ))}
      </ChipRow>

      <View style={{ gap: space[24], paddingTop: space[24] }}>
        {ideas.map((idea) => (
          <View key={idea.id} style={styles.card}>
            <View>
              <Image source={idea.image} style={styles.photo} contentFit="cover" accessibilityLabel={idea.product} />
              <View style={styles.angle}>
                <Video size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
                <Text style={[meta, { color: color.ink }]}>{t("ideas.angle", { n: idea.angle })}</Text>
              </View>
            </View>
            <View style={styles.tags}>
              {[t("seconds", { count: idea.seconds }), t("noPresenter"), idea.product].map((tag) => (
                <Tag key={tag} label={tag} tone="soft" />
              ))}
            </View>
            <View style={{ paddingTop: space[12] }}>
              <Text style={[type.label]}>{idea.hook}</Text>
              <Text style={[bodyMuted, { paddingTop: 4 }]}>{t(idea.bodyKey)}</Text>
            </View>
            <View style={styles.cardFoot}>
              <Text style={meta}>{t("ideas.readyToReview")}</Text>
              <ActionButton label={t("ideas.viewStoryboard")} trailing={ChevronRight} onPress={() => router.push("/reels/storyboard")} />
            </View>
          </View>
        ))}
      </View>
    </ReelsScreen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  card: {
    padding: space[16],
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.card,
    boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
  },
  photo: { height: 176, borderRadius: radius.control, backgroundColor: "#EEEDF7" },
  angle: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: space[8],
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(232,231,237,0.7)",
  },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space[8], paddingTop: space[16] },
  cardFoot: {
    marginTop: space[16],
    paddingTop: space[12],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
});
