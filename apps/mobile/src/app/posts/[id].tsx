import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Camera, Check, Pencil } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { postRelease, posts, type PostCampaign, type PostChannel, type PostRelease } from "@/api/endpoints";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { Card } from "@/ui/layout";
import { color, radius, space, type } from "@/theme/tokens";
import { BottomNav, PageHeader, PostsScreen } from "@/ui/posts/chrome";
import { Badge, tint } from "@/ui/posts/controls";
import { STATUS_KEY } from "@/ui/posts/format";
import { coverSource, coverUrl, reloadPosts, usePost } from "@/ui/posts/use-posts";
import { usePermissions } from "@/ui/use-permissions";

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

/** "Offer: Black Friday · -20 % · 2026-11-27 08:00 – 2026-11-30 20:00 (Paris)", "Priority: Oak dining". Times are the brand's, numeric. */
function campaignLine(c: PostCampaign, t: (key: string) => string) {
  const head = `${t(`detail.campaignKind.${c.kind}`)}: ${c.name}`;
  if (c.withdrawn) return `${head} (${t("detail.withdrawn")})`;
  const zone = c.timeZone.split("/").pop()!.replace(/_/g, " ");
  const parts = [c.discountPercent ? `-${c.discountPercent} %` : null, c.code, c.ends ? `${c.starts} – ${c.ends} (${zone})` : null];
  return [head, ...parts.filter(Boolean)].join(" · ");
}

/** P03 · Posts / Post detail: the 4:5 visual, its caption and where it will publish. */
export default function PostDetail() {
  const { t } = useTranslation("posts");
  const { id } = useLocalSearchParams<{ id: string }>();
  const { post, loading, error } = usePost(id);
  const [release, setRelease] = useState<PostRelease | null>(null);
  // On every focus too: scheduling from the next screen changes the release without a new version.
  const version = post?.latest?.version;
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      const ctrl = new AbortController();
      postRelease(id, ctrl.signal).then(setRelease, () => {});
      return () => ctrl.abort();
    }, [id, version]), // eslint-disable-line react-hooks/exhaustive-deps -- a new version re-reads where it can go
  );
  const edit = () => router.push({ pathname: "/posts/edit", params: { id } });
  const { can } = usePermissions();
  const [settling, setSettling] = useState(false);
  // "Fix it" was tapped on this version: the writer is on it until a newer version lands.
  const [fixing, setFixing] = useState<number | null>(null);
  const [fixError, setFixError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [approvingAnyway, setApprovingAnyway] = useState(false);
  // "Ask for changes" on a product issue: null = not touched yet (prefilled from the issues / the default below).
  const [askNote, setAskNote] = useState<string | null>(null);
  const [switchPick, setSwitchPick] = useState<boolean | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
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
    setFixError(null);
    setAsking(true);
    try {
      await posts.rewrite(post.id, post.latest?.version ?? 0);
      setFixing(post.latest?.version ?? 0);
      setSlowAt(null);
    } catch (e) {
      setFixError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  };
  const account = release?.accounts[0];
  // Schedule approves this draft first: only once the writer and the check are done with it, and only for people who
  // may (publish.execute, and content.approve when it still needs approving).
  const ready = post.status === "AWAITING_APPROVAL" || post.status === "APPROVED";
  const allowed = can("publish.execute") && (post.status !== "AWAITING_APPROVAL" || can("content.approve"));
  // The live publish attempt: a scheduled one can be cancelled; an uncertain one (CHECK) needs the person to look.
  const scheduled = release?.attempts.find((a) => a.status === "SCHEDULED");
  const uncertain = release?.attempts.find((a) => a.status === "PENDING_VERIFY");
  // Issues (a product sold out, removed or repriced; the offer ended or changed) on a post that is waiting, approved or scheduled. A refusing
  // one blocks Schedule; approvers can send it back here, or approve past it when every refusing issue is overridable
  // (stock, an ended offer) and they also hold rules.approve, as on the web.
  const issues = ["AWAITING_APPROVAL", "APPROVED", "SCHEDULED"].includes(post.status) ? (release?.productIssues ?? []) : [];
  const refused = issues.some((i) => i.refuses);
  const canAsk = issues.length > 0 && (post.status === "AWAITING_APPROVAL" || post.status === "APPROVED") && can("content.approve");
  const canAnyway = canAsk && refused && can("rules.approve") && issues.every((i) => !i.refuses || i.overridable);
  // Prefilled with the issues for "Ask for changes"; empty when "Approve anyway" is on offer (its note says why it can go out).
  const note = askNote ?? (canAnyway ? "" : issues.map((i) => i.message).join("\n"));
  const unavailable = issues.some((i) => i.refuses && i.kind === "availability");
  const switchProducts = switchPick ?? unavailable;
  const approveAnyway = async () => {
    if (!note.trim()) return setAskError(t("detail.anywayNeeded"));
    setAskError(null);
    setApprovingAnyway(true);
    try {
      setRelease(await posts.approveAnyway(post.id, post.latest?.version ?? 0, note.trim()));
      setAskNote(null);
      await reloadPosts();
    } catch (e) {
      setAskError(e instanceof Error ? e.message : String(e));
    } finally {
      setApprovingAnyway(false);
    }
  };
  const askChanges = async () => {
    if (!note.trim()) return setAskError(t("detail.noteNeeded"));
    setAskError(null);
    setAsking(true);
    try {
      setRelease(await posts.sendBack(post.id, post.latest?.version ?? 0, note.trim(), switchProducts));
      setAskNote(null);
      setSwitchPick(null);
      await reloadPosts();
    } catch (e) {
      setAskError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  };
  const settle = async (attemptId: string, action: "cancel" | "posted" | "not-posted") => {
    setSettling(true);
    setFixError(null);
    try {
      setRelease(await posts.settle(post.id, attemptId, action));
      await reloadPosts();
    } catch (e) {
      setFixError(e instanceof Error ? e.message : String(e));
    } finally {
      setSettling(false);
    }
  };

  return (
    <PostsScreen
      header={
        <PageHeader
          title={t("detail.title")}
          right={
            <Badge style={{ borderColor: "#E5E5E5" }}>{t(STATUS_KEY[post.status])}</Badge>
          }
        />
      }
      nav={<BottomNav active="posts" />}
      contentStyle={{ paddingHorizontal: space[16], paddingTop: space[12], paddingBottom: space[24] }}
    >
      <View style={styles.visual}>
        {coverUrl(post) ? <Image source={coverSource(post)} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={body?.altText || post.title} /> : null}
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

      {post.publishIssue === "FAILED" && post.publishError ? (
        <Card style={{ marginTop: space[12], gap: space[4] }}>
          <Text style={styles.eyebrow}>{t("detail.publishFailed")}</Text>
          <Text style={type.body}>{post.publishError}</Text>
        </Card>
      ) : null}
      {uncertain ? (
        <Card style={{ marginTop: space[12], gap: space[8] }}>
          <Text style={styles.eyebrow}>{t("detail.checkAccount", { account: uncertain.account })}</Text>
          {uncertain.error ? <Text style={type.body}>{uncertain.error}</Text> : null}
          <View style={styles.actions}>
            <Button label={t("detail.wasPosted")} variant="outline" height={44} style={{ flex: 1 }} disabled={settling} onPress={() => void settle(uncertain.id, "posted")} />
            <Button label={t("detail.notPosted")} variant="outline" height={44} style={{ flex: 1 }} disabled={settling} onPress={() => void settle(uncertain.id, "not-posted")} />
          </View>
        </Card>
      ) : null}
      {release?.campaign ? (
        <Card style={{ marginTop: space[12] }}>
          <Text style={type.body}>{campaignLine(release.campaign, t)}</Text>
        </Card>
      ) : null}
      {issues.length ? (
        <Card style={{ marginTop: space[12], gap: space[8] }}>
          <Text style={styles.eyebrow}>{t("detail.issues")}</Text>
          {issues.map((i) => (
            <Text key={(i.productId ?? i.campaignId) + i.kind + i.message} style={[type.body, i.refuses && { color: color.error }]}>
              {i.message}
              {!i.refuses && i.overridable ? ` ${t("detail.approvedAnyway")}` : ""}
            </Text>
          ))}
          {canAsk ? (
            <>
              <Field label={t(canAnyway ? "detail.decisionNote" : "detail.askNote")} multiline value={note} onChangeText={setAskNote} maxLength={canAnyway ? 500 : 2000} error={askError} />
              {issues.some((i) => i.kind !== "offer") ? (
                <>
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: switchProducts }} onPress={() => setSwitchPick(!switchProducts)} style={[styles.row8, { minHeight: 44 }]}>
                    <View style={[styles.box, switchProducts && { backgroundColor: color.primary, borderColor: color.primary }]}>
                      {switchProducts ? <Check size={14} color={color.onPrimary} strokeWidth={2.5} /> : null}
                    </View>
                    <Text style={type.body}>{t("detail.suggestProduct")}</Text>
                  </Pressable>
                  {!switchProducts && unavailable ? <Text style={type.meta}>{t("detail.productStays")}</Text> : null}
                </>
              ) : null}
              {canAnyway ? <Button label={approvingAnyway ? t("detail.approving") : t("detail.approveAnyway")} height={44} disabled={asking || approvingAnyway} onPress={() => void approveAnyway()} /> : null}
              <Button label={asking ? t("detail.sending") : t("detail.askChanges")} variant="outline" height={44} disabled={asking || approvingAnyway} onPress={() => void askChanges()} />
            </>
          ) : null}
        </Card>
      ) : null}
      {fixError && !blocked ? <Text style={[type.meta, { color: color.error, paddingTop: space[12] }]}>{fixError}</Text> : null}
      {working ? (
        <View style={{ paddingTop: space[16], gap: space[8] }}>
          <Text style={type.meta} accessibilityLiveRegion="polite">
            {slow ? t("detail.slow") : t("detail.notReady")}
          </Text>
          {slow ? <Button label={asking ? t("edit.regenerating") : t("detail.tryAgain")} variant="outline" height={44} disabled={asking} onPress={() => void fix()} /> : null}
        </View>
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
      {scheduled ? (
        <View style={styles.actions}>
          <Button label={settling ? t("detail.cancelling") : t("detail.cancelSchedule")} variant="outline" style={{ flex: 1 }} disabled={settling || !can("publish.execute")} onPress={() => void settle(scheduled.id, "cancel")} />
        </View>
      ) : (
        <View style={styles.actions}>
          <Button label={t("detail.editPost")} variant="outline" icon={editIcon} style={{ flex: 1 }} onPress={edit} />
          <Button label={t("detail.schedule")} icon={scheduleIcon} style={{ flex: 1 }} disabled={!ready || !allowed || refused} onPress={() => router.push({ pathname: "/posts/schedule", params: { id: post.id } })} />
        </View>
      )}
      {ready && refused ? (
        <Text style={[type.meta, { paddingTop: space[8] }]}>{t(canAnyway ? "detail.nextAnyway" : can("content.approve") ? "detail.nextAskChanges" : "detail.approverNeeded")}</Text>
      ) : ready && !allowed ? (
        <Text style={[type.meta, { paddingTop: space[8] }]}>{t("detail.noPermission")}</Text>
      ) : null}
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
  box: { width: 20, height: 20, alignItems: "center", justifyContent: "center", borderRadius: 4, borderWidth: 1.5, borderColor: color.controlOutline },
  actions: { flexDirection: "row", alignItems: "center", gap: space[8], paddingTop: space[20] },
});
