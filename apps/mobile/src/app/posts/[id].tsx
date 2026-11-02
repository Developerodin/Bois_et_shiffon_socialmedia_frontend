import { useEffect, useState, type ReactNode } from "react";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { Camera, Pencil } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { postRelease, posts, type PostChannel, type PostRelease } from "@/api/endpoints";
import { Button } from "@/ui/button";
import { Card } from "@/ui/layout";
import { color, radius, space, type } from "@/theme/tokens";
import { BottomNav, PageHeader, PostsScreen } from "@/ui/posts/chrome";
import { Badge, tint } from "@/ui/posts/controls";
import { STATUS_KEY, isLockedIn } from "@/ui/posts/sample";
import { coverUrl, reloadPosts, usePost } from "@/ui/posts/use-posts";

const editIcon = require("../../../assets/figma/posts/btn-edit.svg");
const scheduleIcon = require("../../../assets/figma/posts/btn-schedule-white.svg");

/** Instagram, Facebook, Pinterest, Threads: the channel the post is planned for (one per post). */
const CHANNEL_NAME: Record<PostChannel, string> = {
  INSTAGRAM_POST: "detail.instagramFeed",
  INSTAGRAM_CAROUSEL: "detail.instagramCarousel",
  INSTAGRAM_REEL: "detail.instagramReel",
  FACEBOOK_POST: "detail.facebookPage",
  PINTEREST_PIN: "detail.pinterest",
  THREADS_POST: "detail.threads",
};

/** P03 · Posts / Post detail: the 4:5 visual, its caption and where it will publish. */
export default function PostDetail() {
  const { t } = useTranslation("posts");
  const { id } = useLocalSearchParams<{ id: string }>();
  const { post, loading, error } = usePost(id);
  const [release, setRelease] = useState<PostRelease | null>(null);
  useEffect(() => {
    if (!id) return;
    const ctrl = new AbortController();
    postRelease(id, ctrl.signal).then(setRelease, () => {});
    return () => ctrl.abort();
  }, [id, post?.latest?.version]);
  const edit = () => router.push({ pathname: "/posts/edit", params: { id } });
  // "Fix it" was tapped on this version: the writer is on it until a newer version lands.
  const [fixing, setFixing] = useState<number | null>(null);
  const [fixError, setFixError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  // Being written (BRIEF_READY), sent back for a rewrite, or waiting for its check: re-read every 5 s so the new
  // draft shows up on its own, for up to 3 minutes (a writer that never starts mustn't poll forever).
  const working =
    post?.status === "BRIEF_READY" ||
    (post?.status === "DRAFT_REVIEW" && (!post.latest?.check || post.latest.review?.verdict === "CHANGES_REQUESTED" || fixing === post.latest.version));
  // The draft version that took too long (a newer one starts the wait again).
  const [slowAt, setSlowAt] = useState<number | null>(null);
  const waitingOn = post?.latest?.version ?? 0;
  const slow = slowAt === waitingOn;
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => void reloadPosts(), 5000);
    const stop = setTimeout(() => (clearInterval(timer), setSlowAt(waitingOn)), 3 * 60_000);
    return () => (clearInterval(timer), clearTimeout(stop));
  }, [working, waitingOn]);

  if (!post) {
    return (
      <PostsScreen header={<PageHeader title={t("detail.title")} />} nav={<BottomNav active="posts" />} contentStyle={{ padding: space[16] }}>
        {loading ? <ActivityIndicator color={color.primary} /> : <Text style={type.body}>{error ? t("today.loadFailed") : t("detail.notFound")}</Text>}
      </PostsScreen>
    );
  }
  const body = post.latest?.body;
  const blocked = !working && post.status === "DRAFT_REVIEW" && post.latest?.check?.overall === "BLOCKER";
  const problems = blocked ? (post.latest?.check?.results ?? []).filter((r) => r.status === "blocker") : [];
  const fix = async () => {
    if (!post.latest) return;
    setFixError(null);
    setAsking(true);
    try {
      await posts.rewrite(post.id, post.latest.version);
      setFixing(post.latest.version);
    } catch (e) {
      setFixError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  };
  const account = release?.accounts[0];
  // Schedule approves this draft first: only once the writer and the check are done with it.
  const ready = post.status === "AWAITING_APPROVAL" || post.status === "APPROVED";

  return (
    <PostsScreen
      header={
        <PageHeader
          title={t("detail.title")}
          right={
            <Badge style={{ borderColor: "#E5E5E5" }}>{isLockedIn(post.status) ? t(STATUS_KEY[post.status]) : t("status.draft")}</Badge>
          }
        />
      }
      nav={<BottomNav active="posts" />}
      contentStyle={{ paddingHorizontal: space[16], paddingTop: space[12], paddingBottom: space[24] }}
    >
      <View style={styles.visual}>
        {coverUrl(post) ? <Image source={{ uri: coverUrl(post)! }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={body?.altText || post.title} /> : null}
        <View style={styles.ratio}>
          <Text style={[type.meta, { color: color.onPrimary }]}>{t("detail.feedPhoto")}</Text>
        </View>
      </View>

      <Card style={{ marginTop: space[12] }}>
        <View style={styles.between}>
          <Text style={styles.eyebrow}>{t("detail.caption")}</Text>
          <Pressable accessibilityRole="button" onPress={edit} style={[styles.row8, { gap: space[4], minHeight: 44 }]}>
            <Pencil size={20} color={color.ink} strokeWidth={1.75} />
            <Text style={[type.label, { fontFamily: "Inter_600SemiBold" }]}>{t("detail.editText")}</Text>
          </Pressable>
        </View>
        <Text style={[type.body, { paddingTop: space[8] }]}>{body?.caption || t("detail.noDraft")}</Text>
        {body?.hashtags.length ? <Text style={[type.meta, { paddingTop: space[12] }]}>{body.hashtags.join(" ")}</Text> : null}
      </Card>

      <Card style={{ marginTop: space[12] }}>
        <Text style={styles.eyebrow}>{t("detail.channels")}</Text>
        <View style={{ paddingTop: space[12], gap: space[8] }}>
          <Channel
            tile={
              post.channel.startsWith("INSTAGRAM") ? (
                <LinearGradient colors={["#F59E0B", "#F43F5E", "#9333EA"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tile}>
                  <Camera size={16} color={color.onPrimary} strokeWidth={1.75} />
                </LinearGradient>
              ) : (
                <View style={[styles.tile, { backgroundColor: post.channel === "FACEBOOK_POST" ? "#2563EB" : post.channel === "PINTEREST_PIN" ? "#E60023" : "#101014" }]}>
                  <Text style={[type.meta, { color: color.onPrimary }]}>{post.channel === "FACEBOOK_POST" ? "f" : post.channel === "PINTEREST_PIN" ? "P" : "@"}</Text>
                </View>
              )
            }
            name={t(CHANNEL_NAME[post.channel])}
            detail={account ? account.displayName : t("detail.instagramDetail")}
            connected={release ? !!account : undefined}
          />
        </View>
      </Card>

      {working ? (
        <Text style={[type.meta, { paddingTop: space[16] }]} accessibilityLiveRegion="polite">
          {slow ? t("detail.slow") : t("detail.notReady")}
        </Text>
      ) : blocked ? (
        <Card style={{ marginTop: space[12], gap: space[8] }}>
          <Text style={styles.eyebrow}>{t("detail.checkFound")}</Text>
          {problems.map((r) => (
            <Text key={r.check} style={type.body}>
              {`${r.check}: ${r.note}`}
            </Text>
          ))}
          {fixError ? <Text style={[type.meta, { color: color.error }]}>{fixError}</Text> : null}
          <Button label={asking ? t("edit.regenerating") : t("detail.fixIt")} variant="outline" height={44} disabled={asking} onPress={() => void fix()} />
        </Card>
      ) : null}
      <View style={styles.actions}>
        <Button label={t("detail.editPost")} variant="outline" icon={editIcon} style={{ flex: 1 }} onPress={edit} />
        <Button label={t("detail.schedule")} icon={scheduleIcon} style={{ flex: 1 }} disabled={!ready} onPress={() => router.push({ pathname: "/posts/schedule", params: { id: post.id } })} />
      </View>
    </PostsScreen>
  );
}

/** connected: undefined while the accounts load (no label yet). */
function Channel({ tile, name, detail, connected }: { tile: ReactNode; name: string; detail: string; connected?: boolean }) {
  const { t } = useTranslation("posts");
  return (
    <Pressable
      style={styles.channel}
      accessibilityRole="button"
      accessibilityLabel={connected === false ? t("detail.channelNotConnected", { name }) : name}
      onPress={() => router.push("/business/connections")}
    >
      <View style={[styles.row8, { gap: space[12], flex: 1 }]}>
        {tile}
        <View style={{ flex: 1 }}>
          <Text style={[type.meta, { color: color.ink }]}>{name}</Text>
          <Text style={type.meta}>{detail}</Text>
        </View>
      </View>
      {connected === undefined ? null : (
        <Text style={[type.label, { fontFamily: "Inter_600SemiBold", color: connected ? color.ink : color.inkSecondary }]}>{connected ? t("detail.connected") : t("detail.notConnected")}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row8: { flexDirection: "row", alignItems: "center", gap: space[8] },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  visual: { aspectRatio: 4 / 5, borderRadius: radius.control, overflow: "hidden", backgroundColor: "#F5F5F5", borderWidth: 1, borderColor: "rgba(229,229,229,0.8)" },
  ratio: { position: "absolute", top: 12, left: 12, paddingVertical: 2, paddingHorizontal: space[8], borderRadius: radius.badge, backgroundColor: "#211D2A" },
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
