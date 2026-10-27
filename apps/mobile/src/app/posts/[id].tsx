import type { ReactNode } from "react";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { Camera, EllipsisVertical, Pencil, Scan } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/ui/button";
import { Card } from "@/ui/layout";
import { color, radius, space, type } from "@/theme/tokens";
import { BottomNav, PageHeader, PostsScreen } from "@/ui/posts/chrome";
import { Badge, tint } from "@/ui/posts/controls";
import { POSTS, STATUS_KEY, getPost, isLockedIn, splitCaption } from "@/ui/posts/sample";

const editIcon = require("../../../assets/figma/posts/btn-edit.svg");
const scheduleIcon = require("../../../assets/figma/posts/btn-schedule-white.svg");

/** P03 · Posts / Post detail: the 4:5 visual, its caption and where it will publish. */
export default function PostDetail() {
  const { t } = useTranslation("posts");
  const { id } = useLocalSearchParams<{ id: string }>();
  const post = getPost(id) ?? POSTS[0];
  const { text, tags } = splitCaption(post.caption);
  const edit = () => router.push({ pathname: "/posts/edit", params: { id: post.id } });

  return (
    <PostsScreen
      header={
        <PageHeader
          title={t("detail.title")}
          right={
            <View style={styles.row8}>
              <Badge style={{ borderColor: "#E5E5E5" }}>{isLockedIn(post.status) ? t(STATUS_KEY[post.status]) : t("status.draft")}</Badge>
              <Pressable accessibilityRole="button" accessibilityLabel={t("detail.moreOptions")} style={styles.icon44}>
                <EllipsisVertical size={20} color={color.ink} strokeWidth={1.75} />
              </Pressable>
            </View>
          }
        />
      }
      nav={<BottomNav active="posts" />}
      contentStyle={{ paddingHorizontal: space[16], paddingTop: space[12], paddingBottom: space[24] }}
    >
      <View style={styles.visual}>
        <Image source={post.image} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={post.title} />
        <View style={styles.ratio}>
          <Text style={[type.meta, { color: color.onPrimary }]}>{t("detail.feedPhoto")}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t("detail.fullscreen")} style={styles.fullscreen}>
          <Scan size={20} color={color.ink} strokeWidth={1.75} />
        </Pressable>
      </View>

      <Card style={{ marginTop: space[12] }}>
        <View style={styles.between}>
          <Text style={styles.eyebrow}>{t("detail.captionFrench")}</Text>
          <Pressable accessibilityRole="button" onPress={edit} style={[styles.row8, { gap: space[4], minHeight: 44 }]}>
            <Pencil size={20} color={color.ink} strokeWidth={1.75} />
            <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]}>{t("detail.editText")}</Text>
          </Pressable>
        </View>
        <Text style={[type.body, { paddingTop: space[8] }]}>{text}</Text>
        {tags.length ? <Text style={[type.meta, { paddingTop: space[12] }]}>{tags.join(" ")}</Text> : null}
      </Card>

      <Card style={{ marginTop: space[12] }}>
        <Text style={styles.eyebrow}>{t("detail.channels")}</Text>
        <View style={{ paddingTop: space[12], gap: space[8] }}>
          <Channel
            tile={
              <LinearGradient colors={["#F59E0B", "#F43F5E", "#9333EA"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tile}>
                <Camera size={16} color={color.onPrimary} strokeWidth={1.75} />
              </LinearGradient>
            }
            name={t("detail.instagramFeed")}
            detail={t("detail.instagramDetail")}
          />
          <Channel
            tile={
              <View style={[styles.tile, { backgroundColor: "#2563EB" }]}>
                <Text style={[type.meta, { color: color.onPrimary }]}>f</Text>
              </View>
            }
            name={t("detail.facebookPage")}
            detail={t("detail.facebookDetail")}
          />
        </View>
      </Card>

      <View style={styles.actions}>
        <Button label={t("detail.editPost")} variant="outline" icon={editIcon} style={{ flex: 1 }} onPress={edit} />
        <Button label={t("detail.schedule")} icon={scheduleIcon} style={{ flex: 1 }} onPress={() => router.push({ pathname: "/posts/schedule", params: { id: post.id } })} />
      </View>
    </PostsScreen>
  );
}

function Channel({ tile, name, detail }: { tile: ReactNode; name: string; detail: string }) {
  const { t } = useTranslation("posts");
  return (
    <View style={styles.channel} accessibilityLabel={t("detail.channelNotConnected", { name })}>
      <View style={[styles.row8, { gap: space[12], flex: 1 }]}>
        {tile}
        <View style={{ flex: 1 }}>
          <Text style={[type.meta, { color: color.ink }]}>{name}</Text>
          <Text style={type.meta}>{detail}</Text>
        </View>
      </View>
      <Text style={[type.label, { fontFamily: "Inter_600SemiBold", color: color.inkSecondary }]}>{t("detail.notConnected")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row8: { flexDirection: "row", alignItems: "center", gap: space[8] },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  icon44: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.control },
  visual: { aspectRatio: 4 / 5, borderRadius: radius.control, overflow: "hidden", backgroundColor: "#F5F5F5", borderWidth: 1, borderColor: "rgba(229,229,229,0.8)" },
  ratio: { position: "absolute", top: 12, left: 12, paddingVertical: 2, paddingHorizontal: space[8], borderRadius: radius.badge, backgroundColor: "#211D2A" },
  fullscreen: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.controlOutline,
    borderRadius: radius.control,
  },
  eyebrow: { ...type.meta, fontFamily: "Inter_600SemiBold", letterSpacing: 0.18 },
  tile: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: radius.control },
  channel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[8],
    padding: space[8],
    backgroundColor: tint.well,
    borderWidth: 1,
    borderColor: tint.hair,
    borderRadius: radius.control,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: space[8], paddingTop: space[20] },
});
