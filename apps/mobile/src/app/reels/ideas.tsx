import { Image } from "expo-image";
import { router } from "expo-router";
import { ChevronRight, Video } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { type Opportunity, opportunities, reels } from "@/api/endpoints";
import { color, radius, space, type } from "@/theme/tokens";
import { ActionButton, BottomNav, Chip, ChipRow, ICON, ModuleHeader, ReelsScreen, Tag, bodyMuted, meta } from "@/ui/reels/kit";
import { openReel } from "@/ui/reels/use-reel";
import { libraryPhotos, useCurrentBrand } from "@/ui/use-current-brand";

/** Scout writes reel angles as "[hook · pillar] angle"; split them for the chips and the card. */
function parseAngle(o: Opportunity) {
  const m = /^\[([^\]·]+)·([^\]]+)\]\s*(.*)$/.exec(o.angle);
  return m ? { hook: m[1].trim(), pillar: m[2].trim(), text: m[3].trim() } : { hook: null, pillar: null, text: o.angle };
}

/** R02 · Reels / Ideas. */
export default function ReelsIdeas() {
  const { t } = useTranslation("reels");
  const [filter, setFilter] = useState<string>("all");
  const [ideas, setIdeas] = useState<Opportunity[] | null>(null);
  const brand = useCurrentBrand();
  const images = libraryPhotos(brand?.view).map((p) => p.url);
  const [making, setMaking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    opportunities().then(
      (r) => setIdeas(r.opportunities.filter((o) => o.channels.includes("INSTAGRAM_REEL") && o.decision !== "REJECT")),
      (e: unknown) => (setIdeas([]), setError(e instanceof Error ? e.message : String(e))),
    );
  }, []);
  const pillars = [...new Set((ideas ?? []).map((o) => parseAngle(o).pillar).filter((p): p is string => !!p))];
  const shown = (ideas ?? []).filter((o) => filter === "all" || parseAngle(o).pillar === filter);
  const make = async (o: Opportunity) => {
    setMaking(o.id);
    setError(null);
    try {
      const r = await reels.create({ opportunityId: o.id });
      openReel(r.id);
      router.push("/reels/storyboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMaking(null);
    }
  };
  return (
    <ReelsScreen header={<ModuleHeader />} footer={<BottomNav active="ideas" />}>
      <View style={styles.titleRow}>
        <Text style={type.pageTitle}>{t("ideas.title")}</Text>
        <Tag label={t("create.ideasReady", { count: ideas?.length ?? 0 })} tone="white" style={{ paddingVertical: 2, boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }} />
      </View>
      <Text style={[bodyMuted, { paddingTop: 4 }]}>{t("ideas.subtitle")}</Text>

      <ChipRow style={{ marginTop: space[24] }} bleed={20}>
        <Chip label={t("ideas.filter.all", { n: ideas?.length ?? 0 })} selected={filter === "all"} onPress={() => setFilter("all")} />
        {pillars.map((p) => (
          <Chip key={p} label={`${p} (${(ideas ?? []).filter((o) => parseAngle(o).pillar === p).length})`} selected={filter === p} onPress={() => setFilter(p)} />
        ))}
      </ChipRow>

      {error ? <Text style={[bodyMuted, { color: color.error, paddingTop: space[16] }]}>{error}</Text> : null}
      {ideas === null ? <ActivityIndicator style={{ marginTop: space[32] }} color={color.primary} /> : null}
      {ideas?.length === 0 && !error ? <Text style={[bodyMuted, { paddingTop: space[24] }]}>{t("ideas.empty")}</Text> : null}
      <View style={{ gap: space[24], paddingTop: space[24] }}>
        {shown.map((idea, i) => {
          const a = parseAngle(idea);
          return (
            <View key={idea.id} style={styles.card}>
              <View>
                <Image source={images.length ? { uri: images[i % images.length] } : undefined} style={styles.photo} contentFit="cover" accessibilityLabel={idea.title} />
                <View style={styles.angle}>
                  <Video size={16} color={color.ink} strokeWidth={ICON.strokeWidth} />
                  <Text style={[meta, { color: color.ink }]}>{t("ideas.angle", { n: String(i + 1).padStart(2, "0") })}</Text>
                </View>
              </View>
              <View style={styles.tags}>
                {[a.hook, a.pillar, idea.timing, t("noPresenter")].filter((x): x is string => !!x).map((tag) => (
                  <Tag key={tag} label={tag} tone="soft" />
                ))}
              </View>
              <View style={{ paddingTop: space[12] }}>
                <Text style={[type.label]}>{a.text || idea.title}</Text>
                <Text style={[bodyMuted, { paddingTop: 4 }]}>{idea.summary}</Text>
              </View>
              <View style={styles.cardFoot}>
                <Text style={meta}>{making === idea.id ? t("ideas.making") : t("ideas.readyToReview")}</Text>
                {making === idea.id ? (
                  <ActivityIndicator color={color.primary} />
                ) : (
                  <ActionButton label={t("ideas.viewStoryboard")} trailing={ChevronRight} onPress={() => void make(idea)} disabled={!!making} />
                )}
              </View>
            </View>
          );
        })}
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
