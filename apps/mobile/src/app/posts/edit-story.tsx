import type { ReactNode } from "react";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, BadgeCheck, Crop, MousePointer2, Type, Undo2 } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/ui/button";
import { color, radius, space, type } from "@/theme/tokens";
import { BusinessChip, glass } from "@/ui/posts/chrome";
import { POSTS, POST_COPY, getPost } from "@/ui/posts/sample";

const TOOLS = [
  { key: "text", Icon: Type },
  { key: "image", Icon: Crop },
  { key: "brand", Icon: BadgeCheck },
  { key: "cta", Icon: MousePointer2 },
] as const;

/** P08 · Posts / Edit story: full-bleed 9:16 canvas with overlay text, tool rail and caption sticker. */
export default function EditStory() {
  const { t } = useTranslation("posts");
  const { id } = useLocalSearchParams<{ id?: string }>();
  const story = getPost(id) ?? POSTS.find((p) => p.channel === "INSTAGRAM_STORY" && !p.scheduledFor)!;
  const copy = POST_COPY[story.id] ?? {};
  const insets = useSafeAreaInsets();
  const back = () => (router.canGoBack() ? router.back() : router.navigate("/posts/stories"));

  return (
    <View style={styles.screen}>
      <Image source={story.image} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={story.title} />
      <LinearGradient colors={["rgba(0,0,0,0.6)", "rgba(0,0,0,0.2)", "rgba(0,0,0,0.9)"]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { marginTop: insets.top }]}>
        <GlassButton label={t("editStory.back")} onPress={back}>
          <ArrowLeft size={20} color={color.onPrimary} strokeWidth={1.75} />
        </GlassButton>
        <BusinessChip dark />
        <GlassButton label={t("editStory.undo")}>
          <Undo2 size={20} color={color.onPrimary} strokeWidth={1.75} />
        </GlassButton>
      </View>

      <View style={styles.body}>
        <View style={styles.overlay}>
          {copy.kicker ? (
            <View style={styles.kicker}>
              <Text style={styles.kickerText}>{copy.kicker}</Text>
            </View>
          ) : null}
          <Text style={styles.headline} accessibilityRole="header">
            {copy.headline ?? story.title}
          </Text>
        </View>
        <View style={styles.tools}>
          {TOOLS.map(({ key, Icon }) => {
            const label = t(`editStory.tools.${key}`);
            return (
              <Pressable key={key} accessibilityRole="button" accessibilityLabel={t("editStory.toolLabel", { tool: label })} style={({ pressed }) => [styles.tool, pressed && { opacity: 0.85 }]}>
                <Icon size={20} color={color.ink} strokeWidth={1.75} />
                <Text style={type.label}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.8)", "#000000"]} style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, space[16]) }]}>
        <View style={styles.caption}>
          <View style={styles.captionHead}>
            <Text style={[type.meta, { color: color.onPrimary }]}>{t("editStory.captionTitle")}</Text>
            <Text style={[type.meta, { color: color.onPrimary }]}>{t("editStory.languageCode")}</Text>
          </View>
          <Text style={[type.body, { color: color.onPrimary, paddingTop: space[4] }]}>{story.caption}</Text>
        </View>
        <View style={styles.actions}>
          <Button label={t("editStory.saveDraft")} variant="outline" style={{ flex: 1 }} onPress={back} />
          <Button label={t("editStory.scheduleStory")} arrow style={{ flex: 2 }} onPress={() => router.push({ pathname: "/posts/schedule", params: { id: story.id } })} />
        </View>
      </LinearGradient>
    </View>
  );
}

function GlassButton({ label, onPress, children }: { label: string; onPress?: () => void; children: ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.glassBtn, pressed && { opacity: 0.8 }]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  header: { height: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space[16] },
  glassBtn: { ...glass, width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.control },
  body: { flex: 1, flexDirection: "row", paddingTop: 64, paddingRight: 14 },
  overlay: { width: 290, marginLeft: space[16], marginTop: space[8], padding: space[16], alignItems: "center", gap: space[12] },
  kicker: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: radius.badge, backgroundColor: "rgba(238,234,252,0.12)" },
  kickerText: { fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 18, letterSpacing: 0.18, color: color.onPrimary, textAlign: "center" },
  headline: {
    ...type.pageTitle,
    color: color.onPrimary,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.07)",
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 4 },
  },
  tools: { marginLeft: "auto", gap: space[12] },
  tool: {
    width: 48,
    height: 56,
    gap: space[8],
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.controlOutline,
    borderRadius: radius.control,
  },
  bottom: { paddingTop: space[24], paddingHorizontal: space[16] },
  caption: { padding: space[12], backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderRadius: radius.control },
  captionHead: { flexDirection: "row", justifyContent: "space-between" },
  actions: { flexDirection: "row", alignItems: "center", gap: space[8], paddingTop: space[12] },
});
