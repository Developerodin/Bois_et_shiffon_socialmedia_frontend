import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Ellipsis } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/ui/button";
import { color, radius, space, type } from "@/theme/tokens";
import { BottomNav, BusinessSwitcher, ModuleHeader, PostsScreen } from "@/ui/posts/chrome";
import { Pill } from "@/ui/posts/controls";
import { POSTS, POST_COPY, type Post } from "@/ui/posts/sample";

const plus = require("../../../assets/figma/posts/btn-plus-white.svg");

/** P07 · Posts / Stories: 9:16 story drafts and scheduled stories. */
export default function Stories() {
  const { t } = useTranslation("posts");
  const stories = POSTS.filter((p) => p.channel === "INSTAGRAM_STORY");
  const drafts = stories.filter((s) => !s.scheduledFor);
  const scheduled = stories.filter((s) => s.scheduledFor);
  const [filter, setFilter] = useState<"drafts" | "scheduled">("drafts");
  const shown = filter === "drafts" ? drafts : scheduled;

  return (
    <PostsScreen header={<ModuleHeader />} nav={<BottomNav active="stories" />}>
      <View style={{ height: 56 }}>
        <BusinessSwitcher />
      </View>
      <View style={styles.titleRow}>
        <View style={{ flexShrink: 1 }}>
          <Text style={type.pageTitle} accessibilityRole="header">
            {t("stories.title")}
          </Text>
          <Text style={type.meta}>{t("stories.subtitle")}</Text>
        </View>
        <Button label={t("stories.newStory")} icon={plus} onPress={() => router.push("/posts/edit-story")} />
      </View>

      <View style={styles.filters} accessibilityRole="radiogroup" accessibilityLabel={t("stories.statusLabel")}>
        <Pill label={t("stories.drafts", { count: drafts.length })} selected={filter === "drafts"} onPress={() => setFilter("drafts")} />
        <Pill label={t("stories.scheduled", { count: scheduled.length })} selected={filter === "scheduled"} onPress={() => setFilter("scheduled")} />
      </View>

      <View style={styles.grid}>
        {shown.map((s) => (
          <StoryCard key={s.id} story={s} />
        ))}
        {shown.length % 2 ? <View style={{ flex: 1 }} /> : null}
      </View>
    </PostsScreen>
  );
}

function StoryCard({ story }: { story: Post }) {
  const { t } = useTranslation("posts");
  const copy = POST_COPY[story.id] ?? {};
  return (
    <View style={styles.card}>
      <Image source={story.image} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={story.title} />
      <LinearGradient colors={["rgba(0,0,0,0.3)", "rgba(0,0,0,0)", "rgba(0,0,0,0.8)"]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
      <View style={styles.top}>
        <View style={styles.sample}>
          <Text style={styles.sampleText}>{t("stories.samplePreview")}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t("stories.moreOptions", { title: story.title })} hitSlop={10} style={styles.more}>
          <Ellipsis size={16} color={color.onPrimary} strokeWidth={1.75} />
        </Pressable>
      </View>
      <View style={styles.bottom}>
        <Text style={styles.title}>{story.title}</Text>
        {copy.tagline ? <Text style={[type.meta, { color: color.onPrimary, paddingBottom: space[8] }]}>{copy.tagline}</Text> : null}
        <Button label={t("stories.editStory")} variant="outline" height={44} onPress={() => router.push({ pathname: "/posts/edit-story", params: { id: story.id } })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[12] },
  filters: { flexDirection: "row", gap: space[8], paddingTop: 14, paddingBottom: space[4] },
  grid: { flexDirection: "row", gap: space[16], paddingTop: space[12], paddingBottom: space[16] },
  card: {
    flex: 1,
    aspectRatio: 167 / 297,
    borderRadius: radius.control,
    overflow: "hidden",
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#E5E5E5",
  },
  top: { position: "absolute", top: 12, left: 12, right: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sample: { paddingVertical: 2, paddingHorizontal: space[8], borderRadius: radius.badge, backgroundColor: "#211D2A" },
  sampleText: { fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 20, color: color.onPrimary },
  more: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: radius.badge, backgroundColor: "rgba(0,0,0,0.4)" },
  bottom: { position: "absolute", left: 12, right: 12, bottom: 12, padding: space[8] },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    lineHeight: 20,
    color: color.onPrimary,
    textShadowColor: "rgba(0,0,0,0.1)",
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
});
